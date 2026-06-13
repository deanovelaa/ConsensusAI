// CreatePoll.jsx — warm funky minimal redesign
//
// The question textarea lives in the focal card (dark navy) — it's the hero.
// Settings live in a clean white card below. Big pill CTA.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createPoll } from '../api'

export default function CreatePoll() {
  const navigate = useNavigate()

  const [question, setQuestion] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [deadlineMinutes, setDeadlineMinutes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState(null)
  const [copiedVoter, setCopiedVoter] = useState(false)
  const [copiedAdmin, setCopiedAdmin] = useState(false)

  const handleCreate = async () => {
    if (!question.trim()) return
    setLoading(true)
    setError('')
    try {
      const data = await createPoll({
        question: question.trim(),
        is_public: isPublic,
        deadline_minutes: deadlineMinutes ? parseInt(deadlineMinutes) : null,
      })
      localStorage.setItem(`poll_admin_${data.poll_id}`, data.admin_token)
      setCreated(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const copy = (text, setter) => {
    navigator.clipboard.writeText(text)
    setter(true)
    setTimeout(() => setter(false), 2000)
  }

  // ── CREATED: show links ───────────────────────────────────────────────────
  if (created) {
    const voterLink = `${window.location.origin}/poll/${created.poll_id}`
    const adminLink = `${window.location.origin}/poll/${created.poll_id}/admin?token=${created.admin_token}`

    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-5 py-16">
        <div className="w-full max-w-[500px]">

          {/* Success tag */}
          <div className="mb-6">
            <span className="tag tag-green">✓ Poll ready</span>
          </div>

          {/* Focal card — question preview */}
          <div className="focal-card mb-6">
            <p className="text-xs font-medium uppercase tracking-[0.1em] mb-3"
               style={{ color: 'rgba(255,255,255,0.45)' }}>
              Your question
            </p>
            <p className="font-display text-2xl font-bold leading-snug text-white">
              {created.question}
            </p>
          </div>

          {/* Voter link */}
          <div className="card px-5 py-4 mb-3">
            <p className="text-xs font-medium mb-2" style={{ color: 'var(--ink-muted)' }}>
              Share with voters
            </p>
            <div className="flex items-center gap-3">
              <span className="link-mono flex-1 truncate">{voterLink}</span>
              <button
                onClick={() => copy(voterLink, setCopiedVoter)}
                className="text-xs font-medium shrink-0 transition-colors duration-150 py-1 px-3 rounded-full"
                style={{
                  background: copiedVoter ? '#D1FAE5' : 'var(--cream-dark)',
                  color: copiedVoter ? '#065F46' : 'var(--ink-soft)',
                }}
              >
                {copiedVoter ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Admin link */}
          <div className="card px-5 py-4 mb-8">
            <p className="text-xs font-medium mb-2" style={{ color: 'var(--ink-muted)' }}>
              Your admin link — save this
            </p>
            <div className="flex items-center gap-3">
              <span className="link-mono flex-1 truncate">{adminLink}</span>
              <button
                onClick={() => copy(adminLink, setCopiedAdmin)}
                className="text-xs font-medium shrink-0 transition-colors duration-150 py-1 px-3 rounded-full"
                style={{
                  background: copiedAdmin ? '#D1FAE5' : 'var(--cream-dark)',
                  color: copiedAdmin ? '#065F46' : 'var(--ink-soft)',
                }}
              >
                {copiedAdmin ? '✓ Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-xs mt-2" style={{ color: 'var(--ink-muted)' }}>
              Don't lose this — it's the only way to manage your poll.
            </p>
          </div>

          {/* CTAs */}
          <button
            onClick={() => navigate(`/poll/${created.poll_id}/admin?token=${created.admin_token}`)}
            className="btn-primary w-full py-4 mb-3 text-base"
          >
            Open dashboard →
          </button>
          <button
            onClick={() => { setCreated(null); setQuestion(''); setDeadlineMinutes(''); setIsPublic(false) }}
            className="btn-ghost w-full py-3.5"
          >
            Create another poll
          </button>

        </div>
      </div>
    )
  }

  // ── FORM ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5 py-16">
      <div className="w-full max-w-[500px]">

        {/* Wordmark */}
        <div className="flex items-center gap-2 mb-12">
          <span className="font-display font-bold text-sm" style={{ color: 'var(--ink)' }}>
            Consensus AI
          </span>
          <span className="tag tag-muted">Beta</span>
        </div>

        {/* Heading */}
        <h1 className="font-display text-[2.75rem] font-extrabold leading-[1.1] mb-8"
            style={{ color: 'var(--ink)' }}>
          What do you<br />want to ask?
        </h1>

        {/* ── FOCAL CARD: the main area — question input lives here ─────── */}
        {/* This is the hero — the dark card commands the page */}
        <div className="focal-card mb-5">
          <p className="text-xs font-medium uppercase tracking-[0.1em] mb-4"
             style={{ color: 'rgba(255,255,255,0.45)' }}>
            Your question
          </p>
          <textarea
            value={question}
            onChange={e => setQuestion(e.target.value)}
            placeholder="e.g. What should we build next?"
            rows={3}
            className="input-field-dark text-xl resize-none pb-2 leading-relaxed w-full"
            style={{ fontSize: '1.25rem' }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleCreate()
              }
            }}
          />
          {question.trim() && (
            <p className="text-xs mt-3" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Press Enter to continue ↵
            </p>
          )}
        </div>

        {/* ── Settings card ──────────────────────────────────────────────── */}
        <div className="card px-5 py-5 mb-6 space-y-5">

          {/* Public toggle */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                Show results to voters
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--ink-muted)' }}>
                Live leaderboard after they submit
              </p>
            </div>
            <button
              type="button"
              className="toggle-track shrink-0"
              data-on={String(isPublic)}
              onClick={() => setIsPublic(p => !p)}
              role="switch"
              aria-checked={isPublic}
              aria-label="Show results to voters"
            >
              <span className="toggle-thumb" />
            </button>
          </div>

          <hr style={{ border: 'none', borderTop: '1.5px solid var(--border)' }} />

          {/* Deadline */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                Deadline (minutes)
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--ink-muted)' }}>
                Auto-close after this long. Leave blank for no limit.
              </p>
            </div>
            <input
              type="number"
              value={deadlineMinutes}
              onChange={e => setDeadlineMinutes(e.target.value)}
              placeholder="–"
              min="1"
              className="w-14 text-center text-sm py-1.5 shrink-0"
              style={{
                background: 'var(--cream)',
                border: '1.5px solid var(--border)',
                borderRadius: '8px',
                color: 'var(--ink)',
                outline: 'none',
                fontFamily: 'DM Sans, system-ui, sans-serif',
              }}
              onFocus={e => e.target.style.borderColor = 'var(--focal)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
          </div>

        </div>

        {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

        <button
          onClick={handleCreate}
          disabled={!question.trim() || loading}
          className="btn-primary w-full py-4 text-base"
        >
          {loading ? 'Creating...' : 'Create poll →'}
        </button>

      </div>
    </div>
  )
}
