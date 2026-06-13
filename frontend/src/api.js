// api.js — all communication with the FastAPI backend
//
// Every function here maps to one backend endpoint.
// URLs are relative (/api/...) — Vite's dev proxy forwards them to http://localhost:8000.
// In production these would point to your actual domain.

async function request(path, options = {}) {
  const res = await fetch(path, options)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Something went wrong.' }))
    throw new Error(err.detail || 'Request failed')
  }
  return res.json()
}

// ── Poll creation ──────────────────────────────────────────────────────────

// Create a new poll. Returns { poll_id, admin_token, question, voter_url, admin_url }
export function createPoll({ question, is_public = false, deadline_minutes = null }) {
  return request('/api/create-poll', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, is_public, deadline_minutes }),
  })
}

// ── Voter actions ──────────────────────────────────────────────────────────

// Get public poll info (question + status). No auth needed.
// Used by VoterPage to display the question without needing results access.
export function getPollInfo(pollId) {
  return request(`/api/poll/${pollId}`)
}

// Submit a vote. Returns { status, concepts_extracted }
export function submitVote(pollId, answer) {
  return request(`/api/vote/${pollId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answer }),
  })
}

// ── Results ────────────────────────────────────────────────────────────────

// Get results. Without adminToken: only works if poll is public.
// With adminToken: always works, returns settings too.
export function getResults(pollId, adminToken = null) {
  const url = new URL(`/api/results/${pollId}`, window.location.origin)
  if (adminToken) url.searchParams.set('admin_token', adminToken)
  return request(url.pathname + url.search)
}

// ── Owner actions ──────────────────────────────────────────────────────────

// End poll immediately (owner only)
export function endPoll(pollId, adminToken) {
  return request(`/api/end-poll/${pollId}?admin_token=${encodeURIComponent(adminToken)}`, {
    method: 'POST',
  })
}

// Update settings: is_public toggle, deadline_minutes (owner only)
export function updateSettings(pollId, adminToken, settings) {
  return request(`/api/settings/${pollId}?admin_token=${encodeURIComponent(adminToken)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
}
