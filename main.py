# ─────────────────────────────────────────────────────────────────────────────
# Consensus AI — main.py
# The entire backend + AI brain in one file.
#
# What this file does (plain English):
#   1. Runs a web server (FastAPI) on port 8000
#   2. Accepts poll creation, votes, and results requests from the frontend
#   3. Sends each vote through two AI layers:
#      Layer 1 → Llama 3.1 reads the text and extracts the core concept
#      Layer 2 → nomic-embed-text converts the concept into numbers,
#                then compares it to existing clusters to find a match
#   4. Groups similar answers together into clusters (the consensus)
# ─────────────────────────────────────────────────────────────────────────────

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import httpx
import json
import re
import uuid
import asyncio
import numpy as np
from datetime import datetime, timedelta


# ─────────────────────────────────────────────
# APP SETUP
# ─────────────────────────────────────────────

app = FastAPI(title="Consensus AI", version="1.0.0")

# CORS: allows the React frontend (running on a different port) to talk to this server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # In production, replace "*" with your actual frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────
# IN-MEMORY DATABASE
# ─────────────────────────────────────────────
# Think of this as a Python dictionary acting as a temporary database.
# Each poll gets its own entry, keyed by a unique poll_id.
# Shape: { "poll_id": { question, admin_token, settings, status, clusters, ... } }
#
# NOTE: This resets when the server restarts. SQLite migration comes later.

POLL_DATABASE: dict = {}

# One async lock per poll — prevents two votes from corrupting the same cluster
# simultaneously when multiple people vote at the same time.
POLL_LOCKS: dict = {}


# ─────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────

OLLAMA_URL = "http://localhost:11434"   # Ollama runs locally on this port
LLM_MODEL = "llama3.1"                 # Layer 1: concept extraction
EMBED_MODEL = "nomic-embed-text"        # Layer 2: semantic embedding
SIMILARITY_THRESHOLD = 0.78             # How similar two concepts must be to merge


# ─────────────────────────────────────────────
# REQUEST / RESPONSE MODELS
# ─────────────────────────────────────────────
# Pydantic models define the shape of data coming IN from the frontend.
# FastAPI validates them automatically — wrong shape = instant error.

class CreatePollRequest(BaseModel):
    question: str
    is_public: bool = False
    deadline_minutes: Optional[int] = None   # None = no deadline

class VoteRequest(BaseModel):
    answer: str

class UpdateSettingsRequest(BaseModel):
    is_public: Optional[bool] = None
    deadline_minutes: Optional[int] = None


# ─────────────────────────────────────────────
# LAYER 1: SYSTEM PROMPT (negation-aware)
# ─────────────────────────────────────────────
# This is the instruction set we send to Llama 3.1 before every vote.
# The most important rule: only extract what the user WANTS, never what they REJECT.
# This fixes the "fried rice" bug — "don't eat fried rice" → No Preference, not "fried rice".

def build_system_prompt(question: str) -> str:
    return f"""You are a semantic concept extractor for a public polling system.

POLL QUESTION: "{question}"

YOUR JOB: Extract only the concept(s) the user is AFFIRMING or SUGGESTING as their answer to the poll question.

─── CRITICAL NEGATION RULE ───
NEVER extract concepts the user is NEGATING, REJECTING, or saying NOT to do.
Negation signals: don't, doesn't, not, never, avoid, except, but not, other than, anything but, no, without

WRONG: "don't eat fried rice" → extracting "fried rice"
CORRECT: "don't eat fried rice" → user affirms nothing → output {{"concepts": ["No Preference"]}}

─── OUTPUT RULES ───
1. If the user affirms something → extract it (max 2 concepts, 1–3 words each, English)
2. If the user only states what they DON'T want, or has no preference → {{"concepts": ["No Preference"]}}
3. If the answer is gibberish, random characters, or unrelated to the question → {{"concepts": ["Others"]}}
4. Always normalize to English — if the user writes in another language, translate the concept.
5. Output ONLY valid JSON. No explanation. No extra text. Nothing else.

─── FORMAT ───
{{"concepts": ["concept"]}}
{{"concepts": ["concept_1", "concept_2"]}}

─── EXAMPLES (question: "What should I eat next?") ───
"pizza"                              → {{"concepts": ["pizza"]}}
"I'd love ramen or maybe sushi"      → {{"concepts": ["ramen", "sushi"]}}
"anything just dont eat fried rice"  → {{"concepts": ["No Preference"]}}
"not sushi"                          → {{"concepts": ["No Preference"]}}
"nasi goreng is great"               → {{"concepts": ["fried rice"]}}
"pizza but not thin crust"           → {{"concepts": ["pizza"]}}
"I don't care"                       → {{"concepts": ["No Preference"]}}
"idk anything works"                 → {{"concepts": ["No Preference"]}}
"asdfghjkl"                          → {{"concepts": ["Others"]}}
"the weather is nice today"          → {{"concepts": ["Others"]}}"""


