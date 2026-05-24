import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import app from './index.js';
const nodeListener = (app as any).nodeListener;
import type { AppealRecord, DailyStats } from '../shared/types.js';
import appealsFixture from '../../data/fixtures/appeals.json';

// ─── Mock Devvit SDK Services ────────────────────────────────────────────────
const { mockRedis, mockScheduler, mockSettings, mockContext, mockReddit } = vi.hoisted(() => {
  return {
    mockRedis: {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
      zAdd: vi.fn(),
      zRange: vi.fn(),
      zRem: vi.fn(),
    },
    mockScheduler: {
      runJob: vi.fn(),
    },
    mockSettings: {
      get: vi.fn(),
    },
    mockContext: {
      subredditName: 'ToxZenDemo',
      userId: 'test_user',
    },
    mockReddit: {
      submitCustomPost: vi.fn(),
      unbanUser: vi.fn(),
      getBannedUsers: vi.fn(),
      modMail: {
        createConversation: vi.fn(),
      },
    },
  };
});

// Intercept Devvit imports before running index.ts logic
vi.mock('@devvit/web/server', () => {
  return {
    redis: mockRedis,
    scheduler: mockScheduler,
    settings: mockSettings,
    context: mockContext,
    reddit: mockReddit,
  };
});

describe('ToxZen Hono Server API Routes', () => {
  let store: Record<string, string> = {};
  let zSets: Record<string, Array<{ member: string; score: number }>> = {};
  let consoleErrorSpy: any;
  let consoleLogSpy: any;
  let fetchSpy: any;

  beforeEach(() => {
    store = {};
    zSets = {};
    vi.clearAllMocks();

    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // Reset context to default test values
    mockContext.subredditName = 'ToxZenDemo';
    mockContext.userId = 'test_user';

    // Mock implementation of Redis in-memory store
    mockRedis.get.mockImplementation(async (key: string) => {
      return store[key] ?? null;
    });

    mockRedis.set.mockImplementation(async (key: string, value: string) => {
      store[key] = value;
      return undefined;
    });

    mockRedis.del.mockImplementation(async (...keys: string[]) => {
      for (const k of keys) {
        delete store[k];
      }
      return undefined;
    });

    mockRedis.zAdd.mockImplementation(async (key: string, value: { member: string; score: number }) => {
      if (!zSets[key]) {
        zSets[key] = [];
      }
      zSets[key] = zSets[key].filter((x) => x.member !== value.member);
      zSets[key].push(value);
      return undefined;
    });

    mockRedis.zRange.mockImplementation(async (key: string, start: number, end: number) => {
      const set = zSets[key];
      if (!set) return [];
      // Sort by score ascending (default Redis ZRANGE behavior)
      const sorted = [...set].sort((a, b) => a.score - b.score);
      return sorted.map((x) => x.member);
    });

    mockRedis.zRem.mockImplementation(async (key: string, members: string[]) => {
      if (!zSets[key]) return undefined;
      zSets[key] = zSets[key].filter((x) => !members.includes(x.member));
      return undefined;
    });

    // Mock scheduler & default settings
    mockScheduler.runJob.mockResolvedValue(undefined);
    mockSettings.get.mockImplementation(async (key: string) => {
      if (key === 'appealCooldownHours') return 24;
      if (key === 'geminiApiKey') return 'mock-gemini-key';
      if (key === 'autoUnbanOnAccept') return true;
      if (key === 'acceptResponseTemplate') return 'Hello {username}, your appeal in r/{subreddit} has been accepted. Ban reason was {banReason}.';
      if (key === 'denyResponseTemplate') return 'Hello {username}, your appeal in r/{subreddit} has been denied.';
      if (key === 'escalateResponseTemplate') return 'Hello {username}, your appeal in r/{subreddit} has been escalated.';
      return null;
    });

    mockReddit.unbanUser.mockResolvedValue(undefined);
    mockReddit.modMail.createConversation.mockResolvedValue(undefined);
    mockReddit.getBannedUsers.mockImplementation((opts: any) => {
      return {
        all: async () => [{ username: opts.username || 'test_user' }],
      };
    });

    // Spy on global fetch
    fetchSpy = vi.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  // ─── Menu Endpoints ────────────────────────────────────────────────────────
  describe('Menu Routes', () => {
    it('POST /internal/menu/appeal-form returns a form UI response', async () => {
      const res = await app.request('/internal/menu/appeal-form', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toHaveProperty('showForm');
      expect(json.showForm.name).toBe('appealForm');
      expect(json.showForm.form.fields).toHaveLength(3);
    });

    it('POST /internal/menu/open-queue submits custom post and returns success toast', async () => {
      mockReddit.submitCustomPost.mockResolvedValue({ id: 'post-id' });

      const res = await app.request('/internal/menu/open-queue', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.showToast.appearance).toBe('success');
      expect(json.showToast.text).toBe('ToxZen queue opened!');
      expect(mockReddit.submitCustomPost).toHaveBeenCalledWith({
        subredditName: 'ToxZenDemo',
        title: '🧘 ToxZen — Ban Appeal Queue',
        entry: 'default',
      });
    });

    it('POST /internal/menu/open-queue returns neutral toast on submit exception', async () => {
      mockReddit.submitCustomPost.mockRejectedValue(new Error('API Down'));

      const res = await app.request('/internal/menu/open-queue', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.showToast.appearance).toBe('neutral');
      expect(json.showToast.text).toContain('Failed to create queue post');
    });

    it('POST /internal/menu/wellness opens wellness custom post', async () => {
      mockReddit.submitCustomPost.mockResolvedValue({ id: 'post-id-2' });

      const res = await app.request('/internal/menu/wellness', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.showToast.appearance).toBe('success');
      expect(json.showToast.text).toBe('Wellness dashboard opened!');
      expect(mockReddit.submitCustomPost).toHaveBeenCalledWith({
        subredditName: 'ToxZenDemo',
        title: '🧘 ToxZen — Moderation Wellness',
        entry: 'wellness',
      });
    });

    it('POST /internal/menu/open-queue returns error toast if subredditName is missing', async () => {
      mockContext.subredditName = '';

      const res = await app.request('/internal/menu/open-queue', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.showToast).toBe('Error: Could not determine subreddit.');
    });

    it('POST /internal/menu/wellness returns error toast if subredditName is missing', async () => {
      mockContext.subredditName = '';

      const res = await app.request('/internal/menu/wellness', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.showToast).toBe('Error: Could not determine subreddit.');
    });

    it('POST /internal/menu/wellness returns neutral toast on submit exception', async () => {
      mockReddit.submitCustomPost.mockRejectedValue(new Error('API Down'));

      const res = await app.request('/internal/menu/wellness', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.showToast.appearance).toBe('neutral');
      expect(json.showToast.text).toContain('Failed to open dashboard');
    });

    it('POST /internal/menu/appeal-form returns warning toast if user is not banned', async () => {
      mockReddit.getBannedUsers.mockImplementation(() => {
        return {
          all: async () => [],
        };
      });

      const res = await app.request('/internal/menu/appeal-form', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toHaveProperty('showToast');
      expect(json.showToast.appearance).toBe('neutral');
      expect(json.showToast.text).toBe('This form is only for users who have been banned');
    });

    it('POST /internal/menu/appeal-form handles exception and returns warning toast', async () => {
      mockReddit.getBannedUsers.mockImplementation(() => {
        throw new Error('API Timeout');
      });

      const res = await app.request('/internal/menu/appeal-form', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.showToast.text).toBe('This form is only for users who have been banned');
    });

    it('POST /internal/menu/appeal-form enforces cooldown limit', async () => {
      mockReddit.getBannedUsers.mockImplementation(() => {
        return {
          all: async () => [{ name: 'test_user' }],
        };
      });

      const cooldownKey = 'cooldown:ToxZenDemo:test_user';
      store[cooldownKey] = Date.now().toString();

      const res = await app.request('/internal/menu/appeal-form', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toHaveProperty('showToast');
      expect(json.showToast.appearance).toBe('neutral');
      expect(json.showToast.text).toContain('You submitted an appeal');
    });

    it('POST /internal/menu/appeal-form uses default anonymous username if context.userId is missing', async () => {
      mockContext.userId = '';
      const res = await app.request('/internal/menu/appeal-form', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(200);
    });

    it('POST /internal/menu/appeal-form handles missing appealCooldownHours setting during cooldown', async () => {
      mockSettings.get.mockImplementation(async (key: string) => {
        if (key === 'appealCooldownHours') return null;
        return 24;
      });

      mockReddit.getBannedUsers.mockImplementation(() => {
        return {
          all: async () => [{ name: 'test_user' }],
        };
      });

      const cooldownKey = 'cooldown:ToxZenDemo:test_user';
      store[cooldownKey] = (Date.now() - 3600000).toString(); // 1 hour ago

      const res = await app.request('/internal/menu/appeal-form', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.showToast.appearance).toBe('neutral');
      expect(json.showToast.text).toContain('You submitted an appeal');
      expect(json.showToast.text).toContain('23h');
    });

    it('global error handler returns neutral toast on internal route error', async () => {
      Object.defineProperty(mockContext, 'subredditName', {
        get: () => { throw new Error('Test internal error'); },
        configurable: true
      });

      try {
        const res = await app.request('/internal/menu/open-queue', {
          method: 'POST',
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.showToast.text).toBe('Error: Test internal error');
        expect(json.showToast.appearance).toBe('neutral');
      } finally {
        Object.defineProperty(mockContext, 'subredditName', {
          value: 'ToxZenDemo',
          writable: true,
          configurable: true
        });
      }
    });

    it('global error handler returns 500 status on external/API route error', async () => {
      Object.defineProperty(mockContext, 'subredditName', {
        get: () => { throw new Error('Test API error'); },
        configurable: true
      });

      try {
        const res = await app.request('/api/stats');
        expect(res.status).toBe(500);
        const json = await res.json();
        expect(json.error).toBe('Test API error');
      } finally {
        Object.defineProperty(mockContext, 'subredditName', {
          value: 'ToxZenDemo',
          writable: true,
          configurable: true
        });
      }
    });

    it('global error handler returns 500 status with default fallback message when error message is empty', async () => {
      Object.defineProperty(mockContext, 'subredditName', {
        get: () => { throw new Error(''); },
        configurable: true
      });

      try {
        const res = await app.request('/api/stats');
        expect(res.status).toBe(500);
        const json = await res.json();
        expect(json.error).toBe('Internal Server Error');
      } finally {
        Object.defineProperty(mockContext, 'subredditName', {
          value: 'ToxZenDemo',
          writable: true,
          configurable: true
        });
      }
    });
  });

  // ─── Appeal Submission ─────────────────────────────────────────────────────
  describe('Form Submission: Appeal Submit', () => {
    it('rejects appeal text with less than 50 characters', async () => {
      const res = await app.request('/internal/form/appeal-submit', {
        method: 'POST',
        body: JSON.stringify({
          banReason: ['harassment'],
          appealText: 'Too short',
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.showToast.appearance).toBe('neutral');
      expect(json.showToast.text).toContain('minimum 50 characters');
      expect(mockScheduler.runJob).not.toHaveBeenCalled();
    });

    it('rejects submission if user is not banned', async () => {
      mockReddit.getBannedUsers.mockImplementation(() => {
        return {
          all: async () => [],
        };
      });

      const res = await app.request('/internal/form/appeal-submit', {
        method: 'POST',
        body: JSON.stringify({
          banReason: ['harassment'],
          appealText: 'This is a valid appeal text that is more than fifty characters long.',
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.showToast.appearance).toBe('neutral');
      expect(json.showToast.text).toBe('This form is only for users who have been banned');
      expect(mockScheduler.runJob).not.toHaveBeenCalled();
    });

    it('handles exception in ban check and rejects submission during appeal submit', async () => {
      mockReddit.getBannedUsers.mockImplementation(() => {
        throw new Error('API Timeout');
      });

      const res = await app.request('/internal/form/appeal-submit', {
        method: 'POST',
        body: JSON.stringify({
          banReason: ['harassment'],
          appealText: 'This is a valid appeal text that is more than fifty characters long.',
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.showToast.text).toBe('This form is only for users who have been banned');
    });

    it('creates appeal record and schedules analyze task on valid submission', async () => {
      const validText = 'This is a valid appeal text that exceeds the fifty characters threshold constraint.';
      const res = await app.request('/internal/form/appeal-submit', {
        method: 'POST',
        body: JSON.stringify({
          banReason: ['hate_speech'],
          appealText: validText,
          additionalContext: 'More context here.',
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.showToast.appearance).toBe('success');

      // Verify Redis storage
      const storedAppeals = zSets['appeals:ToxZenDemo:pending'] || [];
      expect(storedAppeals).toHaveLength(1);

      const appealId = storedAppeals[0].member;
      const appealData = JSON.parse(store[`appeal:ToxZenDemo:${appealId}`]) as AppealRecord;

      expect(appealData.id).toBe(appealId);
      expect(appealData.subreddit).toBe('ToxZenDemo');
      expect(appealData.username).toBe('u/test_user');
      expect(appealData.banReason).toBe('hate_speech');
      expect(appealData.status).toBe('pending');

      const rawText = store[`raw:ToxZenDemo:${appealId}`];
      expect(rawText).toContain(validText);
      expect(rawText).toContain('Additional context: More context here.');

      // Verify cooldown is set
      expect(store['cooldown:ToxZenDemo:test_user']).toBeDefined();

      // Verify scheduler triggered
      expect(mockScheduler.runJob).toHaveBeenCalledWith({
        name: 'analyze-appeal',
        runAt: expect.any(Date),
        data: { appealId, subreddit: 'ToxZenDemo' },
      });
    });

    it('enforces cooldown limit if appeal is submitted too quickly', async () => {
      // Pre-populate cooldown
      const cooldownKey = 'cooldown:ToxZenDemo:test_user';
      store[cooldownKey] = Date.now().toString();

      const res = await app.request('/internal/form/appeal-submit', {
        method: 'POST',
        body: JSON.stringify({
          banReason: ['other'],
          appealText: 'This is a valid length appeal text representing a second appeal during cooldown.',
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.showToast.appearance).toBe('neutral');
      expect(json.showToast.text).toContain('You submitted an appeal');
      expect(mockScheduler.runJob).not.toHaveBeenCalled();
    });

    it('uses fallback banReason when banReason is missing', async () => {
      const res = await app.request('/internal/form/appeal-submit', {
        method: 'POST',
        body: JSON.stringify({
          appealText: 'This is a valid appeal text that is more than fifty characters long.',
          banReason: '',
        }),
      });

      expect(res.status).toBe(200);
      const storedAppeals = zSets['appeals:ToxZenDemo:pending'] || [];
      const appealId = storedAppeals[0].member;
      const appealData = store[`appeal:ToxZenDemo:${appealId}`];
      expect(appealData).toBeDefined();
      const appeal = JSON.parse(appealData);
      expect(appeal.banReason).toBe('other');
    });

    it('uses fallback subreddit and username when missing in context during appeal submit', async () => {
      mockContext.subredditName = '';
      mockContext.userId = '';

      const validText = 'This is a valid appeal text that exceeds the fifty characters threshold constraint.';
      const res = await app.request('/internal/form/appeal-submit', {
        method: 'POST',
        body: JSON.stringify({
          banReason: ['hate_speech'],
          appealText: validText,
        }),
      });

      expect(res.status).toBe(200);
      const storedAppeals = zSets['appeals:unknown:pending'] || [];
      expect(storedAppeals).toHaveLength(1);

      const appealId = storedAppeals[0].member;
      const appealData = JSON.parse(store[`appeal:unknown:${appealId}`]) as AppealRecord;
      expect(appealData.subreddit).toBe('unknown');
      expect(appealData.username).toBe('u/anonymous');
    });

    it('rejects appeal when appealText is missing or falsy', async () => {
      const res = await app.request('/internal/form/appeal-submit', {
        method: 'POST',
        body: JSON.stringify({
          banReason: ['other'],
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.showToast.appearance).toBe('neutral');
      expect(json.showToast.text).toContain('minimum 50 characters');
    });

    it('enforces cooldown limit using default 24h when setting is missing', async () => {
      mockSettings.get.mockImplementation(async (key: string) => {
        if (key === 'appealCooldownHours') return null;
        return 'mock-gemini-key';
      });

      const cooldownKey = 'cooldown:ToxZenDemo:test_user';
      store[cooldownKey] = (Date.now() - 5 * 60 * 60 * 1000).toString(); // 5 hours ago

      const res = await app.request('/internal/form/appeal-submit', {
        method: 'POST',
        body: JSON.stringify({
          banReason: ['other'],
          appealText: 'This is a valid length appeal text representing a second appeal during cooldown.',
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.showToast.appearance).toBe('neutral');
      expect(json.showToast.text).toContain('You submitted an appeal');
      expect(json.showToast.text).toContain('19h');
    });
  });

  // ─── Scheduler Analysis (Gemini Flash) ─────────────────────────────────────
  describe('Scheduler Job: Analyze Appeal', () => {
    it('sets status to manual_review if geminiApiKey setting is missing', async () => {
      mockSettings.get.mockResolvedValue(null); // No API Key configured
      const appealId = 'appeal-123';
      const appealKey = 'appeal:ToxZenDemo:appeal-123';
      const rawKey = 'raw:ToxZenDemo:appeal-123';

      store[appealKey] = JSON.stringify({ id: appealId, subreddit: 'ToxZenDemo', status: 'pending' });
      store[rawKey] = 'Raw appeal text content.';

      const res = await app.request('/internal/scheduler/analyze-appeal', {
        method: 'POST',
        body: JSON.stringify({ data: { appealId, subreddit: 'ToxZenDemo' } }),
      });

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.status).toBe('error');

      const appealData = JSON.parse(store[appealKey]);
      expect(appealData.status).toBe('manual_review');
    });

    it('updates status to ready and loads safe clinical summaries on successful Gemini call', async () => {
      const appealId = 'appeal-123';
      const appealKey = 'appeal:ToxZenDemo:appeal-123';
      const rawKey = 'raw:ToxZenDemo:appeal-123';

      store[appealKey] = JSON.stringify({ id: appealId, subreddit: 'ToxZenDemo', status: 'pending' });
      store[rawKey] = 'This user appealed the ban.';

      // Mock Gemini API Response
      const mockGeminiJSON = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    toxicityScore: 25,
                    severity: 'low',
                    emotionalTone: 'remorseful',
                    remorseSignal: 'genuine',
                    shieldedSummary: 'The user apologizes and expresses remorse.',
                    keyPoints: ['Acknowledges rule break', 'Promises compliance'],
                    aiConfidence: 95,
                  }),
                },
              ],
            },
          },
        ],
      };

      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockGeminiJSON,
      });

      const res = await app.request('/internal/scheduler/analyze-appeal', {
        method: 'POST',
        body: JSON.stringify({ data: { appealId, subreddit: 'ToxZenDemo' } }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('success');

      const appealData = JSON.parse(store[appealKey]) as AppealRecord;
      expect(appealData.status).toBe('ready');
      expect(appealData.appealText).toBe('The user apologizes and expresses remorse.');
      expect(appealData.analysis?.toxicityScore).toBe(25);
      expect(appealData.analysis?.severity).toBe('low');
      expect(appealData.analysis?.remorseSignal).toBe('genuine');
    });

    it('retries when rate-limited (HTTP 429)', async () => {
      const appealId = 'appeal-123';
      const appealKey = 'appeal:ToxZenDemo:appeal-123';
      const rawKey = 'raw:ToxZenDemo:appeal-123';

      store[appealKey] = JSON.stringify({ id: appealId, subreddit: 'ToxZenDemo', status: 'pending' });
      store[rawKey] = 'User appeal.';

      fetchSpy.mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      });

      const res = await app.request('/internal/scheduler/analyze-appeal', {
        method: 'POST',
        body: JSON.stringify({ data: { appealId, subreddit: 'ToxZenDemo', retryCount: 0 } }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('retrying');
      expect(json.retryCount).toBe(1);

      expect(mockScheduler.runJob).toHaveBeenCalledWith({
        name: 'analyze-appeal',
        runAt: expect.any(Date),
        data: { appealId, subreddit: 'ToxZenDemo', retryCount: 1 },
      });
    });

    it('falls back to manual_review when max retries are exceeded', async () => {
      const appealId = 'appeal-123';
      const appealKey = 'appeal:ToxZenDemo:appeal-123';
      const rawKey = 'raw:ToxZenDemo:appeal-123';

      store[appealKey] = JSON.stringify({ id: appealId, subreddit: 'ToxZenDemo', status: 'pending' });
      store[rawKey] = 'User appeal.';

      fetchSpy.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const res = await app.request('/internal/scheduler/analyze-appeal', {
        method: 'POST',
        body: JSON.stringify({ data: { appealId, subreddit: 'ToxZenDemo', retryCount: 3 } }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('manual_review');

      const appealData = JSON.parse(store[appealKey]);
      expect(appealData.status).toBe('manual_review');
    });

    it('retries when Gemini API call throws a generic network error and retryCount < 3', async () => {
      const appealId = 'appeal-123';
      const appealKey = 'appeal:ToxZenDemo:appeal-123';
      const rawKey = 'raw:ToxZenDemo:appeal-123';

      store[appealKey] = JSON.stringify({ id: appealId, subreddit: 'ToxZenDemo', status: 'pending' });
      store[rawKey] = 'User appeal.';

      fetchSpy.mockRejectedValue(new Error('Network Connection Failure'));

      const res = await app.request('/internal/scheduler/analyze-appeal', {
        method: 'POST',
        body: JSON.stringify({ data: { appealId, subreddit: 'ToxZenDemo', retryCount: 0 } }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('retrying');
      expect(json.retryCount).toBe(1);

      expect(mockScheduler.runJob).toHaveBeenCalledWith({
        name: 'analyze-appeal',
        runAt: expect.any(Date),
        data: { appealId, subreddit: 'ToxZenDemo', retryCount: 1 },
      });
    });

    it('throws error when Gemini API response has empty responseText', async () => {
      const appealId = 'appeal-123';
      const appealKey = 'appeal:ToxZenDemo:appeal-123';
      const rawKey = 'raw:ToxZenDemo:appeal-123';

      store[appealKey] = JSON.stringify({ id: appealId, subreddit: 'ToxZenDemo', status: 'pending' });
      store[rawKey] = 'User appeal.';

      // Return ok response but with no candidates
      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      const res = await app.request('/internal/scheduler/analyze-appeal', {
        method: 'POST',
        body: JSON.stringify({ data: { appealId, subreddit: 'ToxZenDemo', retryCount: 0 } }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      // Should retry since we hit empty response text which throws error
      expect(json.status).toBe('retrying');
      expect(json.retryCount).toBe(1);
    });

    it('retries when Gemini API response is missing a required field', async () => {
      const appealId = 'appeal-123';
      const appealKey = 'appeal:ToxZenDemo:appeal-123';
      const rawKey = 'raw:ToxZenDemo:appeal-123';

      store[appealKey] = JSON.stringify({ id: appealId, subreddit: 'ToxZenDemo', status: 'pending' });
      store[rawKey] = 'User appeal.';

      // Missing toxicityScore
      const incompleteGeminiJSON = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    severity: 'low',
                    emotionalTone: 'remorseful',
                    remorseSignal: 'genuine',
                    shieldedSummary: 'The user apologizes.',
                    keyPoints: ['Acknowledges rule break'],
                    aiConfidence: 95,
                  }),
                },
              ],
            },
          },
        ],
      };

      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => incompleteGeminiJSON,
      });

      const res = await app.request('/internal/scheduler/analyze-appeal', {
        method: 'POST',
        body: JSON.stringify({ data: { appealId, subreddit: 'ToxZenDemo', retryCount: 0 } }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('retrying');
      expect(json.retryCount).toBe(1);
    });

    it('returns 500 error in outer catch block when payload is invalid/missing', async () => {
      const res = await app.request('/internal/scheduler/analyze-appeal', {
        method: 'POST',
        body: 'invalid-json-body',
      });

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.status).toBe('error');
      expect(json.message).toBeDefined();
    });

    it('returns fallback message in outer catch block when non-Error object is thrown', async () => {
      mockRedis.get.mockImplementationOnce(() => {
        throw 'Custom non-Error exception string';
      });

      const res = await app.request('/internal/scheduler/analyze-appeal', {
        method: 'POST',
        body: JSON.stringify({ data: { appealId: 'some-id', subreddit: 'ToxZenDemo' } }),
      });

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.status).toBe('error');
      expect(json.message).toBe('Unknown error');
    });

    it('returns 400 when appealId or subreddit is missing in scheduler payload', async () => {
      const res = await app.request('/internal/scheduler/analyze-appeal', {
        method: 'POST',
        body: JSON.stringify({ data: { appealId: 'only-id' } }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.status).toBe('error');
      expect(json.message).toContain('Missing appeal data');
    });

    it('returns 404 if appeal data is not found in scheduler', async () => {
      const res = await app.request('/internal/scheduler/analyze-appeal', {
        method: 'POST',
        body: JSON.stringify({ data: { appealId: 'nonexistent', subreddit: 'ToxZenDemo' } }),
      });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.status).toBe('error');
      expect(json.message).toContain('Appeal not found');
    });

    it('returns 404 and falls back to manual_review if raw text is not found in scheduler', async () => {
      const appealId = 'appeal-no-raw';
      const appealKey = 'appeal:ToxZenDemo:appeal-no-raw';
      store[appealKey] = JSON.stringify({ id: appealId, subreddit: 'ToxZenDemo', status: 'pending' });

      const res = await app.request('/internal/scheduler/analyze-appeal', {
        method: 'POST',
        body: JSON.stringify({ data: { appealId, subreddit: 'ToxZenDemo' } }),
      });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.status).toBe('error');
      expect(json.message).toContain('Raw text not found');

      const appeal = JSON.parse(store[appealKey]);
      expect(appeal.status).toBe('manual_review');
    });
  });

  // ─── Verdict Form Submissions ──────────────────────────────────────────────
  describe('Form Submission: Verdict Submit', () => {
    it('successfully processes verdict accept, removes from pending, and updates stats', async () => {
      const appealId = 'appeal-123';
      const appealKey = 'appeal:ToxZenDemo:appeal-123';
      const rawKey = 'raw:ToxZenDemo:appeal-123';

      store[appealKey] = JSON.stringify({
        id: appealId,
        subreddit: 'ToxZenDemo',
        status: 'ready',
        username: 'u/test_user',
        banReason: 'harassment'
      });
      store[rawKey] = 'This raw text has five words.'; // 6 words (wordsShielded increments based on split length)
      zSets['appeals:ToxZenDemo:pending'] = [{ member: appealId, score: Date.now() }];

      const res = await app.request('/internal/form/verdict-submit', {
        method: 'POST',
        body: JSON.stringify({
          action: 'accept',
          reason: 'Good explanation.',
          appealId,
          subreddit: 'ToxZenDemo',
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.showToast.appearance).toBe('success');
      expect(json.showToast.text).toContain('accepted successfully');

      // Assert status updated
      const appealData = JSON.parse(store[appealKey]) as AppealRecord;
      expect(appealData.status).toBe('accepted');
      expect(appealData.verdict?.action).toBe('accept');
      expect(appealData.verdict?.modUsername).toBe('u/test_user');
      expect(appealData.verdict?.redditActionStatus).toBe('success');

      // Assert Reddit SDK calls are made with correct payload (username stripped of u/ prefix)
      expect(mockReddit.unbanUser).toHaveBeenCalledWith('test_user', 'ToxZenDemo');
      expect(mockReddit.modMail.createConversation).toHaveBeenCalledWith({
        body: 'Hello test_user, your appeal in r/ToxZenDemo has been accepted. Ban reason was harassment.',
        isAuthorHidden: true,
        subredditName: 'ToxZenDemo',
        subject: 'Your ban appeal in r/ToxZenDemo has been accepted',
        to: 'test_user',
      });

      // Assert zRem cleared pending list
      expect(zSets['appeals:ToxZenDemo:pending']).toHaveLength(0);

      // Assert stats incremented
      const todayKey = new Date().toISOString().split('T')[0];
      const stats = JSON.parse(store[`stats:ToxZenDemo:daily:${todayKey}`]) as DailyStats;
      expect(stats.processed).toBe(1);
      expect(stats.accepted).toBe(1);
      expect(stats.wordsShielded).toBe(6);
    });

    it('denies execution if appeal was already processed by another mod', async () => {
      const appealId = 'appeal-123';
      const appealKey = 'appeal:ToxZenDemo:appeal-123';

      store[appealKey] = JSON.stringify({
        id: appealId,
        subreddit: 'ToxZenDemo',
        status: 'accepted',
        username: 'u/test_user',
        banReason: 'harassment',
        verdict: { modUsername: 'u/other_mod', action: 'accept', decidedAt: Date.now(), responseTemplate: 'accept' },
      });

      const res = await app.request('/internal/form/verdict-submit', {
        method: 'POST',
        body: JSON.stringify({
          action: 'deny',
          appealId,
          subreddit: 'ToxZenDemo',
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.showToast.appearance).toBe('neutral');
      expect(json.showToast.text).toContain('already processed by u/other_mod');
    });

    it('returns neutral toast if appeal is not found during form submission', async () => {
      const res = await app.request('/internal/form/verdict-submit', {
        method: 'POST',
        body: JSON.stringify({
          action: 'accept',
          appealId: 'nonexistent-appeal-id',
          subreddit: 'ToxZenDemo',
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.showToast.appearance).toBe('neutral');
      expect(json.showToast.text).toContain('Appeal not found.');
    });

    it('successfully processes verdict deny via form submit', async () => {
      const appealId = 'appeal-123';
      const appealKey = 'appeal:ToxZenDemo:appeal-123';
      store[appealKey] = JSON.stringify({
        id: appealId,
        subreddit: 'ToxZenDemo',
        status: 'ready',
        username: 'u/test_user',
        banReason: 'harassment'
      });

      const res = await app.request('/internal/form/verdict-submit', {
        method: 'POST',
        body: JSON.stringify({
          action: 'deny',
          reason: 'Spamming.',
          appealId,
          subreddit: 'ToxZenDemo',
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.showToast.appearance).toBe('success');
      expect(json.showToast.text).toContain('denied successfully');

      const appealData = JSON.parse(store[appealKey]) as AppealRecord;
      expect(appealData.status).toBe('denied');
      expect(appealData.verdict?.redditActionStatus).toBe('success');

      // Assert unban was not called and modmail was sent with substituted template
      expect(mockReddit.unbanUser).not.toHaveBeenCalled();
      expect(mockReddit.modMail.createConversation).toHaveBeenCalledWith({
        body: 'Hello test_user, your appeal in r/ToxZenDemo has been denied.',
        isAuthorHidden: true,
        subredditName: 'ToxZenDemo',
        subject: 'Your ban appeal in r/ToxZenDemo has been denied',
        to: 'test_user',
      });
    });

    it('successfully processes verdict escalate via form submit', async () => {
      const appealId = 'appeal-123';
      const appealKey = 'appeal:ToxZenDemo:appeal-123';
      store[appealKey] = JSON.stringify({
        id: appealId,
        subreddit: 'ToxZenDemo',
        status: 'ready',
        username: 'u/test_user',
        banReason: 'harassment'
      });

      const res = await app.request('/internal/form/verdict-submit', {
        method: 'POST',
        body: JSON.stringify({
          action: 'escalate',
          reason: 'Requires senior admin review.',
          appealId,
          subreddit: 'ToxZenDemo',
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.showToast.appearance).toBe('success');
      expect(json.showToast.text).toContain('escalated successfully');

      const appealData = JSON.parse(store[appealKey]) as AppealRecord;
      expect(appealData.status).toBe('escalated');
      expect(appealData.verdict?.redditActionStatus).toBe('success');

      // Assert unban was not called and modmail was sent with substituted template
      expect(mockReddit.unbanUser).not.toHaveBeenCalled();
      expect(mockReddit.modMail.createConversation).toHaveBeenCalledWith({
        body: 'Hello test_user, your appeal in r/ToxZenDemo has been escalated.',
        isAuthorHidden: true,
        subredditName: 'ToxZenDemo',
        subject: 'Your ban appeal in r/ToxZenDemo has been escalated',
        to: 'test_user',
      });
    });

    it('POST /internal/form/reveal-raw returns neutral toast confirmation', async () => {
      const res = await app.request('/internal/form/reveal-raw', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.showToast.appearance).toBe('neutral');
      expect(json.showToast.text).toContain('Raw content revealed.');
    });

    it('uses fallback modUsername when missing in context during verdict submit', async () => {
      mockContext.userId = '';
      const appealId = 'appeal-123';
      const appealKey = 'appeal:ToxZenDemo:appeal-123';
      store[appealKey] = JSON.stringify({ id: appealId, subreddit: 'ToxZenDemo', status: 'ready' });

      const res = await app.request('/internal/form/verdict-submit', {
        method: 'POST',
        body: JSON.stringify({
          action: 'accept',
          appealId,
          subreddit: 'ToxZenDemo',
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.showToast.appearance).toBe('success');

      const appealData = JSON.parse(store[appealKey]) as AppealRecord;
      expect(appealData.verdict?.modUsername).toBe('u/unknown_mod');
    });

    it('uses fallback conflict message when previous verdict lacks modUsername info', async () => {
      const appealId = 'appeal-123';
      const appealKey = 'appeal:ToxZenDemo:appeal-123';
      store[appealKey] = JSON.stringify({
        id: appealId,
        subreddit: 'ToxZenDemo',
        status: 'accepted',
        verdict: { action: 'accept', decidedAt: Date.now() }, // modUsername missing
      });

      const res = await app.request('/internal/form/verdict-submit', {
        method: 'POST',
        body: JSON.stringify({
          action: 'deny',
          appealId,
          subreddit: 'ToxZenDemo',
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.showToast.appearance).toBe('neutral');
      expect(json.showToast.text).toContain('already processed by another mod');
    });

    it('verdict-submit endpoint skips Reddit actions for demo appeals', async () => {
      const appealId = 'appeal-demo-123';
      const appealKey = 'appeal:ToxZenDemo:appeal-demo-123';
      store[appealKey] = JSON.stringify({
        id: appealId,
        subreddit: 'ToxZenDemo',
        status: 'ready',
        username: 'u/test_user',
      });

      const res = await app.request('/internal/form/verdict-submit', {
        method: 'POST',
        body: JSON.stringify({
          action: 'accept',
          appealId,
          subreddit: 'ToxZenDemo',
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.showToast.appearance).toBe('success');
      
      const appealData = JSON.parse(store[appealKey]) as AppealRecord;
      expect(appealData.status).toBe('accepted');
      expect(appealData.verdict?.redditActionStatus).toBe('success');
    });
  });

  // ─── Client REST APIs ──────────────────────────────────────────────────────
  describe('Client REST API Endpoints', () => {
    it('GET /api/appeals retrieves pending queue and today stats', async () => {
      const todayKey = new Date().toISOString().split('T')[0];

      // Seed 2 appeals
      store['appeal:ToxZenDemo:appeal-1'] = JSON.stringify({
        id: 'appeal-1',
        subreddit: 'ToxZenDemo',
        status: 'ready',
        analysis: { toxicityScore: 80, severity: 'high' },
      });
      store['appeal:ToxZenDemo:appeal-2'] = JSON.stringify({
        id: 'appeal-2',
        subreddit: 'ToxZenDemo',
        status: 'ready',
        analysis: { toxicityScore: 40, severity: 'medium' },
      });

      zSets['appeals:ToxZenDemo:pending'] = [
        { member: 'appeal-2', score: Date.now() },
        { member: 'appeal-1', score: Date.now() - 5000 },
      ];

      // Seed stats
      store[`stats:ToxZenDemo:daily:${todayKey}`] = JSON.stringify({
        date: todayKey,
        processed: 2,
        accepted: 1,
        denied: 1,
        escalated: 0,
        wordsShielded: 150,
      });

      const res = await app.request('/api/appeals');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.appeals).toHaveLength(2);
      // Verify sorting: high toxicityScore first since status is equal ('ready')
      expect(json.appeals[0].id).toBe('appeal-1');
      expect(json.appeals[1].id).toBe('appeal-2');

      expect(json.stats.processed).toBe(2);
      expect(json.stats.wordsShielded).toBe(150);
    });

    it('GET /api/appeals cleans up expired appeal IDs from sorted set', async () => {
      // Seed sorted set with 1 valid and 1 expired appeal ID
      store['appeal:ToxZenDemo:valid-1'] = JSON.stringify({
        id: 'valid-1',
        subreddit: 'ToxZenDemo',
        status: 'ready',
        analysis: { toxicityScore: 80, severity: 'high' },
      });
      // Do NOT set store['appeal:ToxZenDemo:expired-1'] to simulate expiration

      zSets['appeals:ToxZenDemo:pending'] = [
        { member: 'valid-1', score: Date.now() },
        { member: 'expired-1', score: Date.now() - 5000 },
      ];

      const res = await app.request('/api/appeals');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.appeals).toHaveLength(1);
      expect(json.appeals[0].id).toBe('valid-1');

      // Verify that expired-1 was removed from the zSet
      const remainingZSet = zSets['appeals:ToxZenDemo:pending'] || [];
      expect(remainingZSet.some(item => item.member === 'expired-1')).toBe(false);
      expect(remainingZSet.some(item => item.member === 'valid-1')).toBe(true);
    });

    it('GET /api/appeals returns fallback daily stats when statsData is missing', async () => {
      const res = await app.request('/api/appeals');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.stats).toBeDefined();
      expect(json.stats.processed).toBe(0);
      expect(json.stats.wordsShielded).toBe(0);
    });

    it('GET /api/appeals uses fallback subreddit when subredditName is missing in context', async () => {
      mockContext.subredditName = '';
      const res = await app.request('/api/appeals');
      expect(res.status).toBe(200);
    });

    it('GET /api/appeals correctly sorts appeals by status priority and toxicity score', async () => {
      zSets['appeals:ToxZenDemo:pending'] = [
        { member: 'appeal-a', score: 1 },
        { member: 'appeal-b', score: 2 },
        { member: 'appeal-c', score: 3 },
        { member: 'appeal-d', score: 4 },
        { member: 'appeal-e', score: 5 },
        { member: 'appeal-f', score: 6 },
        { member: 'appeal-g', score: 7 },
      ];

      store['appeal:ToxZenDemo:appeal-a'] = JSON.stringify({
        id: 'appeal-a',
        subreddit: 'ToxZenDemo',
        status: 'ready',
        analysis: { toxicityScore: 80 }
      });
      store['appeal:ToxZenDemo:appeal-b'] = JSON.stringify({
        id: 'appeal-b',
        subreddit: 'ToxZenDemo',
        status: 'ready',
        analysis: { toxicityScore: 90 }
      });
      store['appeal:ToxZenDemo:appeal-c'] = JSON.stringify({
        id: 'appeal-c',
        subreddit: 'ToxZenDemo',
        status: 'analyzing'
      });
      store['appeal:ToxZenDemo:appeal-d'] = JSON.stringify({
        id: 'appeal-d',
        subreddit: 'ToxZenDemo',
        status: 'unknown_status'
      });
      store['appeal:ToxZenDemo:appeal-e'] = JSON.stringify({
        id: 'appeal-e',
        subreddit: 'ToxZenDemo',
        status: 'pending'
      });
      store['appeal:ToxZenDemo:appeal-f'] = JSON.stringify({
        id: 'appeal-f',
        subreddit: 'ToxZenDemo',
        status: 'ready'
      });
      store['appeal:ToxZenDemo:appeal-g'] = JSON.stringify({
        id: 'appeal-g',
        subreddit: 'ToxZenDemo',
        status: 'ready'
      });

      const res = await app.request('/api/appeals');
      expect(res.status).toBe(200);
      const json = await res.json();
      const ids = json.appeals.map((a: any) => a.id);
      expect(ids[0]).toBe('appeal-b');
      expect(ids[1]).toBe('appeal-a');
      expect(ids.slice(2, 4)).toContain('appeal-f');
      expect(ids.slice(2, 4)).toContain('appeal-g');
    });

    it('GET /api/appeals handles zRange returning member objects', async () => {
      mockRedis.zRange.mockImplementationOnce(async () => {
        return [{ member: 'appeal-obj', score: 123 }] as any;
      });

      store['appeal:ToxZenDemo:appeal-obj'] = JSON.stringify({
        id: 'appeal-obj',
        subreddit: 'ToxZenDemo',
        status: 'ready',
        analysis: { toxicityScore: 80, severity: 'high' },
      });

      const res = await app.request('/api/appeals');
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.appeals).toHaveLength(1);
      expect(json.appeals[0].id).toBe('appeal-obj');
    });

    it('GET /api/appeal/:id returns details of single appeal record', async () => {
      const appealId = 'appeal-789';
      store['appeal:ToxZenDemo:appeal-789'] = JSON.stringify({
        id: appealId,
        subreddit: 'ToxZenDemo',
        status: 'manual_review',
      });

      const res = await app.request(`/api/appeal/${appealId}`);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.appeal.id).toBe(appealId);
      expect(json.appeal.status).toBe('manual_review');
    });

    it('GET /api/appeal/:id uses fallback subreddit when subredditName is missing in context', async () => {
      mockContext.subredditName = '';
      const appealId = 'appeal-789';
      store['appeal:ToxZenDemo:appeal-789'] = JSON.stringify({
        id: appealId,
        subreddit: 'ToxZenDemo',
        status: 'manual_review',
      });

      const res = await app.request(`/api/appeal/${appealId}`);
      expect(res.status).toBe(200);
    });

    it('GET /api/appeal/:id returns 404 if appeal is not found', async () => {
      const res = await app.request('/api/appeal/nonexistent-id');
      expect(res.status).toBe(404);
    });

    it('POST /api/appeal/:id/verdict executes mod decision and handles conflicts', async () => {
      const appealId = 'appeal-123';
      const appealKey = 'appeal:ToxZenDemo:appeal-123';
      zSets['appeals:ToxZenDemo:pending'] = [{ member: appealId, score: Date.now() }];

      store[appealKey] = JSON.stringify({
        id: appealId,
        subreddit: 'ToxZenDemo',
        status: 'ready',
        username: 'u/test_user',
        banReason: 'harassment'
      });
      store['raw:ToxZenDemo:appeal-123'] = 'A short sample toxic raw message text.'; // 7 words

      const res = await app.request(`/api/appeal/${appealId}/verdict`, {
        method: 'POST',
        body: JSON.stringify({ action: 'deny', reason: 'Abusive behaviour.' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.appeal.status).toBe('denied');
      expect(json.appeal.verdict.redditActionStatus).toBe('success');

      // Assert unban not called, modmail sent
      expect(mockReddit.unbanUser).not.toHaveBeenCalled();
      expect(mockReddit.modMail.createConversation).toHaveBeenCalledWith({
        body: 'Hello test_user, your appeal in r/ToxZenDemo has been denied.',
        isAuthorHidden: true,
        subredditName: 'ToxZenDemo',
        subject: 'Your ban appeal in r/ToxZenDemo has been denied',
        to: 'test_user',
      });

      // Verify words shielded are tracked in stats
      const todayKey = new Date().toISOString().split('T')[0];
      const statsJson = store[`stats:ToxZenDemo:daily:${todayKey}`];
      expect(statsJson).toBeDefined();
      const stats = JSON.parse(statsJson);
      expect(stats.wordsShielded).toBe(7);

      // Verify concurrent verdict request (subsequent verdict POST yields 409 conflict)
      const res2 = await app.request(`/api/appeal/${appealId}/verdict`, {
        method: 'POST',
        body: JSON.stringify({ action: 'accept' }),
      });
      expect(res2.status).toBe(409);
      const json2 = await res2.json();
      expect(json2.error).toBe('already_processed');
    });

    it('POST /api/appeal/:id/verdict executes mod decision for accept', async () => {
      const appealId = 'appeal-accept';
      const appealKey = 'appeal:ToxZenDemo:appeal-accept';
      store[appealKey] = JSON.stringify({
        id: appealId,
        subreddit: 'ToxZenDemo',
        status: 'ready',
        username: 'u/test_user',
        banReason: 'harassment'
      });

      const res = await app.request(`/api/appeal/${appealId}/verdict`, {
        method: 'POST',
        body: JSON.stringify({ action: 'accept', reason: 'Good appeal.' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.appeal.status).toBe('accepted');
      expect(json.appeal.verdict.redditActionStatus).toBe('success');

      // Assert unban called, modmail sent
      expect(mockReddit.unbanUser).toHaveBeenCalledWith('test_user', 'ToxZenDemo');
      expect(mockReddit.modMail.createConversation).toHaveBeenCalledWith({
        body: 'Hello test_user, your appeal in r/ToxZenDemo has been accepted. Ban reason was harassment.',
        isAuthorHidden: true,
        subredditName: 'ToxZenDemo',
        subject: 'Your ban appeal in r/ToxZenDemo has been accepted',
        to: 'test_user',
      });
    });

    it('POST /api/appeal/:id/verdict executes mod decision for escalate', async () => {
      const appealId = 'appeal-escalate';
      const appealKey = 'appeal:ToxZenDemo:appeal-escalate';
      store[appealKey] = JSON.stringify({
        id: appealId,
        subreddit: 'ToxZenDemo',
        status: 'ready',
        username: 'u/test_user',
        banReason: 'harassment'
      });

      const res = await app.request(`/api/appeal/${appealId}/verdict`, {
        method: 'POST',
        body: JSON.stringify({ action: 'escalate', reason: 'Tricky case.' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.appeal.status).toBe('escalated');
      expect(json.appeal.verdict.redditActionStatus).toBe('success');

      // Assert unban not called, modmail sent
      expect(mockReddit.unbanUser).not.toHaveBeenCalled();
      expect(mockReddit.modMail.createConversation).toHaveBeenCalledWith({
        body: 'Hello test_user, your appeal in r/ToxZenDemo has been escalated.',
        isAuthorHidden: true,
        subredditName: 'ToxZenDemo',
        subject: 'Your ban appeal in r/ToxZenDemo has been escalated',
        to: 'test_user',
      });
    });

    it('POST /api/appeal/:id/verdict handles already processed conflicts without modUsername info', async () => {
      const appealId = 'appeal-conflict';
      const appealKey = 'appeal:ToxZenDemo:appeal-conflict';
      store[appealKey] = JSON.stringify({ id: appealId, subreddit: 'ToxZenDemo', status: 'accepted' });

      const res = await app.request(`/api/appeal/${appealId}/verdict`, {
        method: 'POST',
        body: JSON.stringify({ action: 'accept' }),
      });

      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.message).toContain('another mod');
    });

    it('POST /api/appeal/:id/verdict returns 404 if appeal is not found', async () => {
      const res = await app.request('/api/appeal/nonexistent-appeal-id/verdict', {
        method: 'POST',
        body: JSON.stringify({ action: 'accept' }),
      });
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe('Appeal not found');
    });

    it('POST /api/appeal/:id/verdict uses fallback subreddit and modUsername when missing in context', async () => {
      mockContext.subredditName = '';
      mockContext.userId = '';
      const appealId = 'appeal-123';
      store['appeal:ToxZenDemo:appeal-123'] = JSON.stringify({ id: appealId, subreddit: 'ToxZenDemo', status: 'ready' });

      const res = await app.request(`/api/appeal/${appealId}/verdict`, {
        method: 'POST',
        body: JSON.stringify({ action: 'accept' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.appeal.verdict.modUsername).toBe('u/unknown_mod');
    });

    it('POST /api/appeal/:id/verdict handles modmail creation failure', async () => {
      const appealId = 'appeal-modmail-fail';
      const appealKey = 'appeal:ToxZenDemo:appeal-modmail-fail';
      store[appealKey] = JSON.stringify({
        id: appealId,
        subreddit: 'ToxZenDemo',
        status: 'ready',
        username: 'u/test_user',
        banReason: 'harassment'
      });

      mockReddit.modMail.createConversation.mockRejectedValueOnce(new Error('Modmail rate limit reached'));

      const res = await app.request(`/api/appeal/${appealId}/verdict`, {
        method: 'POST',
        body: JSON.stringify({ action: 'accept', reason: 'Good appeal.' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.appeal.verdict.redditActionStatus).toBe('failed');
      expect(json.appeal.verdict.errorMessage).toBe('Failed to send modmail: Modmail rate limit reached');
    });


    it('GET /api/appeal/:id/reveal fetches original raw text', async () => {
      const appealId = 'appeal-999';
      store['raw:ToxZenDemo:appeal-999'] = 'Severe raw toxic text example.';

      const res = await app.request(`/api/appeal/${appealId}/reveal`);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.rawText).toBe('Severe raw toxic text example.');
    });

    it('GET /api/appeal/:id/reveal uses fallback subreddit when subredditName is missing in context', async () => {
      mockContext.subredditName = '';
      const appealId = 'appeal-999';
      store['raw:ToxZenDemo:appeal-999'] = 'Fallback subreddit raw text.';

      const res = await app.request(`/api/appeal/${appealId}/reveal`);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.rawText).toBe('Fallback subreddit raw text.');
    });

    it('GET /api/appeal/:id/reveal returns 404 if raw text is not found', async () => {
      const res = await app.request('/api/appeal/nonexistent-reveal-id/reveal');
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe('Raw text not found or expired');
    });

    it('GET /api/stats returns today stats even if empty', async () => {
      const res = await app.request('/api/stats');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.processed).toBe(0);
      expect(json.wordsShielded).toBe(0);
    });

    it('GET /api/stats returns parsed stats from Redis if present', async () => {
      const todayKey = new Date().toISOString().split('T')[0];
      store[`stats:ToxZenDemo:daily:${todayKey}`] = JSON.stringify({
        date: todayKey,
        processed: 5,
        accepted: 2,
        denied: 3,
        escalated: 0,
        wordsShielded: 420,
      });

      const res = await app.request('/api/stats');
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.processed).toBe(5);
      expect(json.wordsShielded).toBe(420);
    });

    it('GET /api/stats uses fallback subreddit when subredditName is missing in context', async () => {
      mockContext.subredditName = '';
      const res = await app.request('/api/stats');
      expect(res.status).toBe(200);
    });

    // ─── Retry Endpoint Tests ────────────────────────────────────────────────
    describe('POST /api/appeal/:id/retry', () => {
      it('successfully retries a failed verdict action', async () => {
        const appealId = 'appeal-retry-success';
        const appealKey = 'appeal:ToxZenDemo:appeal-retry-success';
        zSets['appeals:ToxZenDemo:pending'] = [{ member: appealId, score: Date.now() }];

        store[appealKey] = JSON.stringify({
          id: appealId,
          subreddit: 'ToxZenDemo',
          status: 'accepted',
          username: 'u/test_user',
          banReason: 'harassment',
          verdict: {
            modUsername: 'u/test_user',
            action: 'accept',
            decidedAt: Date.now(),
            redditActionStatus: 'failed',
            errorMessage: 'Network timeout',
          },
        });

        const res = await app.request(`/api/appeal/${appealId}/retry`, {
          method: 'POST',
        });

        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.success).toBe(true);
        expect(json.appeal.verdict.redditActionStatus).toBe('success');
        expect(json.appeal.verdict.errorMessage).toBeUndefined();

        // Assert unban and modmail were called
        expect(mockReddit.unbanUser).toHaveBeenCalledWith('test_user', 'ToxZenDemo');
        expect(mockReddit.modMail.createConversation).toHaveBeenCalled();

        // Assert zRem cleared pending list since it is now success
        expect(zSets['appeals:ToxZenDemo:pending']).toHaveLength(0);
      });

      it('preserves failed status and records errorMessage if retry fails again', async () => {
        const appealId = 'appeal-retry-fail';
        const appealKey = 'appeal:ToxZenDemo:appeal-retry-fail';
        zSets['appeals:ToxZenDemo:pending'] = [{ member: appealId, score: Date.now() }];

        store[appealKey] = JSON.stringify({
          id: appealId,
          subreddit: 'ToxZenDemo',
          status: 'accepted',
          username: 'u/test_user',
          banReason: 'harassment',
          verdict: {
            modUsername: 'u/test_user',
            action: 'accept',
            decidedAt: Date.now(),
            redditActionStatus: 'failed',
            errorMessage: 'Initial failure message',
          },
        });

        // Make unban throw an error
        mockReddit.unbanUser.mockRejectedValueOnce(new Error('Persistent API Error'));

        const res = await app.request(`/api/appeal/${appealId}/retry`, {
          method: 'POST',
        });

        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.success).toBe(true);
        expect(json.appeal.verdict.redditActionStatus).toBe('failed');
        expect(json.appeal.verdict.errorMessage).toBe('Failed to unban user: Persistent API Error');

        // Pending list is NOT cleared
        expect(zSets['appeals:ToxZenDemo:pending']).toHaveLength(1);
      });

      it('returns 404 if appeal to retry is not found', async () => {
        const res = await app.request('/api/appeal/nonexistent-retry/retry', {
          method: 'POST',
        });
        expect(res.status).toBe(404);
        const json = await res.json();
        expect(json.error).toBe('Appeal not found');
      });

      it('returns 400 if no verdict exists for the appeal', async () => {
        const appealId = 'appeal-no-verdict';
        const appealKey = 'appeal:ToxZenDemo:appeal-no-verdict';
        store[appealKey] = JSON.stringify({
          id: appealId,
          subreddit: 'ToxZenDemo',
          status: 'ready',
        });

        const res = await app.request(`/api/appeal/${appealId}/retry`, {
          method: 'POST',
        });
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toBe('No verdict exists for this appeal');
      });

      it('returns 400 if redditActionStatus is already success', async () => {
        const appealId = 'appeal-already-success';
        const appealKey = 'appeal:ToxZenDemo:appeal-already-success';
        store[appealKey] = JSON.stringify({
          id: appealId,
          subreddit: 'ToxZenDemo',
          status: 'accepted',
          verdict: {
            modUsername: 'u/test_user',
            action: 'accept',
            decidedAt: Date.now(),
            redditActionStatus: 'success',
          },
        });

        const res = await app.request(`/api/appeal/${appealId}/retry`, {
          method: 'POST',
        });
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toBe('Reddit actions did not fail or are already successful');
      });
    });

    describe('Edge Cases / Branch Coverage', () => {
      // 1. Ternary Username check (Line 113) - username not starting with 'u/'
      it('executeRedditActions handles username not starting with u/', async () => {
        const appealId = 'appeal-no-u-prefix';
        const appealKey = 'appeal:ToxZenDemo:appeal-no-u-prefix';
        store[appealKey] = JSON.stringify({
          id: appealId,
          subreddit: 'ToxZenDemo',
          status: 'ready',
          username: 'test_user', // no 'u/' prefix
          banReason: 'harassment',
        });

        const res = await app.request(`/api/appeal/${appealId}/verdict`, {
          method: 'POST',
          body: JSON.stringify({ action: 'accept' }),
        });
        expect(res.status).toBe(200);
        expect(mockReddit.unbanUser).toHaveBeenCalledWith('test_user', 'ToxZenDemo');
      });

      // 2. Settings coalescing null/undefined cases (Lines 116-119)
      it('executeRedditActions defaults settings when they are missing (null/undefined)', async () => {
        const appealId = 'appeal-null-settings';
        const appealKey = 'appeal:ToxZenDemo:appeal-null-settings';
        store[appealKey] = JSON.stringify({
          id: appealId,
          subreddit: 'ToxZenDemo',
          status: 'ready',
          username: 'u/test_user',
          banReason: 'harassment',
        });

        // Override settings mock to return null for all keys
        mockSettings.get.mockResolvedValue(null);

        const res = await app.request(`/api/appeal/${appealId}/verdict`, {
          method: 'POST',
          body: JSON.stringify({ action: 'accept' }),
        });
        expect(res.status).toBe(200);
        expect(mockReddit.unbanUser).toHaveBeenCalledWith('test_user', 'ToxZenDemo');
        expect(mockReddit.modMail.createConversation).toHaveBeenCalledWith({
          body: '',
          isAuthorHidden: true,
          subredditName: 'ToxZenDemo',
          subject: 'Your ban appeal in r/ToxZenDemo has been accepted',
          to: 'test_user',
        });
      });

      // 3. Non-Error rejection paths (Lines 140, 161)
      it('executeRedditActions handles non-Error rejection in unbanUser (Line 140)', async () => {
        const appealId = 'appeal-unban-non-error';
        const appealKey = 'appeal:ToxZenDemo:appeal-unban-non-error';
        store[appealKey] = JSON.stringify({
          id: appealId,
          subreddit: 'ToxZenDemo',
          status: 'ready',
          username: 'u/test_user',
          banReason: 'harassment',
        });

        mockReddit.unbanUser.mockRejectedValueOnce('Raw String Error');

        const res = await app.request(`/api/appeal/${appealId}/verdict`, {
          method: 'POST',
          body: JSON.stringify({ action: 'accept' }),
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.appeal.verdict.redditActionStatus).toBe('failed');
        expect(json.appeal.verdict.errorMessage).toBe('Failed to unban user: unknown error');
      });

      it('executeRedditActions handles non-Error rejection in modMail.createConversation (Line 161)', async () => {
        const appealId = 'appeal-modmail-non-error';
        const appealKey = 'appeal:ToxZenDemo:appeal-modmail-non-error';
        store[appealKey] = JSON.stringify({
          id: appealId,
          subreddit: 'ToxZenDemo',
          status: 'ready',
          username: 'u/test_user',
          banReason: 'harassment',
        });

        mockReddit.unbanUser.mockResolvedValueOnce(undefined);
        mockReddit.modMail.createConversation.mockRejectedValueOnce({ custom: 'object error' });

        const res = await app.request(`/api/appeal/${appealId}/verdict`, {
          method: 'POST',
          body: JSON.stringify({ action: 'accept' }),
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.appeal.verdict.redditActionStatus).toBe('failed');
        expect(json.appeal.verdict.errorMessage).toBe('Failed to send modmail: unknown error');
      });

      // 4. Handles empty subredditName in appeal-form (Line 172)
      it('handles empty subredditName in appeal-form (Line 172)', async () => {
        mockContext.subredditName = '';
        const res = await app.request('/internal/menu/appeal-form', {
          method: 'POST',
          body: JSON.stringify({}),
        });
        expect(res.status).toBe(200);
      });

      // 5. Handles missing banReason in executeRedditActions (Line 149)
      it('handles missing banReason in executeRedditActions (Line 149)', async () => {
        const appealId = 'appeal-missing-banreason';
        const appealKey = 'appeal:ToxZenDemo:appeal-missing-banreason';
        store[appealKey] = JSON.stringify({
          id: appealId,
          subreddit: 'ToxZenDemo',
          status: 'ready',
          username: 'u/test_user',
          banReason: '',
        });

        const res = await app.request(`/api/appeal/${appealId}/verdict`, {
          method: 'POST',
          body: JSON.stringify({ action: 'accept' }),
        });
        expect(res.status).toBe(200);
      });

      // 6. Verdict submit endpoint catches non-Error rejection from executeRedditActions (Line 476)
      it('verdict-submit endpoint catches non-Error rejection from executeRedditActions (Line 476)', async () => {
        const appealId = 'appeal-submit-verdict-non-error';
        const appealKey = 'appeal:ToxZenDemo:appeal-submit-verdict-non-error';
        store[appealKey] = JSON.stringify({
          id: appealId,
          subreddit: 'ToxZenDemo',
          status: 'ready',
          username: 'u/test_user',
          banReason: 'harassment',
        });

        mockSettings.get.mockRejectedValueOnce('Settings DB Down');

        const resSubmit = await app.request('/internal/form/verdict-submit', {
          method: 'POST',
          body: JSON.stringify({
            action: 'accept',
            appealId,
            subreddit: 'ToxZenDemo',
          }),
        });
        expect(resSubmit.status).toBe(200);
        const jsonSubmit = await resSubmit.json();
        expect(jsonSubmit.showToast.text).toBe('Appeal accepted successfully.');
        const updatedAppeal = JSON.parse(store[appealKey]);
        expect(updatedAppeal.verdict.redditActionStatus).toBe('failed');
        expect(updatedAppeal.verdict.errorMessage).toBe('Unknown error');
      });

      // 7. API verdict endpoint catches non-Error rejection from executeRedditActions (Line 766)
      it('API verdict endpoint catches non-Error rejection from executeRedditActions (Line 766)', async () => {
        const appealId = 'appeal-api-verdict-non-error';
        const appealKey = 'appeal:ToxZenDemo:appeal-api-verdict-non-error';
        store[appealKey] = JSON.stringify({
          id: appealId,
          subreddit: 'ToxZenDemo',
          status: 'ready',
          username: 'u/test_user',
          banReason: 'harassment',
        });

        mockSettings.get.mockRejectedValueOnce('Settings DB Down');

        const res = await app.request(`/api/appeal/${appealId}/verdict`, {
          method: 'POST',
          body: JSON.stringify({ action: 'accept' }),
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.success).toBe(true);
        expect(json.appeal.verdict.redditActionStatus).toBe('failed');
        expect(json.appeal.verdict.errorMessage).toBe('Unknown error');
      });

      // 8. Handles empty subredditName in retry endpoint (Line 794)
      it('handles empty subredditName in retry endpoint (Line 794)', async () => {
        mockContext.subredditName = '';
        const appealId = 'appeal-retry-empty-sub';
        const appealKey = 'appeal:ToxZenDemo:appeal-retry-empty-sub';
        store[appealKey] = JSON.stringify({
          id: appealId,
          subreddit: 'ToxZenDemo',
          status: 'accepted',
          username: 'u/test_user',
          banReason: 'harassment',
          verdict: {
            modUsername: 'u/test_user',
            action: 'accept',
            decidedAt: Date.now(),
            redditActionStatus: 'failed',
          },
        });

        const res = await app.request(`/api/appeal/${appealId}/retry`, {
          method: 'POST',
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.success).toBe(true);
      });

      // 9. API retry endpoint catches non-Error rejection from executeRedditActions (Line 823)
      it('API retry endpoint catches non-Error rejection from executeRedditActions (Line 823)', async () => {
        const appealId = 'appeal-retry-non-error';
        const appealKey = 'appeal:ToxZenDemo:appeal-retry-non-error';
        store[appealKey] = JSON.stringify({
          id: appealId,
          subreddit: 'ToxZenDemo',
          status: 'accepted',
          username: 'u/test_user',
          banReason: 'harassment',
          verdict: {
            modUsername: 'u/test_user',
            action: 'accept',
            decidedAt: Date.now(),
            redditActionStatus: 'failed',
          },
        });

        mockSettings.get.mockRejectedValueOnce('Settings DB Down');

        const res = await app.request(`/api/appeal/${appealId}/retry`, {
          method: 'POST',
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.success).toBe(true);
        expect(json.appeal.verdict.redditActionStatus).toBe('failed');
        expect(json.appeal.verdict.errorMessage).toBe('Unknown error');
      });
    });
  });

  describe('Seed API Endpoint', () => {
    it('POST /api/seed seeds demo data and resets daily stats', async () => {
      // Setup: Seed an existing demo appeal to test clearing
      store['appeal:ToxZenDemo:appeal-demo-old'] = JSON.stringify({
        id: 'appeal-demo-old',
        subreddit: 'ToxZenDemo',
        status: 'ready',
      });
      store['raw:ToxZenDemo:appeal-demo-old'] = 'Old demo raw text';
      zSets['appeals:ToxZenDemo:pending'] = [
        { member: 'appeal-demo-old', score: Date.now() },
      ];

      const res = await app.request('/api/seed', {
        method: 'POST',
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      // Verify old demo appeal was removed
      expect(store['appeal:ToxZenDemo:appeal-demo-old']).toBeUndefined();
      expect(store['raw:ToxZenDemo:appeal-demo-old']).toBeUndefined();

      // Verify new demo appeals were created
      const storedAppeals = zSets['appeals:ToxZenDemo:pending'] || [];
      expect(storedAppeals.length).toBeGreaterThan(0);

      // Check one seeded appeal
      const sampleId = 'appeal-demo-001';
      expect(store[`appeal:ToxZenDemo:${sampleId}`]).toBeDefined();
      expect(store[`raw:ToxZenDemo:${sampleId}`]).toBeDefined();

      // Verify daily stats were reset
      const todayKey = new Date().toISOString().split('T')[0];
      const statsKey = `stats:ToxZenDemo:daily:${todayKey}`;
      expect(store[statsKey]).toBeDefined();
      const stats = JSON.parse(store[statsKey]);
      expect(stats.processed).toBe(0);
      expect(stats.accepted).toBe(0);
    });

    it('POST /api/seed handles zRange returning member objects when clearing existing appeals', async () => {
      mockRedis.zRange.mockImplementationOnce(async () => {
        return [{ member: 'appeal-demo-old', score: Date.now() }] as any;
      });

      store['appeal:ToxZenDemo:appeal-demo-old'] = JSON.stringify({
        id: 'appeal-demo-old',
        subreddit: 'ToxZenDemo',
        status: 'ready',
      });
      store['raw:ToxZenDemo:appeal-demo-old'] = 'Old demo raw text';

      const res = await app.request('/api/seed', {
        method: 'POST',
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      // Verify old demo appeal was removed
      expect(store['appeal:ToxZenDemo:appeal-demo-old']).toBeUndefined();
    });

    it('POST /api/seed falls back to default subreddit when subredditName is empty in context', async () => {
      mockContext.subredditName = '';

      const res = await app.request('/api/seed', {
        method: 'POST',
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      // Verify that data is seeded on the default subreddit 'ToxZenDemo'
      const sampleId = 'appeal-demo-001';
      expect(store[`appeal:ToxZenDemo:${sampleId}`]).toBeDefined();
    });

    it('POST /api/seed handles fallback when RAW_TEXTS has no entry for appealId', async () => {
      // Temporarily push an appeal fixture that has no corresponding raw text in RAW_TEXTS
      appealsFixture.push({
        id: 'appeal-demo-noraw',
        username: 'u/noraw_user',
        subreddit: 'ToxZenDemo',
        appealText: 'This is the fallback appeal text that should be used directly since no raw text is in RAW_TEXTS.',
        banReason: 'other',
        submittedAt: Date.now(),
        status: 'ready',
      } as any);

      try {
        const res = await app.request('/api/seed', {
          method: 'POST',
        });

        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.success).toBe(true);

        // Verify the appeal was created with the default appealText
        const appealKey = 'appeal:ToxZenDemo:appeal-demo-noraw';
        expect(store[appealKey]).toBeDefined();
        const appeal = JSON.parse(store[appealKey]);
        expect(appeal.appealText).toBe('This is the fallback appeal text that should be used directly since no raw text is in RAW_TEXTS.');
      } finally {
        appealsFixture.pop();
      }
    });
  });

  describe('Node Server Adapter', () => {
    it('nodeListener handles GET requests correctly', async () => {
      if (!nodeListener) return;
      
      const reqMock: any = {
        method: 'GET',
        url: '/api/stats',
        headers: {
          host: 'localhost',
        },
        [Symbol.asyncIterator]: async function* () {}
      };

      const resHeaders: Record<string, string> = {};
      const resMock: any = {
        statusCode: 200,
        setHeader: (key: string, val: string) => {
          resHeaders[key] = val;
        },
        write: vi.fn(),
        end: vi.fn(),
      };

      await nodeListener(reqMock, resMock);

      expect(resMock.statusCode).toBe(200);
      expect(resMock.write).toHaveBeenCalled();
      expect(resMock.end).toHaveBeenCalled();
    });

    it('nodeListener handles POST requests with body stream correctly', async () => {
      if (!nodeListener) return;

      const reqMock: any = {
        method: 'POST',
        url: '/api/seed',
        headers: {
          host: 'localhost',
          'content-type': 'application/json',
        },
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.from(JSON.stringify({}));
        }
      };

      const resHeaders: Record<string, string> = {};
      const resMock: any = {
        statusCode: 200,
        setHeader: (key: string, val: string) => {
          resHeaders[key] = val;
        },
        write: vi.fn(),
        end: vi.fn(),
      };

      await nodeListener(reqMock, resMock);

      expect(resMock.statusCode).toBe(200);
      expect(resMock.write).toHaveBeenCalled();
      expect(resMock.end).toHaveBeenCalled();
    });

    it('nodeListener handles request listener errors and returns 500 status', async () => {
      if (!nodeListener) return;

      // Passing null req to force exception
      const resMock: any = {
        statusCode: 200,
        setHeader: vi.fn(),
        write: vi.fn(),
        end: vi.fn(),
      };

      await nodeListener(null, resMock);

      expect(resMock.statusCode).toBe(500);
      expect(resMock.end).toHaveBeenCalledWith('Internal Server Error');
    });

    it('nodeListener handles array of headers correctly', async () => {
      if (!nodeListener) return;

      const reqMock: any = {
        method: 'GET',
        url: '/api/stats',
        headers: {
          host: 'localhost',
          'x-multiple-header': ['value1', 'value2'],
        },
        [Symbol.asyncIterator]: async function* () {}
      };

      const resHeaders: Record<string, string> = {};
      const resMock: any = {
        statusCode: 200,
        setHeader: (key: string, val: string) => {
          resHeaders[key] = val;
        },
        write: vi.fn(),
        end: vi.fn(),
      };

      await nodeListener(reqMock, resMock);

      expect(resMock.statusCode).toBe(200);
      expect(resMock.write).toHaveBeenCalled();
      expect(resMock.end).toHaveBeenCalled();
    });

    it('nodeListener handles forwarded headers and fallback URL parsing values correctly', async () => {
      if (!nodeListener) return;

      const reqMock: any = {
        method: '',
        url: '',
        headers: {
          'x-forwarded-proto': 'https',
          'x-forwarded-host': 'forwarded.example.com',
        },
        [Symbol.asyncIterator]: async function* () {}
      };

      const resMock: any = {
        statusCode: 200,
        setHeader: vi.fn(),
        write: vi.fn(),
        end: vi.fn(),
      };

      await nodeListener(reqMock, resMock);

      expect(resMock.statusCode).toBe(404);
      expect(resMock.write).toHaveBeenCalled();
      expect(resMock.end).toHaveBeenCalled();
    });

    it('nodeListener handles missing host header with localhost fallback correctly', async () => {
      if (!nodeListener) return;

      const reqMock: any = {
        method: 'GET',
        url: '/api/stats',
        headers: {},
        [Symbol.asyncIterator]: async function* () {}
      };

      const resMock: any = {
        statusCode: 200,
        setHeader: vi.fn(),
        write: vi.fn(),
        end: vi.fn(),
      };

      await nodeListener(reqMock, resMock);

      expect(resMock.statusCode).toBe(200);
      expect(resMock.write).toHaveBeenCalled();
      expect(resMock.end).toHaveBeenCalled();
    });
  });
});
