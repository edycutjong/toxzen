import { Hono } from 'hono';
import { redis, scheduler, settings, context, reddit } from '@devvit/web/server';
import type { TaskRequest, TaskResponse } from '@devvit/web/server';
import type { MenuItemRequest, UiResponse } from '@devvit/web/shared';
import type {
  AppealRecord,
  ToxicityAnalysis,
  DailyStats,
  GeminiAnalysisResponse,
  AppealsListResponse,
  AppealDetailResponse,
  VerdictRequest,
  RevealRawResponse,
} from '../shared/types.js';
import { getSeverityFromScore } from '../shared/types.js';

const app = new Hono();

// ─── Constants ───────────────────────────────────────────────────────────────
const APPEAL_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days in ms
const STATS_TTL_MS = 30 * 24 * 60 * 60 * 1000;   // 30 days in ms

/** Create a Date for the TTL expiration from now */
function expiresIn(ms: number): Date {
  return new Date(Date.now() + ms);
}

const GEMINI_SYSTEM_PROMPT = `You are a moderator assistance AI. Analyze ban appeal text and produce a structured assessment. Your goal is to SHIELD the moderator from reading toxic content while giving them everything they need to make a fair decision.

Rules:
1. Never reproduce toxic language in your summary — paraphrase clinically
2. Assess remorse signals: genuine contrition vs. performative apology vs. absent
3. Rate toxicity 0-100 where 0=polite, 100=extreme hate speech
4. Identify the core argument of the appeal in neutral language
5. Flag manipulation attempts (guilt-tripping, threatening to "expose", false claims)
6. Keep shieldedSummary to 2-3 sentences maximum
7. Provide 2-4 key points as short bullet strings

Output JSON with these exact fields: toxicityScore (number 0-100), severity (one of: low, medium, high, extreme), emotionalTone (one of: angry, remorseful, neutral, manipulative), remorseSignal (one of: genuine, performative, absent), shieldedSummary (string), keyPoints (array of strings), aiConfidence (number 0-100).`;

const BAN_REASONS = [
  { label: 'Harassment / Personal Attacks', value: 'harassment' },
  { label: 'Hate Speech / Slurs', value: 'hate_speech' },
  { label: 'Spam / Self-Promotion', value: 'spam' },
  { label: 'Misinformation', value: 'misinformation' },
  { label: 'Rule Violation (Other)', value: 'rule_violation' },
  { label: 'Threatening Behavior', value: 'threats' },
  { label: 'Doxxing / Privacy', value: 'doxxing' },
  { label: 'Other', value: 'other' },
];