# ─────────────────────────────────────────────
# HELPER: Extract concepts via Llama 3.1
# ─────────────────────────────────────────────

async def extract_concepts(question: str, answer: str) -> list[str]:
    """
    Sends the voter's answer to Llama 3.1 with the system prompt.
    Returns a list of extracted concept strings, e.g. ["pizza"] or ["ramen", "sushi"].
    """
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            f"{OLLAMA_URL}/api/chat",
            json={
                "model": LLM_MODEL,
                "messages": [
                    {"role": "system", "content": build_system_prompt(question)},
                    {"role": "user", "content": answer},
                ],
                "stream": False,
            },
        )
        response.raise_for_status()
        raw_text = response.json()["message"]["content"]
        return parse_concepts_from_llm(raw_text)


def parse_concepts_from_llm(raw: str) -> list[str]:
    """
    Parses the LLM's response into a clean list of concepts.
    Handles cases where the LLM adds extra explanation text around the JSON.
    """
    # Try direct JSON parse first
    try:
        data = json.loads(raw.strip())
        concepts = data.get("concepts", ["Others"])
        return [c for c in concepts if isinstance(c, str) and c.strip()]
    except json.JSONDecodeError:
        pass

    # Fallback: find JSON block inside messy text
    match = re.search(r'\{[^{}]*"concepts"[^{}]*\}', raw, re.DOTALL)
    if match:
        try:
            data = json.loads(match.group())
            concepts = data.get("concepts", ["Others"])
            return [c for c in concepts if isinstance(c, str) and c.strip()]
        except json.JSONDecodeError:
            pass

    return ["Others"]


# ─────────────────────────────────────────────
# HELPER: Generate embedding vector
# ─────────────────────────────────────────────

async def get_embedding(text: str) -> list[float]:
    """
    Converts a concept string into a vector (list of ~768 numbers).
    These numbers represent the *meaning* of the word in mathematical space.
    Two words with similar meaning will have vectors that point in similar directions.
    """
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{OLLAMA_URL}/api/embeddings",
            json={"model": EMBED_MODEL, "prompt": text},
        )
        response.raise_for_status()
        return response.json()["embedding"]


def cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    """
    Measures how similar two vectors are. Returns a score between 0.0 and 1.0.
    1.0 = identical meaning. 0.0 = completely unrelated.
    We merge concepts that score above SIMILARITY_THRESHOLD (0.78).
    """
    a = np.array(vec_a)
    b = np.array(vec_b)
    denom = np.linalg.norm(a) * np.linalg.norm(b)
    if denom == 0:
        return 0.0
    return float(np.dot(a, b) / denom)


# ─────────────────────────────────────────────
# HELPER: Upsert static buckets (Others / No Preference)
# ─────────────────────────────────────────────

def upsert_static_bucket(poll: dict, label: str):
    """
    Finds an existing 'Others' or 'No Preference' bucket and adds a vote,
    or creates it if it doesn't exist yet.
    Static buckets don't get embeddings — they're catch-all containers.
    """
    for cluster in poll["clusters"]:
        if cluster["label"] == label:
            cluster["votes"] += 1
            return
    poll["clusters"].append({
        "label": label,
        "votes": 1,
        "embedding": [],  # no embedding for static buckets
        "responses": [],
    })


# ─────────────────────────────────────────────
# ENDPOINT 0: Get public poll info (no auth)
# GET /api/poll/{poll_id}
# ─────────────────────────────────────────────

