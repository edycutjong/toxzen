import { Hono } from 'hono';
import { redis, scheduler, settings, context, reddit, createServer, getServerPort } from '@devvit/web/server';
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
import appealsFixture from '../../data/fixtures/appeals.json';

const app = new Hono();

app.onError((err, c) => {
  console.error('[Hono Error]:', err);
  
  if (c.req.path.startsWith('/internal/')) {
    return c.json({
      showToast: {
        text: `Error: ${err.message}`,
        appearance: 'neutral',
      },
    });
  }
  
  return c.json(
    { error: err.message || 'Internal Server Error' },
    500
  );
});

const RAW_TEXTS: Record<string, string> = {
  'appeal-demo-001': `This is absolute GARBAGE moderation and you pathetic little power-tripping losers need to wake up. I've been on this subreddit for THREE YEARS and you banned me because I disagreed with your precious little mod [ModUsername1]? Are you serious right now?

You want to talk about rule violations? Let's talk about how [ModUsername1] and [ModUsername2] actively brigade anyone who challenges their opinions. I've seen it happen over and over again. They're running a clique, not a community. Everyone knows it. You're all too scared to admit it.

I didn't break any rules. What I said was completely within the bounds of normal debate. You just didn't like that I made your little friend look stupid in an argument, so you banned me. That's not moderation — that's abuse of power.

You people are cowards. Hiding behind your mod tags, sitting in your little discord, coordinating bans against anyone who threatens your little empire. I have screenshots. I have DMs. I will be posting everything to r/modsbeingjerks and I will be messaging Reddit admins directly about [ModUsername1]'s conflict of interest. 

How does it feel knowing your entire mod team is about to be exposed? I've already started documenting every single one of your questionable bans from the last six months. There's a pattern and everyone is going to see it.

Unban me immediately or face the consequences. This isn't over. I will make sure every single person in this community knows what kind of people are running it. You want a fight? You've got one. Enjoy your little ban while it lasts, because your days as moderators are numbered.

I'm not going anywhere. I'll be back with a new account if you don't fix this. You can't silence me. Free speech still exists whether you like it or not.`,

  'appeal-demo-002': `Hi mods,

I'm writing to appeal my ban from r/movies. I completely understand why I was banned and I want to sincerely apologize.

I posted a comment that contained spoilers for a film that had only been out for 48 hours, without using the spoiler tag. I didn't realize how strictly the spoiler policy was enforced here, especially in the first week of a release. That's entirely my fault — I should have read the community rules more carefully before posting, and I should have used common sense regardless.

I want to be clear that I'm not trying to make excuses. I ruined the movie for at least one person who replied to my comment saying they hadn't seen it yet, and that genuinely bothers me. The whole point of the spoiler tag rule is to protect people's experience, and I undermined that.

I've been a member of this subreddit for about two months and I really enjoy the film discussions here. It's one of the few places online where I can talk about cinema without it devolving into arguments. I would very much like to continue being part of this community.

If you decide to unban me, I promise to re-read the full community guidelines today and to be much more careful about spoilers going forward. I'll use the spoiler tag even when I'm not sure if something counts — better safe than sorry.

Thank you for taking the time to read this. I understand if you decide to uphold the ban, but I hope you'll give me a second chance.

— u/NewMovieFan`,

  'appeal-demo-003': `Hello,

I want to start by saying that I recognize I made some mistakes in my comments on r/politics and I'm sorry if anyone felt attacked by what I said. That was never my intention and I hope we can move past this.

That said, I have to be honest with you: I'm genuinely confused by this ban. I've seen far worse comments stay up for days on this subreddit, and somehow mine gets removed within an hour? It really makes me wonder if there's some bias at play here. Not accusing anyone of anything, just... noticing.

I've been a member for over a year. I've contributed hundreds of comments. And this is how my contributions are repaid? It's honestly pretty hurtful. I thought this was supposed to be a community, not a place where mods play favorites.

Look, I don't want to make this a big thing. But I do want you to know that I'm aware of my rights as a Reddit user. I know how to file reports with the admin team. I know how to document mod behavior patterns. I'm not saying I will — I'm saying I could. I'd much rather resolve this amicably between us.

All I'm asking for is a fair reconsideration. That's it. Look at my comment history, look at the context of the exchange, and ask yourself if a permanent ban was really proportionate here. I think you'll see it wasn't.

I'm willing to let this go if you are. But if this stays on my record, I'm going to need to explore my options. I don't think that's good for either of us.

Thanks for your consideration.`,

  'appeal-demo-004': `I'm appealing my ban from r/science for alleged misinformation.

The specific comment that got me banned was my claim that the meta-analysis by Hoffman et al. (2024) found no statistically significant correlation between the variable in question and the outcome being discussed. I stand by that claim because it is factually accurate. Here is the DOI: 10.1001/example.2024.12345. You can verify this yourself.

I understand that the moderator who removed my comment may not have been familiar with this particular study. That's fine — the literature is vast. But banning me for citing peer-reviewed research without even checking the source is frustrating. I wasn't spreading misinformation; I was citing a legitimate academic paper that happens to contradict the popular consensus in this thread.

I'll admit my tone got a bit sharp when my comment was first removed. I said something like "maybe read the actual research before removing citations" and I can see how that came across as aggressive. I apologize for that specific comment.

But the underlying factual dispute still stands. If the mod team has a source that contradicts Hoffman et al. (2024), I would genuinely like to see it — I'm not trying to be right for the sake of being right, I'm trying to have an accurate conversation.

I'm requesting either an unban with the original comment restored, or at minimum a ruling on whether Hoffman et al. (2024) is considered a valid source in this subreddit. If there's a problem with the source itself, I'd like to understand why.

Thank you.`,

  'appeal-demo-005': `I cannot believe I have to do this AGAIN. You people banned me AGAIN for the same nonsense.

Let me be very clear: this is censorship. Pure and simple. You don't like my opinions, so you silence me. That's what's happening here. Anyone who can't see that is either blind or part of the problem.

I've been banned from this subreddit twice before and both times I came back because I have as much right to participate in public discourse as anyone else. The first amendment protects free speech and Reddit moderators don't get to override that, no matter how much they want to.

My last two appeals were denied, which tells me everything I need to know about how "impartial" this mod team is. You've already decided you don't like me. So why am I even writing this? Because I want there to be a record. I want Reddit to see that this subreddit has a pattern of targeting users who don't agree with the mod team's political leanings.

I've been documenting this for months. I have a spreadsheet of every ban from this subreddit that I believe was politically motivated. When I have enough data points, I'm going to publish it. The mod team here is corrupt and people deserve to know.

Unban me or don't. I'll be back either way. You can't stop people from speaking the truth.`
};

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

  // Skip Reddit API calls for demo/mock appeals since these users do not exist on Reddit
  if (appeal.id.startsWith('appeal-demo-')) {
    console.log(`[Demo mode] Skipping Reddit actions for demo appeal ${appeal.id}`);
    return;
  }

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