// ─── Helper: Generate UUID ──────────────────────────────────────────────────
function generateId(): string {
  return `appeal-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
}

// ─── Helper: Get today's date key ───────────────────────────────────────────
function getTodayKey(): string {
  return new Date().toISOString().split('T')[0];
}

// ─── Helper: Parse Gemini Response ──────────────────────────────────────────
function parseGeminiResponse(raw: string): GeminiAnalysisResponse {
  // Strip markdown code fence if present (defensive fallback)
  const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  const parsed = JSON.parse(cleaned);

  // Validate required fields
  const required = [
    'toxicityScore', 'severity', 'emotionalTone', 'remorseSignal',
    'shieldedSummary', 'keyPoints', 'aiConfidence',
  ];
  for (const field of required) {
    if (parsed[field] === undefined) {
      throw new Error(`Missing required field: ${field}`);
    }
  }
  return parsed as GeminiAnalysisResponse;
}

// ─── Helper: Update daily stats ─────────────────────────────────────────────
async function updateStats(
  subreddit: string,
  update: Partial<Pick<DailyStats, 'processed' | 'accepted' | 'denied' | 'escalated' | 'wordsShielded'>>
): Promise<void> {
  const today = getTodayKey();
  const statsKey = `stats:${subreddit}:daily:${today}`;
  const existing = await redis.get(statsKey);

  let stats: DailyStats;
  if (existing) {
    stats = JSON.parse(existing);
  } else {
    stats = { date: today, processed: 0, accepted: 0, denied: 0, escalated: 0, wordsShielded: 0 };
  }

  if (update.processed) stats.processed += update.processed;
  if (update.accepted) stats.accepted += update.accepted;
  if (update.denied) stats.denied += update.denied;
  if (update.escalated) stats.escalated += update.escalated;
  if (update.wordsShielded) stats.wordsShielded += update.wordsShielded;

  await redis.set(statsKey, JSON.stringify(stats), { expiration: expiresIn(STATS_TTL_MS) });
}

// ─── Helper: Execute Reddit Actions ──────────────────────────────────────────
async function executeRedditActions(
  appeal: AppealRecord,
  action: 'accept' | 'deny' | 'escalate'
): Promise<void> {
  const subreddit = appeal.subreddit;
  const username = appeal.username; // e.g. "u/someuser"
  const rawUsername = username.startsWith('u/') ? username.slice(2) : username;

  // Retrieve settings
  const autoUnban = await settings.get('autoUnbanOnAccept') as boolean ?? true;
  const acceptTemplate = await settings.get('acceptResponseTemplate') as string ?? '';
  const denyTemplate = await settings.get('denyResponseTemplate') as string ?? '';
  const escalateTemplate = await settings.get('escalateResponseTemplate') as string ?? '';

  // Determine template and subject based on action
  let template = '';
  let subject = '';
  if (action === 'accept') {
    template = acceptTemplate;
    subject = `Your ban appeal in r/${subreddit} has been accepted`;
  } else if (action === 'deny') {
    template = denyTemplate;
    subject = `Your ban appeal in r/${subreddit} has been denied`;
  } else if (action === 'escalate') {
    template = escalateTemplate;
    subject = `Your ban appeal in r/${subreddit} has been escalated`;
  }

  // 1. If autoUnbanOnAccept is true and action is accept, call reddit.unbanUser
  if (action === 'accept' && autoUnban) {
    try {
      await reddit.unbanUser(rawUsername, subreddit);
    } catch (unbanErr) {
      throw new Error(`Failed to unban user: ${unbanErr instanceof Error ? unbanErr.message : 'unknown error'}`);
    }
  }

  // 2. Perform template substitution
  // Replace {username}, {subreddit}, and {banReason}
  let messageBody = template;
  messageBody = messageBody.replace(/{username}/g, rawUsername);
  messageBody = messageBody.replace(/{subreddit}/g, subreddit);
  messageBody = messageBody.replace(/{banReason}/g, appeal.banReason || 'other');

  // 3. Call reddit.modMail.createConversation
  try {
    await reddit.modMail.createConversation({
      body: messageBody,
      isAuthorHidden: true,
      subredditName: subreddit,
      subject: subject,
      to: rawUsername,
    });
  } catch (modmailErr) {
    throw new Error(`Failed to send modmail: ${modmailErr instanceof Error ? modmailErr.message : 'unknown error'}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MENU ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// Menu: Show appeal form to users
app.post('/internal/menu/appeal-form', async (c) => {
  const _input = await c.req.json<MenuItemRequest>();
  const subreddit = context.subredditName || 'unknown';
  const username = context.userId || 'anonymous';

  // Check if user is banned (skip check for anonymous/unknown fallback)
  if (subreddit !== 'unknown' && username !== 'anonymous') {
    try {
      const bannedUsers = await reddit.getBannedUsers({ subredditName: subreddit, username }).all();
      const isBanned = bannedUsers.length > 0;
      if (!isBanned) {
        return c.json<UiResponse>({
          showToast: { text: 'This form is only for users who have been banned', appearance: 'neutral' },
        });
      }
    } catch (err) {
      return c.json<UiResponse>({
        showToast: { text: 'This form is only for users who have been banned', appearance: 'neutral' },
      });
    }

    // Check cooldown
    const cooldownKey = `cooldown:${subreddit}:${username}`;
    const lastAppeal = await redis.get(cooldownKey);
    if (lastAppeal) {
      const cooldownHours = (await settings.get('appealCooldownHours')) as number || 24;
      const elapsed = (Date.now() - parseInt(lastAppeal)) / (1000 * 60 * 60);
      if (elapsed < cooldownHours) {
        const remaining = Math.ceil(cooldownHours - elapsed);
        return c.json<UiResponse>({
          showToast: {
            text: `You submitted an appeal ${Math.floor(elapsed)}h ago. You may appeal again in ${remaining}h.`,
            appearance: 'neutral',
          },
        });
      }
    }
  }

  return c.json<UiResponse>({
    showForm: {
      name: 'appealForm',
      form: {
        title: '📝 Ban Appeal Submission',
        description: 'Submit an appeal for your ban. Your username will be recorded automatically.',
        acceptLabel: 'Submit Appeal',
        cancelLabel: 'Cancel',
        fields: [
          {
            type: 'select',
            name: 'banReason',
            label: 'Which rule were you banned for?',
            helpText: 'Select the reason closest to your ban.',
            required: true,
            options: BAN_REASONS,
          },
          {
            type: 'paragraph',
            name: 'appealText',
            label: 'Why should your ban be reconsidered?',
            helpText: 'Minimum 50 characters. Be specific about what happened and why you believe the ban should be lifted.',
            required: true,
            lineHeight: 6,
          },
          {
            type: 'paragraph',
            name: 'additionalContext',
            label: 'Additional context (optional)',
            helpText: 'Any extra information that might help moderators understand your situation.',
            lineHeight: 3,
          },
        ],
      },
    },
  });
});

// Menu: Open ToxZen queue (creates a queue post)
app.post('/internal/menu/open-queue', async (c) => {
  const _input = await c.req.json<MenuItemRequest>();
  const subredditName = context.subredditName;

  if (!subredditName) {
    return c.json<UiResponse>({ showToast: 'Error: Could not determine subreddit.' });
  }

  try {
    const post = await reddit.submitCustomPost({
      subredditName,
      title: '🧘 ToxZen — Ban Appeal Queue',
      entry: 'default',
    });
    return c.json<UiResponse>({
      showToast: { text: 'ToxZen queue opened!', appearance: 'success' },
    });
  } catch (_err) {
    return c.json<UiResponse>({
      showToast: { text: 'Failed to create queue post. Try again.', appearance: 'neutral' },
    });
  }
});

// Menu: Open wellness dashboard
app.post('/internal/menu/wellness', async (c) => {
  const _input = await c.req.json<MenuItemRequest>();
  const subredditName = context.subredditName;

  if (!subredditName) {
    return c.json<UiResponse>({ showToast: 'Error: Could not determine subreddit.' });
  }

  try {
    await reddit.submitCustomPost({
      subredditName,
      title: '🧘 ToxZen — Moderation Wellness',
      entry: 'wellness',
    });
    return c.json<UiResponse>({
      showToast: { text: 'Wellness dashboard opened!', appearance: 'success' },
    });
  } catch (_err) {
    return c.json<UiResponse>({
      showToast: { text: 'Failed to open dashboard. Try again.', appearance: 'neutral' },
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// FORM ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// Form: Handle appeal submission
type AppealFormRequest = {
  banReason: string[];  // Select fields return arrays
  appealText: string;
  additionalContext?: string;
};

app.post('/internal/form/appeal-submit', async (c) => {
  const body = await c.req.json<AppealFormRequest>();
  const subreddit = context.subredditName || 'unknown';
  const username = context.userId || 'anonymous';

  // Check if user is banned (skip check for anonymous/unknown fallback)
  if (subreddit !== 'unknown' && username !== 'anonymous') {
    try {
      const bannedUsers = await reddit.getBannedUsers({ subredditName: subreddit, username }).all();
      const isBanned = bannedUsers.length > 0;
      if (!isBanned) {
        return c.json<UiResponse>({
          showToast: { text: 'This form is only for users who have been banned', appearance: 'neutral' },
        });
      }
    } catch (err) {
      return c.json<UiResponse>({
        showToast: { text: 'This form is only for users who have been banned', appearance: 'neutral' },
      });
    }
  }

  // Validate appeal text length
  const appealText = body.appealText?.trim() || '';
  if (appealText.length < 50) {
    return c.json<UiResponse>({
      showToast: { text: 'Please provide more detail (minimum 50 characters).', appearance: 'neutral' },
    });
  }

  // Check cooldown
  const cooldownKey = `cooldown:${subreddit}:${username}`;
  const lastAppeal = await redis.get(cooldownKey);
  if (lastAppeal) {
    const cooldownHours = (await settings.get('appealCooldownHours')) as number || 24;
    const elapsed = (Date.now() - parseInt(lastAppeal)) / (1000 * 60 * 60);
    if (elapsed < cooldownHours) {
      const remaining = Math.ceil(cooldownHours - elapsed);
      return c.json<UiResponse>({
        showToast: {
          text: `You submitted an appeal ${Math.floor(elapsed)}h ago. You may appeal again in ${remaining}h.`,
          appearance: 'neutral',
        },
      });
    }
  }

  // Create appeal record
  const appealId = generateId();
  const rawText = appealText + (body.additionalContext ? `\n\nAdditional context: ${body.additionalContext}` : '');
  const banReason = Array.isArray(body.banReason) ? body.banReason[0] : body.banReason;

  const appeal: AppealRecord = {
    id: appealId,
    username: `u/${username}`,
    subreddit,
    banReason: banReason || 'other',
    appealText: 'Content is being analyzed by AI shield...', // Placeholder
    submittedAt: Date.now(),
    status: 'pending',
  };

  // Store appeal record and raw text
  await redis.set(
    `appeal:${subreddit}:${appealId}`,
    JSON.stringify(appeal),
    { expiration: expiresIn(APPEAL_TTL_MS) }
  );
  await redis.set(
    `raw:${subreddit}:${appealId}`,
    rawText,
    { expiration: expiresIn(APPEAL_TTL_MS) }
  );

  // Set cooldown
  await redis.set(cooldownKey, Date.now().toString(), { expiration: expiresIn(24 * 60 * 60 * 1000) });

  // Add to pending appeals list (sorted set by submission time)
  await redis.zAdd(`appeals:${subreddit}:pending`, {
    member: appealId,
    score: Date.now(),
  });

  // Schedule AI analysis
  await scheduler.runJob({
    name: 'analyze-appeal',
    runAt: new Date(),
    data: { appealId, subreddit },
  });

  return c.json<UiResponse>({
    showToast: {
      text: 'Your appeal has been received. A moderator will review it soon.',
      appearance: 'success',
    },
  });
});

// Form: Handle verdict submission
type VerdictFormRequest = {
  action: string;
  reason?: string;
  appealId: string;
  subreddit: string;
};

app.post('/internal/form/verdict-submit', async (c) => {
  const body = await c.req.json<VerdictFormRequest>();
  const modUsername = context.userId || 'unknown_mod';
  const { action, reason, appealId, subreddit } = body;

  const appealKey = `appeal:${subreddit}:${appealId}`;
  const appealData = await redis.get(appealKey);

  if (!appealData) {
    return c.json<UiResponse>({
      showToast: { text: 'Appeal not found.', appearance: 'neutral' },
    });
  }

  const appeal: AppealRecord = JSON.parse(appealData);

  // Check for concurrent processing
  if (appeal.status !== 'ready' && appeal.status !== 'manual_review') {
    return c.json<UiResponse>({
      showToast: {
        text: `This appeal was already processed by ${appeal.verdict?.modUsername || 'another mod'}.`,
        appearance: 'neutral',
      },
    });
  }

  // Store verdict FIRST (before Reddit API calls)
  const verdictAction = action as 'accept' | 'deny' | 'escalate';
  appeal.verdict = {
    modUsername: `u/${modUsername}`,
    action: verdictAction,
    reason,
    decidedAt: Date.now(),
    responseTemplate: verdictAction === 'accept' ? 'acceptResponseTemplate' : 'denyResponseTemplate',
    redditActionStatus: 'pending',
  };
  appeal.status = verdictAction === 'accept' ? 'accepted' :
                  verdictAction === 'deny' ? 'denied' : 'escalated';

  await redis.set(appealKey, JSON.stringify(appeal), { expiration: expiresIn(APPEAL_TTL_MS) });

  // Update stats
  await updateStats(subreddit, {
    processed: 1,
    ...(verdictAction === 'accept' ? { accepted: 1 } : {}),
    ...(verdictAction === 'deny' ? { denied: 1 } : {}),
    ...(verdictAction === 'escalate' ? { escalated: 1 } : {}),
  });

  // Count words shielded (raw text length)
  const rawText = await redis.get(`raw:${subreddit}:${appealId}`);
  if (rawText) {
    const wordCount = rawText.split(/\s+/).length;
    await updateStats(subreddit, { wordsShielded: wordCount });
  }

  // Execute Reddit actions
  try {
    await executeRedditActions(appeal, verdictAction);
    appeal.verdict.redditActionStatus = 'success';
  } catch (err) {
    appeal.verdict.redditActionStatus = 'failed';
    appeal.verdict.errorMessage = err instanceof Error ? err.message : 'Unknown error';
  }

  await redis.set(appealKey, JSON.stringify(appeal), { expiration: expiresIn(APPEAL_TTL_MS) });

  if (appeal.verdict.redditActionStatus === 'success') {
    await redis.zRem(`appeals:${subreddit}:pending`, [appealId]);
  }

  const verb = verdictAction === 'accept' ? 'accepted' :
               verdictAction === 'deny' ? 'denied' : 'escalated';

  return c.json<UiResponse>({
    showToast: {
      text: `Appeal ${verb} successfully.`,
      appearance: 'success',
    },
  });
});

// Form: Reveal raw text confirmation
app.post('/internal/form/reveal-raw', async (c) => {
  // This is the confirmation step — handled client-side
  return c.json<UiResponse>({
    showToast: { text: 'Raw content revealed.', appearance: 'neutral' },
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCHEDULER ENDPOINT
// ═══════════════════════════════════════════════════════════════════════════════

type AnalyzeAppealJobData = {
  appealId: string;
  subreddit: string;
  retryCount?: number;
};

app.post('/internal/scheduler/analyze-appeal', async (c) => {
  try {
    const body = await c.req.json<TaskRequest<AnalyzeAppealJobData>>();
    const data = body.data;

    if (!data?.appealId || !data?.subreddit) {
      return c.json<TaskResponse>({ status: 'error', message: 'Missing appeal data' }, 400);
    }

    const { appealId, subreddit, retryCount = 0 } = data;
    const appealKey = `appeal:${subreddit}:${appealId}`;
    const rawKey = `raw:${subreddit}:${appealId}`;

    // Update status to analyzing
    const appealData = await redis.get(appealKey);
    if (!appealData) {
      return c.json<TaskResponse>({ status: 'error', message: 'Appeal not found' }, 404);
    }

    const appeal: AppealRecord = JSON.parse(appealData);
    appeal.status = 'analyzing';
    await redis.set(appealKey, JSON.stringify(appeal), { expiration: expiresIn(APPEAL_TTL_MS) });

    // Get raw text
    const rawText = await redis.get(rawKey);
    if (!rawText) {
      appeal.status = 'manual_review';
      await redis.set(appealKey, JSON.stringify(appeal), { expiration: expiresIn(APPEAL_TTL_MS) });
      return c.json<TaskResponse>({ status: 'error', message: 'Raw text not found' }, 404);
    }

    // Get API key
    const apiKey = await settings.get('geminiApiKey') as string;
    if (!apiKey) {
      appeal.status = 'manual_review';
      await redis.set(appealKey, JSON.stringify(appeal), { expiration: expiresIn(APPEAL_TTL_MS) });
      return c.json<TaskResponse>({ status: 'error', message: 'API key not configured' }, 500);
    }

    // Call Gemini Flash API
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: {
              parts: [{ text: GEMINI_SYSTEM_PROMPT }],
            },
            contents: [{
              parts: [{ text: rawText }],
            }],
            generationConfig: {
              responseMimeType: 'application/json',
            },
          }),
        }
      );

      if (response.status === 429 && retryCount < 3) {
        // Rate limited — retry with exponential backoff
        const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
        await scheduler.runJob({
          name: 'analyze-appeal',
          runAt: new Date(Date.now() + delay),
          data: { appealId, subreddit, retryCount: retryCount + 1 },
        });
        return c.json<TaskResponse>({ status: 'retrying', retryCount: retryCount + 1 });
      }

      if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
      }

      const geminiResult = await response.json() as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const responseText = geminiResult.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!responseText) {
        throw new Error('Empty response from Gemini');
      }

      // Parse and validate
      const analysis = parseGeminiResponse(responseText);

      // Store analysis in appeal record
      const fullAnalysis: ToxicityAnalysis = {
        ...analysis,
        analyzedAt: Date.now(),
      };

      appeal.status = 'ready';
      appeal.analysis = fullAnalysis;
      appeal.appealText = analysis.shieldedSummary; // Safe summary replaces placeholder
      await redis.set(appealKey, JSON.stringify(appeal), { expiration: expiresIn(APPEAL_TTL_MS) });

      return c.json<TaskResponse>({ status: 'success', appealId });

    } catch (aiError) {
      if (retryCount < 3) {
        const delay = Math.pow(2, retryCount) * 1000;
        await scheduler.runJob({
          name: 'analyze-appeal',
          runAt: new Date(Date.now() + delay),
          data: { appealId, subreddit, retryCount: retryCount + 1 },
        });
        return c.json<TaskResponse>({ status: 'retrying', retryCount: retryCount + 1 });
      }

      // Max retries reached — fall back to manual review
      appeal.status = 'manual_review';
      await redis.set(appealKey, JSON.stringify(appeal), { expiration: expiresIn(APPEAL_TTL_MS) });
      return c.json<TaskResponse>({ status: 'manual_review', appealId });
    }

  } catch (error) {
    return c.json<TaskResponse>(
      { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CLIENT API ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// GET: List all pending appeals
app.get('/api/appeals', async (c) => {
  const subreddit = context.subredditName || 'ToxZenDemo';

  // Get all appeal IDs from sorted set
  const pendingIds = await redis.zRange(`appeals:${subreddit}:pending`, 0, -1);

  // Also get recently processed appeals (last 20)
  const allAppeals: AppealRecord[] = [];

  // Fetch pending appeals
  for (const item of pendingIds) {
    const id = typeof item === 'object' && item !== null && 'member' in item
      ? (item as { member: string }).member
      : (item as string);
    const data = await redis.get(`appeal:${subreddit}:${id}`);
    if (data) {
      allAppeals.push(JSON.parse(data));
    } else {
      // Clean up orphaned ID from sorted set if the appeal record expired
      await redis.zRem(`appeals:${subreddit}:pending`, [id]);
    }
  }

  // Sort: ready first, then analyzing, then manual_review, then by severity
  allAppeals.sort((a, b) => {
    const statusOrder: Record<string, number> = {
      ready: 0, manual_review: 1, analyzing: 2, pending: 3,
      accepted: 4, denied: 4, escalated: 4,
    };
    const aOrder = statusOrder[a.status] ?? 5;
    const bOrder = statusOrder[b.status] ?? 5;
    if (aOrder !== bOrder) return aOrder - bOrder;

    // Within same status, sort by toxicity score (high first)
    const aScore = a.analysis?.toxicityScore ?? 0;
    const bScore = b.analysis?.toxicityScore ?? 0;
    return bScore - aScore;
  });

  // Get today's stats
  const today = getTodayKey();
  const statsData = await redis.get(`stats:${subreddit}:daily:${today}`);
  const stats: DailyStats = statsData
    ? JSON.parse(statsData)
    : { date: today, processed: 0, accepted: 0, denied: 0, escalated: 0, wordsShielded: 0 };

  return c.json<AppealsListResponse>({ appeals: allAppeals, stats });
});

// GET: Single appeal detail
app.get('/api/appeal/:id', async (c) => {
  const appealId = c.req.param('id');
  const subreddit = context.subredditName || 'ToxZenDemo';
  const data = await redis.get(`appeal:${subreddit}:${appealId}`);

  if (!data) {
    return c.json({ error: 'Appeal not found' }, 404);
  }

  return c.json<AppealDetailResponse>({ appeal: JSON.parse(data) });
});

// POST: Submit verdict from client
app.post('/api/appeal/:id/verdict', async (c) => {
  const appealId = c.req.param('id');
  const subreddit = context.subredditName || 'ToxZenDemo';
  const modUsername = context.userId || 'unknown_mod';
  const body = await c.req.json<VerdictRequest>();

  const appealKey = `appeal:${subreddit}:${appealId}`;
  const appealData = await redis.get(appealKey);

  if (!appealData) {
    return c.json({ error: 'Appeal not found' }, 404);
  }

  const appeal: AppealRecord = JSON.parse(appealData);

  // Concurrent check
  if (appeal.status !== 'ready' && appeal.status !== 'manual_review') {
    return c.json({
      error: 'already_processed',
      message: `This appeal was already processed by ${appeal.verdict?.modUsername || 'another mod'}.`,
      verdict: appeal.verdict,
    }, 409);
  }

  // Store verdict
  appeal.verdict = {
    modUsername: `u/${modUsername}`,
    action: body.action,
    reason: body.reason,
    decidedAt: Date.now(),
    responseTemplate: body.action === 'accept' ? 'acceptResponseTemplate' : 'denyResponseTemplate',
    redditActionStatus: 'pending',
  };
  appeal.status = body.action === 'accept' ? 'accepted' :
                  body.action === 'deny' ? 'denied' : 'escalated';

  await redis.set(appealKey, JSON.stringify(appeal), { expiration: expiresIn(APPEAL_TTL_MS) });

  // Update stats
  await updateStats(subreddit, {
    processed: 1,
    ...(body.action === 'accept' ? { accepted: 1 } : {}),
    ...(body.action === 'deny' ? { denied: 1 } : {}),
    ...(body.action === 'escalate' ? { escalated: 1 } : {}),
  });

  // Count words shielded
  const rawText = await redis.get(`raw:${subreddit}:${appealId}`);
  if (rawText) {
    const wordCount = rawText.split(/\s+/).length;
    await updateStats(subreddit, { wordsShielded: wordCount });
  }

  // Execute Reddit actions
  try {
    await executeRedditActions(appeal, body.action);
    appeal.verdict.redditActionStatus = 'success';
  } catch (err) {
    appeal.verdict.redditActionStatus = 'failed';
    appeal.verdict.errorMessage = err instanceof Error ? err.message : 'Unknown error';
  }

  await redis.set(appealKey, JSON.stringify(appeal), { expiration: expiresIn(APPEAL_TTL_MS) });

  if (appeal.verdict.redditActionStatus === 'success') {
    await redis.zRem(`appeals:${subreddit}:pending`, [appealId]);
  }

  return c.json({ success: true, appeal });
});

// GET: Reveal raw text (requires explicit request)
app.get('/api/appeal/:id/reveal', async (c) => {
  const appealId = c.req.param('id');
  const subreddit = context.subredditName || 'ToxZenDemo';
  const rawText = await redis.get(`raw:${subreddit}:${appealId}`);

  if (!rawText) {
    return c.json({ error: 'Raw text not found or expired' }, 404);
  }

  return c.json<RevealRawResponse>({ rawText });
});

// POST: Retry failed Reddit actions
app.post('/api/appeal/:id/retry', async (c) => {
  const appealId = c.req.param('id');
  const subreddit = context.subredditName || 'ToxZenDemo';

  const appealKey = `appeal:${subreddit}:${appealId}`;
  const appealData = await redis.get(appealKey);

  if (!appealData) {
    return c.json({ error: 'Appeal not found' }, 404);
  }

  const appeal: AppealRecord = JSON.parse(appealData);

  if (!appeal.verdict) {
    return c.json({ error: 'No verdict exists for this appeal' }, 400);
  }

  if (appeal.verdict.redditActionStatus !== 'failed') {
    return c.json({ error: 'Reddit actions did not fail or are already successful' }, 400);
  }

  // Set back to pending
  appeal.verdict.redditActionStatus = 'pending';
  appeal.verdict.errorMessage = undefined;
  await redis.set(appealKey, JSON.stringify(appeal), { expiration: expiresIn(APPEAL_TTL_MS) });

  try {
    await executeRedditActions(appeal, appeal.verdict.action);
    appeal.verdict.redditActionStatus = 'success';
  } catch (err) {
    appeal.verdict.redditActionStatus = 'failed';
    appeal.verdict.errorMessage = err instanceof Error ? err.message : 'Unknown error';
  }

  await redis.set(appealKey, JSON.stringify(appeal), { expiration: expiresIn(APPEAL_TTL_MS) });

  if (appeal.verdict.redditActionStatus === 'success') {
    await redis.zRem(`appeals:${subreddit}:pending`, [appealId]);
  }

  return c.json({ success: true, appeal });
});

// GET: Wellness stats
app.get('/api/stats', async (c) => {
  const subreddit = context.subredditName || 'ToxZenDemo';
  const today = getTodayKey();
  const statsData = await redis.get(`stats:${subreddit}:daily:${today}`);

  const stats: DailyStats = statsData
    ? JSON.parse(statsData)
    : { date: today, processed: 0, accepted: 0, denied: 0, escalated: 0, wordsShielded: 0 };

  return c.json(stats);
});

export default app;