@app.get("/api/poll/{poll_id}")
async def get_poll_info(poll_id: str):
    """
    Returns just the question, status, and public visibility flag.
    No auth required — the VoterPage uses this to display the question
    even when the poll results are private (is_public = False).
    """
    if poll_id not in POLL_DATABASE:
        raise HTTPException(status_code=404, detail="Poll not found.")
    poll = POLL_DATABASE[poll_id]
    return {
        "poll_id": poll_id,
        "question": poll["question"],
        "status": poll["status"],
        "is_public": poll["settings"]["is_public"],
    }


# ─────────────────────────────────────────────
# ENDPOINT 1: Create a new poll
# POST /api/create-poll
# ─────────────────────────────────────────────

@app.post("/api/create-poll")
async def create_poll(request: CreatePollRequest):
    """
    Creates a new poll and returns two things the frontend must store:
    - poll_id: the public identifier (goes in the voter URL)
    - admin_token: a secret UUID only the poll creator has (proves ownership)
    """
    poll_id = str(uuid.uuid4())[:8]     # short 8-char public ID, e.g. "a3f9b2c1"
    admin_token = str(uuid.uuid4())     # full UUID secret for the owner

    deadline = None
    if request.deadline_minutes:
        deadline = (datetime.utcnow() + timedelta(minutes=request.deadline_minutes)).isoformat()

    POLL_DATABASE[poll_id] = {
        "question": request.question,
        "admin_token": admin_token,
        "settings": {
            "is_public": request.is_public,
            "deadline": deadline,
        },
        "status": "active",      # "active" or "ended"
        "clusters": [],           # grows as votes come in
        "total_votes": 0,
        "created_at": datetime.utcnow().isoformat(),
    }
    POLL_LOCKS[poll_id] = asyncio.Lock()

    return {
        "poll_id": poll_id,
        "admin_token": admin_token,        # ⚠️ Frontend must save this — shown only once
        "voter_url": f"/poll/{poll_id}",
        "admin_url": f"/poll/{poll_id}/admin",
        "question": request.question,
    }


# ─────────────────────────────────────────────
# ENDPOINT 2: Submit a vote
# POST /api/vote/{poll_id}
# ─────────────────────────────────────────────

@app.post("/api/vote/{poll_id}")
async def submit_vote(poll_id: str, request: VoteRequest):
    """
    The core pipeline. Each vote goes through:
      1. Poll validation (exists? active? not past deadline?)
      2. Layer 1 — Llama extracts the concept from the raw text
      3. Layer 2 — Embedding generated, compared to existing clusters
      4. Cluster merge or creation
    """
    # ── Validate ──
    if poll_id not in POLL_DATABASE:
        raise HTTPException(status_code=404, detail="Poll not found.")

    poll = POLL_DATABASE[poll_id]

    if poll["status"] == "ended":
        raise HTTPException(status_code=400, detail="This poll has ended.")

    if poll["settings"]["deadline"]:
        deadline_dt = datetime.fromisoformat(poll["settings"]["deadline"])
        if datetime.utcnow() > deadline_dt:
            poll["status"] = "ended"
            raise HTTPException(status_code=400, detail="This poll has ended (deadline passed).")

    # ── Layer 1: Concept extraction (done BEFORE acquiring the lock) ──
    # Ollama calls are slow (~1–3s). We run them outside the lock so other
    # votes aren't blocked waiting. Only the fast in-memory write needs the lock.
    concepts = await extract_concepts(poll["question"], request.answer)

    # ── Pre-generate embeddings for non-static concepts (also outside lock) ──
    concept_embeddings: dict = {}
    for concept in concepts:
        if concept.strip().lower() not in ["others", "no preference"]:
            concept_embeddings[concept] = await get_embedding(concept)

    # ── Layer 2: Match to clusters (inside lock — modifies shared state) ──
    async with POLL_LOCKS[poll_id]:
        for concept in concepts:
            concept_lower = concept.strip().lower()

            # Static buckets: skip embedding math entirely
            if concept_lower in ["others", "no preference"]:
                upsert_static_bucket(poll, concept.strip())
                continue

            embedding = concept_embeddings[concept]
            best_match_idx = -1
            best_similarity = 0.0

            # Compare this concept's embedding against every existing cluster
            for i, cluster in enumerate(poll["clusters"]):
                if not cluster["embedding"]:   # skip static buckets
                    continue
                sim = cosine_similarity(embedding, cluster["embedding"])
                if sim > best_similarity:
                    best_similarity = sim
                    best_match_idx = i

            if best_similarity >= SIMILARITY_THRESHOLD:
                # Similar enough → merge into existing cluster
                poll["clusters"][best_match_idx]["votes"] += 1
                poll["clusters"][best_match_idx]["responses"].append(request.answer)
            else:
                # New concept → create a new cluster
                poll["clusters"].append({
                    "label": concept.strip(),
                    "votes": 1,
                    "embedding": embedding,
                    "responses": [request.answer],
                })

        poll["total_votes"] += 1

    return {"status": "voted", "concepts_extracted": concepts}


