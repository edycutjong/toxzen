# ToxZen 🧘

*AI-shielded ban appeal processor that protects moderators from toxic content while helping them make faster, fairer decisions — all inside Reddit native UI.*

![ToxZen](https://raw.githubusercontent.com/edycutjong/toxzen/main/docs/readme-hero.png)

[![Built for Devpost](https://img.shields.io/badge/Devpost-Mod_Tools_Migration-8b5cf6?style=for-the-badge)](https://mod-tools-migration.devpost.com)

![Devvit](https://img.shields.io/badge/Devvit_Web-FF4500?style=flat&logo=reddit&logoColor=white)
![React](https://img.shields.io/badge/React_19-61DAFB?style=flat&logo=react&logoColor=black)
![Hono](https://img.shields.io/badge/Hono-E36002?style=flat&logo=hono&logoColor=white)
![Gemini](https://img.shields.io/badge/Gemini_Flash-4285F4?style=flat&logo=google&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
[![CI](https://github.com/edycutjong/toxzen/actions/workflows/ci.yml/badge.svg)](https://github.com/edycutjong/toxzen/actions/workflows/ci.yml)

---

## 📸 See it in Action

![ToxZen Demo](https://raw.githubusercontent.com/edycutjong/toxzen/main/docs/og-image.png)

> **Toxic wall of text → AI-shielded summary with severity badge → one-click verdict.** The mod never reads a single slur.

---

## 💡 The Problem & Solution

A volunteer moderator of a 2-million-member subreddit opens their 47th ban appeal of the day — another wall of slurs, threats, and personal attacks — and wonders if it's worth continuing.

**Moderator burnout is real.** Studies show content moderators experience PTSD-like symptoms from prolonged toxic exposure. AutoMod can't summarize appeal content, assess remorse, or shield mods from emotional harm. Until now.

**ToxZen** uses Gemini Flash AI to create a protective shield between toxic content and moderators:

1. 📝 **User submits appeal** → Raw text stored in Redis with 30-day TTL
2. 🤖 **AI analyzes** → Generates clean, neutral summary + toxicity score + remorse signal
3. 🛡️ **Mod reviews shielded summary** → Makes verdict without reading toxic content
4. ✅ **One-click verdict** → Accept (auto-unban), Deny (auto-response), or Escalate

**Key Features:**
- 🛡️ **AI Content Shield:** Gemini Flash generates clinical summaries — never reproduces toxic language
- 🎯 **Severity Scoring:** 0–100 toxicity scale with color-coded badges (🟢 Low / 🟡 Medium / 🔴 High / 🔴 Extreme)
- 🧠 **Remorse Detection:** Genuine ✅ vs. Performative ⚠️ vs. Absent ❌ — AI identifies manipulation
- ⚡ **One-Click Verdicts:** Accept, Deny, Escalate with configurable auto-response templates
- 👁 **Raw Reveal (2-step):** Content warning dialog before showing unfiltered text — opt-in only
- 📊 **Wellness Dashboard:** "You've been shielded from 1,847 words of toxic content today"
- 🔒 **30-Day TTL:** All data auto-expires per Reddit's user-deletion compliance policies
- ⏱️ **Cooldown Enforcement:** 24-hour appeal cooldown prevents spam

## 🏗️ Architecture & Tech Stack

| Layer | Technology |
|---|---|
| **Platform** | Devvit Web (Client/Server) |
| **Frontend** | React 19 + Vanilla CSS |
| **Server** | Hono (TypeScript) |
| **AI Engine** | Google Gemini 1.5 Flash (`responseMimeType: "application/json"`) |
| **Storage** | Devvit Redis (KV Store) with sorted sets |
| **Build** | Vite + @devvit/start plugin |
| **Testing** | Vitest |

```mermaid
graph LR
    A[Banned User] -->|Submit Appeal| B[Devvit Form]
    B -->|Store raw text| C[Redis KV Store]
    B -->|Schedule job| D[Scheduler]
    D -->|Analyze| E[Gemini Flash API]
    E -->|JSON response| F[Shielded Summary]
    F -->|Display| G[Mod Queue UI]
    G -->|Accept/Deny| H[Verdict Engine]
    H -->|Auto-response| I[Reddit API]
    
    style E fill:#4285F4,color:#fff
    style F fill:#8b5cf6,color:#fff
    style G fill:#06b6d4,color:#fff
```

### Server Endpoints (10 Hono routes)

| Endpoint | Type | Purpose |
|---|---|---|
| `/internal/menu/appeal-form` | Menu | Show appeal submission form |
| `/internal/menu/open-queue` | Menu | Create queue Custom Post |
| `/internal/menu/wellness` | Menu | Open wellness dashboard |
| `/internal/form/appeal-submit` | Form | Process appeal + schedule AI |
| `/internal/form/verdict-submit` | Form | Record mod verdict |
| `/internal/scheduler/analyze-appeal` | Scheduler | Gemini API call with retry |
| `/api/appeals` | API | List pending appeals |
| `/api/appeal/:id` | API | Single appeal detail |
| `/api/appeal/:id/verdict` | API | Submit verdict from UI |
| `/api/appeal/:id/reveal` | API | Reveal raw text (opt-in) |

## 🏆 Hackathon Track Alignment

| Track | Alignment |
|---|---|
| **Best New Mod Tool** ($10,000) | ✅ Novel capability AutoMod cannot do — AI content shielding + remorse detection |
| **Moderator's Choice** ($10,000) | ✅ Every moderator feels this pain personally — burnout from toxic appeals |

### Why Devvit is Load-Bearing

ToxZen cannot be rebuilt as a generic server app or swapped for a generic frontend stack. The Devvit platform is *load-bearing* in several critical areas:
1. **Interactive Custom Posts:** Renders the queue UI and wellness stats inside Reddit's native feed using Custom Post components, removing the friction of navigating to external dashboards.
2. **Reddit API Integration:** Unbans users and sends modmails securely via native platform primitives, avoiding external authentication complex scripts.
3. **Scheduler Service:** Handles the async execution of the Gemini Flash toxicity analysis without maintaining a separate message queue or server.
4. **Redis KV Store & Sorted Sets:** Stores raw appeals, analysis results, and daily wellness logs with a strict 30-day TTL policy, ensuring compliance with Reddit user data deletion policies.

## 🚀 Getting Started

### Fetch Domains Disclosure
This application makes outgoing HTTP requests to:
- `generativelanguage.googleapis.com` (Google Gemini Flash API for toxicity assessment)

Please ensure this domain is whitelisted/allowed in your environment settings (disclosed in accordance with Devvit review guidelines).

### Prerequisites
- Node.js ≥ 20
- npm
- [Devvit CLI](https://developers.reddit.com/docs/get-started/quickstart)

### Installation

```bash
# Clone the repo
git clone https://github.com/edycutjong/toxzen.git
cd toxzen

# Install dependencies
npm install

# Set your Gemini API key via Devvit settings
npx devvit settings set geminiApiKey

# Build
npm run build

# Start playtest
npm run dev
```

> **For Judges:** The app uses Devvit's built-in settings system. Set the Gemini API key via `npx devvit settings set geminiApiKey` after installing.

## 🧪 Testing & CI

```bash
npm run typecheck       # TypeScript strict mode
npm run test            # Vitest
npm run test:coverage   # Coverage report
npm run ci              # Full CI pipeline (typecheck + test + build)
```

CI runs on every push/PR against Node.js `[20, 22, 24]` matrix.

## 📁 Project Structure

```
ToxZen/
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                    # CI pipeline (typecheck + test + build)
│   │   └── codeql.yml                # Security scanning
│   └── dependabot.yml                # Dependency updates
├── data/
│   └── fixtures/
│       └── appeals.json              # 5 seed appeals (demo data)
├── docs/                             # README assets
├── src/
│   ├── client/
│   │   ├── components/
│   │   │   ├── AppealCard.tsx        # Queue list card
│   │   │   ├── QueueView.tsx         # Appeal queue page
│   │   │   ├── RevealRawDialog.tsx   # 2-step content warning
│   │   │   ├── SeverityBadge.tsx     # Color-coded toxicity badge
│   │   │   ├── ShieldedReview.tsx    # Full appeal review
│   │   │   ├── VerdictButtons.tsx    # Accept/Deny/Escalate/Reveal
│   │   │   └── WellnessDashboard.tsx # Mod wellness stats
│   │   ├── styles.css                # Dark SOC theme (500+ lines)
│   │   ├── App.tsx                   # Main app with view routing
│   │   ├── main.tsx                  # React entry point
│   │   ├── queue.html                # Inline Custom Post entry
│   │   ├── review.html               # Expanded review entry
│   │   └── wellness.html             # Wellness dashboard entry
│   ├── server/
│   │   └── index.ts                  # Hono server (10 endpoints)
│   └── shared/
│       └── types.ts                  # TypeScript interfaces
├── devvit.json                       # Devvit app config
├── package.json                      # Dependencies & scripts
├── vite.config.ts                    # Vite + React + Devvit plugin
├── .env.example                      # Environment template
├── PRIVACY.md                        # Privacy policy
├── TERMS.md                          # Terms of service
├── LICENSE                           # MIT
└── README.md                         # You are here
```

## 📄 License

[MIT](LICENSE) © 2026 Edy Cu

## 🙏 Acknowledgments

Built for the [Devpost Mod Tools Migration Hackathon 2026](https://mod-tools-migration.devpost.com). Thank you to Reddit for the Devvit platform and Google for the Gemini API.

---

**🧘 Protecting the people who protect your community.**
