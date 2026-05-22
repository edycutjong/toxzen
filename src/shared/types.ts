// ─── Appeal Status Lifecycle ─────────────────────────────────────────────────
export type AppealStatus =
  | 'pending'       // Submitted, awaiting AI analysis
  | 'analyzing'     // AI analysis in progress
  | 'ready'         // AI analysis complete, awaiting mod review
  | 'manual_review' // AI failed, mod must review manually
  | 'accepted'      // Mod accepted the appeal
  | 'denied'        // Mod denied the appeal
  | 'escalated';    // Mod escalated for senior review

// ─── Severity Levels ─────────────────────────────────────────────────────────
export type Severity = 'low' | 'medium' | 'high' | 'extreme';

// ─── Emotional Tone ──────────────────────────────────────────────────────────
export type EmotionalTone = 'angry' | 'remorseful' | 'neutral' | 'manipulative';

// ─── Remorse Signal ──────────────────────────────────────────────────────────
export type RemorseSignal = 'genuine' | 'performative' | 'absent';

// ─── Verdict Action ──────────────────────────────────────────────────────────
export type VerdictAction = 'accept' | 'deny' | 'escalate';

// ─── AI Analysis Result ──────────────────────────────────────────────────────
export interface ToxicityAnalysis {
  toxicityScore: number;        // 0–100
  severity: Severity;
  emotionalTone: EmotionalTone;
  remorseSignal: RemorseSignal;
  shieldedSummary: string;      // Clean 2–3 sentence summary
  keyPoints: string[];          // 2–4 bullet strings
  aiConfidence: number;         // 0–100
  analyzedAt: number;           // Unix timestamp (ms)
}

// ─── Mod Verdict ─────────────────────────────────────────────────────────────
export interface VerdictRecord {
  modUsername: string;
  action: VerdictAction;
  reason?: string;              // Optional mod note
  decidedAt: number;            // Unix timestamp (ms)
  responseTemplate: string;     // Which auto-response was sent
  redditActionStatus?: 'success' | 'failed' | 'pending';
  errorMessage?: string;
}

// ─── Appeal Record ───────────────────────────────────────────────────────────
export interface AppealRecord {
  id: string;                   // UUID
  username: string;             // Appealing user (e.g., "u/RageGamer2026")
  subreddit: string;            // Context (e.g., "ToxZenDemo")
  banReason: string;            // Dropdown selection from appeal form
  appealText: string;           // Brief description (from form, NOT the raw toxic text)
  submittedAt: number;          // Unix timestamp (ms)
  status: AppealStatus;
  analysis?: ToxicityAnalysis;
  verdict?: VerdictRecord;
  // Historical context
  priorBans?: number;
  priorAppeals?: number;
  priorAppealsOutcome?: string;
}

// ─── Daily Stats (Wellness Dashboard) ────────────────────────────────────────
export interface DailyStats {
  date: string;                 // YYYY-MM-DD
  processed: number;
  accepted: number;
  denied: number;
  escalated: number;
  wordsShielded: number;        // Total raw words the mod didn't have to read
}

// ─── Subreddit Config ────────────────────────────────────────────────────────
export interface SubredditConfig {
  appealCooldownHours: number;
  autoUnbanOnAccept: boolean;
  denyResponseTemplate: string;
  acceptResponseTemplate: string;
}

// ─── KV Key Patterns ─────────────────────────────────────────────────────────
// appeal:{subreddit}:{appealId}   → AppealRecord (JSON)
// raw:{subreddit}:{appealId}      → raw text string
// stats:{subreddit}:daily:{date}  → DailyStats (JSON)
// config:{subreddit}              → SubredditConfig (JSON)
// cooldown:{subreddit}:{username} → timestamp string

// ─── Gemini API Types ────────────────────────────────────────────────────────
export interface GeminiAnalysisResponse {
  toxicityScore: number;
  severity: Severity;
  emotionalTone: EmotionalTone;
  remorseSignal: RemorseSignal;
  shieldedSummary: string;
  keyPoints: string[];
  aiConfidence: number;
}

// ─── Client API Types ────────────────────────────────────────────────────────
export interface AppealsListResponse {
  appeals: AppealRecord[];
  stats: DailyStats;
}

export interface AppealDetailResponse {
  appeal: AppealRecord;
}

export interface VerdictRequest {
  action: VerdictAction;
  reason?: string;
}

export interface RevealRawResponse {
  rawText: string;
}

// ─── Severity Helpers ────────────────────────────────────────────────────────
export function getSeverityFromScore(score: number): Severity {
  if (score <= 33) return 'low';
  if (score <= 66) return 'medium';
  if (score <= 90) return 'high';
  return 'extreme';
}

export function getSeverityEmoji(severity: Severity): string {
  switch (severity) {
    case 'low': return '🟢';
    case 'medium': return '🟡';
    case 'high': return '🔴';
    case 'extreme': return '🔴';
  }
}

export function getRemorseEmoji(remorse: RemorseSignal): string {
  switch (remorse) {
    case 'genuine': return '✅';
    case 'performative': return '⚠️';
    case 'absent': return '❌';
  }
}

export function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