# ─────────────────────────────────────────────
# ENDPOINT 3: Get results
# GET /api/results/{poll_id}
# ─────────────────────────────────────────────

@app.get("/api/results/{poll_id}")
async def get_results(poll_id: str, admin_token: Optional[str] = None):
    """
    Returns the current cluster rankings, sorted by votes (highest first).
    - If the poll is public → anyone can see results
    - If the poll is private → only the owner (valid admin_token) can see results
    Embeddings are stripped from the response — the frontend doesn't need raw vectors.
    """
    if poll_id not in POLL_DATABASE:
        raise HTTPException(status_code=404, detail="Poll not found.")

    poll = POLL_DATABASE[poll_id]
    is_owner = admin_token and admin_token == poll["admin_token"]

    if not poll["settings"]["is_public"] and not is_owner:
        raise HTTPException(status_code=403, detail="Results are not public for this poll.")

    sorted_clusters = sorted(poll["clusters"], key=lambda c: c["votes"], reverse=True)

    clean_clusters = [
        {"label": c["label"], "votes": c["votes"]}
        for c in sorted_clusters
    ]

    return {
        "poll_id": poll_id,
        "question": poll["question"],
        "status": poll["status"],
        "total_votes": poll["total_votes"],
        "clusters": clean_clusters,
        "settings": poll["settings"] if is_owner else {},
    }


# ─────────────────────────────────────────────
# ENDPOINT 4: End poll immediately
# POST /api/end-poll/{poll_id}?admin_token=xxx
# ─────────────────────────────────────────────

@app.post("/api/end-poll/{poll_id}")
async def end_poll(poll_id: str, admin_token: str):
    """
    Freezes the poll. No more votes accepted after this.
    Only the poll owner (valid admin_token) can call this.
    """
    if poll_id not in POLL_DATABASE:
        raise HTTPException(status_code=404, detail="Poll not found.")

    poll = POLL_DATABASE[poll_id]

    if admin_token != poll["admin_token"]:
        raise HTTPException(status_code=403, detail="Invalid admin token.")

    poll["status"] = "ended"
    return {"status": "ended", "poll_id": poll_id, "total_votes": poll["total_votes"]}


# ─────────────────────────────────────────────
# ENDPOINT 5: Update poll settings
# PATCH /api/settings/{poll_id}?admin_token=xxx
# ─────────────────────────────────────────────

@app.patch("/api/settings/{poll_id}")
async def update_settings(poll_id: str, request: UpdateSettingsRequest, admin_token: str):
    """
    Lets the poll owner toggle public visibility or change/set a deadline
    while the poll is still running.
    """
    if poll_id not in POLL_DATABASE:
        raise HTTPException(status_code=404, detail="Poll not found.")

    poll = POLL_DATABASE[poll_id]

    if admin_token != poll["admin_token"]:
        raise HTTPException(status_code=403, detail="Invalid admin token.")

    if request.is_public is not None:
        poll["settings"]["is_public"] = request.is_public

    if request.deadline_minutes is not None:
        poll["settings"]["deadline"] = (
            datetime.utcnow() + timedelta(minutes=request.deadline_minutes)
        ).isoformat()

    return {"status": "updated", "settings": poll["settings"]}


# ─────────────────────────────────────────────
# HEALTH CHECK
# GET /health
# ─────────────────────────────────────────────

@app.get("/health")
async def health():
    """Quick check that the server is running. Also shows active poll count."""
    return {
        "status": "ok",
        "active_polls": sum(1 for p in POLL_DATABASE.values() if p["status"] == "active"),
        "total_polls": len(POLL_DATABASE),
    }
