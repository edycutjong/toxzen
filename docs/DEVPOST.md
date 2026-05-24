## Inspiration
Moderators are the unpaid immune system of Reddit, dedicating hours of volunteer work to keep communities safe. However, processing ban appeals is notoriously one of the most draining tasks. Moderators are forced to read through hundreds of appeals every week, many of which contain raw, unfiltered anger, slurs, personal insults, and graphic threats. 

The emotional toll is heavy, leading directly to moderator burnout. The best moderators—those who care enough to review cases carefully—are often the first to quit. We built **ToxZen** to serve as a protective shield between toxic content and moderators. Our goal is to protect volunteer mental health while helping them make faster, fairer moderation decisions without ever seeing a single slur.

## What it does
ToxZen is an AI-powered ban appeal processor built natively inside Reddit. By shifting the toxic reading load to AI, ToxZen ensures that moderators can process appeals safely and efficiently.

* **Structured Appeal Intake**: Banned users submit their appeals through a native Devvit Form, gathering clean details (ban reason, unban justification, and apology text) to prevent abusive walls of text.
* **AI Content Shielding**: Upon submission, a background scheduler sends the appeal to Google Gemini Flash. Gemini assesses the toxicity level (0–100), emotional tone, and remorse sincerity (classifying it as *Genuine*, *Performative*, or *Absent*).
* **Clinical Summarization**: Gemini generates a neutral, clinical summary of the user's appeal, completely filtering out slurs, abuse, or threats.
* **Shielded Native UI**: Moderators view a Custom Post in their private queue containing the safe AI summary, a color-coded severity badge (🟢 Low / 🟡 Medium / 🔴 High / ⛔ Extreme), and the remorse analysis. The raw text is hidden behind a 2-step content warning and is only revealed if the mod explicitly opts in.
* **One-Click Verdicts**: Mod decisions are streamlined via native buttons: **Accept** (which automatically unbans the user), **Deny** (keeps the ban and replies with an auto-response), and **Escalate** (queues the appeal for team discussion).
* **Wellness Dashboard**: Tracks statistics showing moderators how many words of toxic content they have been shielded from and appeals processed.

## How we built it
ToxZen is built as a native Reddit Devvit application using a unified TypeScript stack:
* **Frontend**: React 19 and custom Vanilla CSS designed with a dark, premium command center dashboard aesthetic suited for Reddit's Custom Posts.
* **Server**: Hono handles incoming request routing, API endpoints, and clean data transport.
* **AI Integration**: Outgoing HTTP fetch connects to the Google Gemini 1.5 Flash API to retrieve structured JSON analysis.
* **Database & Jobs**: Devvit Redis KV Store manages appeal storage and caching. Devvit Scheduler queues and runs the async AI evaluations reliably.
* **Testing**: Covered by a comprehensive Vitest suite achieving 100% statement, branch, function, and line coverage.

## Challenges we ran into
* **Strict Privacy Compliance**: Ensuring compliance with Reddit's user-deletion policies required implementing a strict 30-day TTL (Time-To-Live) on all Redis-cached appeal data, while still preserving anonymized metrics for the cumulative Wellness Dashboard.
* **Peer Dependency Resolution**: Resolving packages in our testing and build pipeline (such as compatibility between Vite 6 and experimental Devvit plugins) required fine-tuning configurations to guarantee stable local builds and seamless GitHub Action checks.
* **Toxicity vs. Context**: Prompting the AI to accurately catch performative manipulation (e.g., "I'm sorry your feelings are fragile") while filtering out slurs required extensive tuning of the system instructions to maintain high summarization quality.

## Accomplishments that we're proud of
* **Zero Abuse Exposure**: Successfully creating an interface where moderators can review and settle highly toxic appeals in under 8 seconds without being exposed to any abusive text.
* **100% Native Integration**: Leveraging 6 distinct Devvit features (Custom Posts, Forms, KV Store, Scheduler, HTTP Fetch, Reddit API) to build a fully self-contained experience—no external extensions or dashboards required.
* **Production-Ready Quality**: Achieving 100% unit and integration test coverage, along with a clean, building production bundle.

## What we learned
* **The Power of Native APIs**: Devvit's native services (Scheduler, Redis, Custom Posts) are incredibly powerful for orchestrating background jobs and event-driven automation directly within Reddit's ecosystem.
* **Morale through Metrics**: Building the Wellness Dashboard demonstrated how showing moderators tangible proof of the emotional harm they avoided (e.g., "1,847 words of toxicity shielded") has a powerful positive impact on mod team morale.

## What's next for ToxZen
* **Collaborative Mod Debates**: Allowing multiple moderators to post notes and discuss complex appeals directly on the Custom Post queue card before locking a final verdict.
* **Sentiment Trend Analysis**: Providing subreddits with macro-level insights on toxicity trends to help them adjust auto-moderator filters dynamically.
* **Smarter Auto-Responses**: Using Gemini to draft personalized, empathetic, or firm unban/denial messages that address the specific details of the appeal while keeping the tone strictly professional.
