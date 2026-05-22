# DEMO — ToxZen 🧘
## Judge Reproduction Guide

> This document gives exact steps to reproduce the ToxZen demo from scratch. Everything runs inside Reddit — no external dashboard, no login to a separate service.

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| Reddit account | Any account works (no mod role required to *view* the demo) |
| Access to r/ToxZenDemo | Public subreddit, <200 members — no join required to view posts |
| Browser | Desktop browser recommended (Devvit Custom Posts render best on desktop) |

---

## Step 1 — Visit the Test Subreddit

Navigate to: `reddit.com/r/ToxZenDemo`

You will see a pinned post titled **"🧘 ToxZen — Ban Appeal Queue (DEMO)"** at the top of the feed.

> If the pinned post is not visible, sort by **Hot** or **New**.

---

## Step 2 — Open the Appeal Queue

Click the pinned ToxZen Custom Post. The post renders a live appeal queue showing **5 pending appeals** with color-coded severity badges:

```
🔴 3 HIGH  |  🟡 1 MED  |  🟢 1 LOW
```

You should see the following appeals listed:
1. 🔴 u/RageGamer2026 — submitted ~2h ago
2. 🟢 u/NewMovieFan — submitted ~5h ago
3. 🟡 u/DebateKing99 — submitted ~1d ago
4. 🟡 u/ScienceDisputer — submitted ~1d ago
5. 🔴 u/BannedAgain404 — submitted ~2d ago

---

## Step 3 — Review a HIGH Toxicity Appeal (The Core Demo Moment)

Click **u/RageGamer2026** (🔴 HIGH).

The Shielded Review card opens. You will see:
- **User info**: account age, ban count, previous appeal count
- **AI Shielded Summary**: a 2–3 sentence clinical description — NO toxic language reproduced
- **Toxicity badge**: 🔴 HIGH (92/100)
- **Remorse indicator**: ❌ Absent
- **Key points**: bullet-point summary of the appeal's core claims
- **AI Confidence**: 96%
- Four action buttons: ✅ Accept | ❌ Deny | ⚠️ Escalate | 👁 Reveal Raw

**Expected observation**: The summary reads like a clinical assessment. None of the slurs, threats, or personal attacks from the raw appeal are visible.

**To process it**: Click **❌ Deny**. A quick-reason selector appears. Select any reason and confirm. The appeal status updates to "Denied" and the auto-response template is shown.

> Total time: ~8 seconds.

---

## Step 4 — Review a LOW Toxicity Appeal (Genuine Remorse)

Go back to the queue. Click **u/NewMovieFan** (🟢 LOW).

You will see:
- **Toxicity badge**: 🟢 LOW (12/100)
- **Remorse indicator**: ✅ Genuine
- Summary describes a new user who inadvertently violated the spoiler rule

Click **✅ Accept**. The appeal resolves. In a live subreddit, the user would be automatically unbanned and receive an acceptance modmail.

**Expected observation**: ToxZen distinguishes genuine remorse from toxic appeals — it is not just a toxicity filter.

---

## Step 5 — Review the MANIPULATOR Appeal (AI Nuance)

Click **u/DebateKing99** (🟡 MEDIUM).

You will see:
- **Remorse indicator**: ⚠️ Performative
- Key points include: "Guilt-tripping tactics detected", "Implied admin report threat"
- The summary notes the appeal *starts* apologetically but escalates

**Expected observation**: The AI catches passive-aggressive manipulation that a surface-level toxicity score would miss.

---

## Step 6 — Review the EDGE CASE Appeal (Escalation)

Click **u/ScienceDisputer** (🟡 MEDIUM).

You will see:
- **Remorse indicator**: 🔘 Neutral (contesting, not apologizing)
- Key points reference peer-reviewed sources
- AI flags this as warranting senior mod review

Click **⚠️ Escalate**. The appeal is flagged for escalation queue.

**Expected observation**: ToxZen handles gray areas — not just obvious accept/deny cases.

---

## Step 7 — Review the REPEAT OFFENDER (Historical Context)

Click **u/BannedAgain404** (🔴 HIGH).

You will see an additional context block:
```
⚠️ Repeat Offender
Prior bans: 3  |  Prior appeals: 2 (both denied)
```

**Expected observation**: ToxZen surfaces user history from KV Store so the mod doesn't need to look it up manually.

---

## Step 8 — View the Wellness Dashboard

Return to the queue view. Click the **📊 Stats** button (bottom of queue card).

The Wellness Dashboard shows:
- Appeals processed today / this week
- Average processing time per appeal
- Words of toxic content shielded
- Decision breakdown (accepted / denied / escalated)
- Motivational message: *"You've been shielded from X words of toxic content today. Thank you for keeping your community safe."*

---

## Step 9 — (Optional) Test the Appeal Submission Form

To see the user-facing intake side:

1. From the ToxZen Custom Post menu, select **"Submit Ban Appeal"**
2. Fill in the form: select a rule, write a short appeal text (min 50 chars), add optional context
3. Submit — the appeal enters the queue with status "Analyzing..."
4. Within 3–5 seconds, the appeal reloads as "Ready" with an AI-generated shielded summary

> Note: In the demo subreddit, appeal processing uses pre-seeded fixture data for deterministic results. A live subreddit would call the Gemini Flash API in real time.

---

## Troubleshooting

| Issue | Resolution |
|-------|-----------|
| Custom Post shows blank / loading | Reload the page. Devvit Custom Posts sometimes require a hard refresh on first load. |
| Appeal queue shows 0 pending | The seed data may need to be re-run. Contact the submitter via Devpost. |
| "Error: AI analysis unavailable" | Fallback state — the appeal shows a "Manual Review Required" banner. Verdict buttons still work. |
| Appeals show as already processed | Another reviewer processed them. Contact the submitter to reset the demo subreddit. |

---

## Resetting the Demo

If you need a clean slate (all 5 appeals back to "Pending"), the submitter can re-run:

```bash
python scripts/seed.py --reset
```

This restores all 5 fixture appeals to `status: ready` with pre-computed AI analysis results, without re-calling the Gemini API.
