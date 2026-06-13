# ─────────────────────────────────────────────────────────────────────────────
# test_api.py — Consensus AI endpoint tester
#
# Run this AFTER starting the server with: uvicorn main:app --reload
# Then in a second terminal: python test_api.py
#
# This script tests all 5 endpoints in sequence and prints clear results.
# ─────────────────────────────────────────────────────────────────────────────

import requests
import json
import time

BASE_URL = "http://localhost:8000"

def pretty(label, response):
    print(f"\n{'─'*50}")
    print(f"  {label}")
    print(f"  Status: {response.status_code}")
    try:
        print(f"  Response: {json.dumps(response.json(), indent=2)}")
    except Exception:
        print(f"  Response: {response.text}")
    print(f"{'─'*50}")


# ── 0. Health check ──────────────────────────────────────────────────────────
print("\n🔍 Checking server is running...")
try:
    r = requests.get(f"{BASE_URL}/health")
    pretty("GET /health", r)
except Exception:
    print("\n❌  Server is not running. Start it first:")
    print("    uvicorn main:app --reload\n")
    exit(1)


# ── 1. Create a poll ─────────────────────────────────────────────────────────
print("\n📋 Creating a poll...")
r = requests.post(f"{BASE_URL}/api/create-poll", json={
    "question": "What should I eat next?",
    "is_public": True,
    "deadline_minutes": None
})
pretty("POST /api/create-poll", r)

data = r.json()
POLL_ID = data["poll_id"]
ADMIN_TOKEN = data["admin_token"]
print(f"\n  ✅ Poll ID: {POLL_ID}")
print(f"  🔑 Admin Token: {ADMIN_TOKEN}")


# ── 2. Submit votes ───────────────────────────────────────────────────────────
# These test the core AI pipeline, including the negation fix.
# Expected behavior:
#   - "pizza" → creates cluster "pizza"
#   - "I'd love some pizza" → merges into "pizza"
#   - "anything just dont eat the fried rice" → "No Preference" (negation fix!)
#   - "ramen" → creates cluster "ramen"
#   - "asdfghjkl" → "Others" (spam filter)

test_votes = [
    ("pizza",                                   "→ should create 'pizza' cluster"),
    ("I'd love some pizza tonight",             "→ should MERGE into 'pizza'"),
    ("anything just dont eat the fried rice",   "→ negation fix: should be 'No Preference', NOT 'fried rice'"),
    ("ramen sounds good",                       "→ should create 'ramen' cluster"),
    ("nasi goreng is great",                    "→ should translate to 'fried rice' (new cluster)"),
    ("asdfghjkl",                               "→ should go to 'Others' (spam filter)"),
    ("honestly anything is fine with me",       "→ should be 'No Preference'"),
    ("pizza please!!",                          "→ should MERGE into 'pizza'"),
]

print(f"\n🗳️  Submitting {len(test_votes)} test votes...")
print("  (Each vote goes through Llama + embedding — this may take 10–30s per vote)\n")

for answer, note in test_votes:
    print(f"  Voting: \"{answer}\"  {note}")
    r = requests.post(f"{BASE_URL}/api/vote/{POLL_ID}", json={"answer": answer})
    if r.status_code == 200:
        concepts = r.json().get("concepts_extracted", [])
        print(f"  └─ Extracted: {concepts}")
    else:
        print(f"  └─ ERROR {r.status_code}: {r.text}")
    time.sleep(1)  # small pause between votes


# ── 3. View results ───────────────────────────────────────────────────────────
print("\n📊 Fetching results...")
r = requests.get(f"{BASE_URL}/api/results/{POLL_ID}", params={"admin_token": ADMIN_TOKEN})
pretty("GET /api/results (as owner)", r)

result = r.json()
print("\n  📈 CLUSTER LEADERBOARD:")
for i, cluster in enumerate(result.get("clusters", []), 1):
    bar = "█" * cluster["votes"]
    print(f"  {i}. {cluster['label']:<20} {bar} ({cluster['votes']} votes)")


# ── 4. Update settings ────────────────────────────────────────────────────────
print("\n⚙️  Updating settings (toggling public off)...")
r = requests.patch(
    f"{BASE_URL}/api/settings/{POLL_ID}",
    json={"is_public": False},
    params={"admin_token": ADMIN_TOKEN}
)
pretty("PATCH /api/settings", r)

# Confirm that a non-owner can no longer see results
print("\n🔒 Confirming results are now hidden from public...")
r = requests.get(f"{BASE_URL}/api/results/{POLL_ID}")  # no admin_token
pretty("GET /api/results (no token — should be 403)", r)


# ── 5. End the poll ───────────────────────────────────────────────────────────
print("\n🛑 Ending the poll...")
r = requests.post(
    f"{BASE_URL}/api/end-poll/{POLL_ID}",
    params={"admin_token": ADMIN_TOKEN}
)
pretty("POST /api/end-poll", r)

# Confirm that votes are now rejected
print("\n🚫 Confirming votes are rejected after poll ends...")
r = requests.post(f"{BASE_URL}/api/vote/{POLL_ID}", json={"answer": "sushi"})
pretty("POST /api/vote (should be 400 — poll ended)", r)


print("\n✅ All tests complete.\n")
