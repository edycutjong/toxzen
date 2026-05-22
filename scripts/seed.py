#!/usr/bin/env python3
# scripts/seed.py
# Generates deterministic test data for ToxZen demo
# Run: python3 scripts/seed.py
# Requires: Python 3.8+, no external dependencies

import json
import os
import sys
import time
from datetime import datetime, timezone

def main():
    now_ms = int(time.time() * 1000)
    subreddit = "ToxZenDemo"
    
    # Load appeals.json
    fixtures_path = os.path.join("data", "fixtures", "appeals.json")
    if not os.path.exists(fixtures_path):
        print(f"Error: {fixtures_path} not found.", file=sys.stderr)
        return

    with open(fixtures_path, "r") as f:
        appeals = json.load(f)

    # Relative time offsets in ms:
    # appeal 1: 2 hours ago
    # appeal 2: 5 hours ago
    # appeal 3: 24 hours ago
    # appeal 4: 27 hours ago
    # appeal 5: 48 hours ago
    offsets = [
        2 * 3600 * 1000,
        5 * 3600 * 1000,
        24 * 3600 * 1000,
        27 * 3600 * 1000,
        48 * 3600 * 1000
    ]

    # Map appeal index to text file
    txt_files = [
        "appeal_001_rage.txt",
        "appeal_002_genuine.txt",
        "appeal_003_manipulator.txt",
        "appeal_004_edgecase.txt",
        "appeal_005_repeat.txt"
    ]

    pending_members = []

    for i, appeal in enumerate(appeals):
        appeal_id = appeal["id"]
        submitted_at = now_ms - offsets[i]
        appeal["submittedAt"] = submitted_at
        appeal["subreddit"] = subreddit

        # Read the actual raw text from txt file
        txt_path = os.path.join("data", "fixtures", txt_files[i])
        if os.path.exists(txt_path):
            with open(txt_path, "r") as tf:
                raw_text = tf.read().strip()
        else:
            raw_text = appeal["appealText"]

        # If analysis exists, adjust analyzedAt
        if "analysis" in appeal:
            appeal["analysis"]["analyzedAt"] = submitted_at + 5000
            # Ready appeal has shielded summary in appealText field
            appeal["appealText"] = appeal["analysis"]["shieldedSummary"]

        # 1. Print Redis SET for raw text
        raw_key = f"raw:{subreddit}:{appeal_id}"
        print(f"SET {raw_key} {json.dumps(raw_text)}")

        # 2. Print Redis SET for full AppealRecord
        appeal_key = f"appeal:{subreddit}:{appeal_id}"
        print(f"SET {appeal_key} {json.dumps(appeal)}")

        # 3. Add to ZADD list if pending/actionable
        if appeal["status"] in ["ready", "analyzing", "manual_review", "pending"] or (appeal.get("verdict") and appeal["verdict"].get("redditActionStatus") == "failed"):
            pending_members.append((submitted_at, appeal_id))

    # Print ZADD commands for pending queue list
    if pending_members:
        zadd_args = " ".join(f"{score} {member}" for score, member in pending_members)
        print(f"ZADD appeals:{subreddit}:pending {zadd_args}")

    # Output stats reset for today
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    stats = {"date": today, "processed": 0, "accepted": 0, "denied": 0, "escalated": 0, "wordsShielded": 0}
    print(f"SET stats:{subreddit}:daily:{today} {json.dumps(stats)}")

if __name__ == "__main__":
    main()
