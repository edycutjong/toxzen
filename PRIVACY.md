# Privacy Policy — ToxZen

**Last Updated:** May 22, 2026

## What Data We Collect

ToxZen collects the following data when a banned user submits an appeal:

- **Username** (automatically from Reddit context)
- **Appeal text** (user-submitted)
- **Ban reason** (user-selected)
- **Submission timestamp**

## How We Process Data

- Appeal text is sent to **Google Gemini AI** (via `generativelanguage.googleapis.com`) for toxicity analysis
- The AI generates a safe summary — the raw text is stored separately and only shown to moderators on explicit request
- All processing happens server-side within Devvit's infrastructure

## Data Retention

- All appeal data (records, raw text, analysis, verdicts) is automatically deleted after **30 days** via Redis TTL
- Daily statistics are also retained for 30 days
- We comply with Reddit's user-deletion policies

## Data Sharing

- We do **not** sell or share user data with third parties
- Appeal text is sent to Google's Gemini API solely for analysis — Google's API terms apply
- No data is stored outside of Reddit's Devvit infrastructure

## Contact

For privacy questions, reach out via the app's subreddit or create an issue on the project repository.