// POST: Seed or reset demo data
app.post('/api/seed', async (c) => {
  const subreddit = context.subredditName || 'ToxZenDemo';
  const nowMs = Date.now();
  const offsets = [
    2 * 3600 * 1000,
    5 * 3600 * 1000,
    24 * 3600 * 1000,
    27 * 3600 * 1000,
    48 * 3600 * 1000,
  ];

  // 1. Clear any existing demo appeals
  const pendingIds = await redis.zRange(`appeals:${subreddit}:pending`, 0, -1);
  for (const item of pendingIds) {
    const id = typeof item === 'object' && item !== null && 'member' in item
      ? (item as { member: string }).member
      : (item as string);
    if (id.startsWith('appeal-demo-')) {
      await redis.del(`appeal:${subreddit}:${id}`);
      await redis.del(`raw:${subreddit}:${id}`);
      await redis.zRem(`appeals:${subreddit}:pending`, [id]);
    }
  }

  // 2. Seed new demo appeals from appealsFixture
  for (let i = 0; i < appealsFixture.length; i++) {
    const appeal = JSON.parse(JSON.stringify(appealsFixture[i])) as AppealRecord;
    const appealId = appeal.id;
    const submittedAt = nowMs - offsets[i];
    appeal.submittedAt = submittedAt;
    appeal.subreddit = subreddit;

    const rawText = RAW_TEXTS[appealId] || appeal.appealText;

    if (appeal.analysis) {
      appeal.analysis.analyzedAt = submittedAt + 5000;
      appeal.appealText = appeal.analysis.shieldedSummary;
    }

    // Save appeal and raw text
    await redis.set(`appeal:${subreddit}:${appealId}`, JSON.stringify(appeal), { expiration: expiresIn(APPEAL_TTL_MS) });
    await redis.set(`raw:${subreddit}:${appealId}`, rawText, { expiration: expiresIn(APPEAL_TTL_MS) });

    // Add to pending queue if status is ready/pending/analyzing/manual_review
    if (['ready', 'analyzing', 'manual_review', 'pending'].includes(appeal.status)) {
      await redis.zAdd(`appeals:${subreddit}:pending`, {
        member: appealId,
        score: submittedAt,
      });
    }
  }

  // 3. Reset daily stats
  const today = getTodayKey();
  const statsKey = `stats:${subreddit}:daily:${today}`;
  const stats = { date: today, processed: 0, accepted: 0, denied: 0, escalated: 0, wordsShielded: 0 };
  await redis.set(statsKey, JSON.stringify(stats), { expiration: expiresIn(STATS_TTL_MS) });

  return c.json({ success: true });
});

// Helper to convert Node request to standard Web Request
async function toWebRequest(req: any): Promise<Request> {
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  const url = new URL(req.url || '', `${protocol}://${host}`).toString();
  
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value !== undefined) {
      if (Array.isArray(value)) {
        for (const val of value) headers.append(key, val);
      } else {
        headers.append(key, value as string);
      }
    }
  }

  const method = req.method || 'GET';
  const options: RequestInit = {
    method,
    headers,
  };

  if (method !== 'GET' && method !== 'HEAD') {
    const chunks: any[] = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    options.body = Buffer.concat(chunks);
  }

  return new Request(url, options);
}

// Helper to write Web Response back to Node response
async function writeWebResponse(webRes: Response, res: any): Promise<void> {
  res.statusCode = webRes.status;
  
  webRes.headers.forEach((value, key) => {
    if (value !== null && value !== undefined && value !== 'null') {
      res.setHeader(key, value);
    }
  });
  
  const arrayBuffer = await webRes.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  
  // Set Content-Length based on the actual buffer length to satisfy Devvit's requirements
  res.setHeader('content-length', String(buffer.length));
  
  res.write(buffer);
  res.end();
}

// Adapt Hono fetch to standard Node request listener
const nodeListener = async (req: any, res: any) => {
  try {
    const webReq = await toWebRequest(req);
    const webRes = await app.fetch(webReq);
    await writeWebResponse(webRes, res);
  } catch (err: any) {
    console.error('[Adapter Error]:', err);
    res.statusCode = 500;
    res.end('Internal Server Error');
  }
};

// Start the server using Devvit's createServer
if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  const server = createServer(nodeListener);
  server.listen(getServerPort());
}

(app as any).nodeListener = nodeListener;

export default app;

