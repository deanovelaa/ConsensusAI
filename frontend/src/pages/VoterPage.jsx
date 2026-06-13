// VoterPage.jsx — warm funky minimal redesign
//
// The question dominates the page inside the focal card (dark navy hero).
// The answer input is below in clean open space.
// Results use chunky pill bars.

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { getPollInfo, submitVote, getResults } from '../api'

export default function VoterPage() {
  const { pollId } = useParams()

  const [poll, setPoll] = useState(null)
  const [answer, setAnswer] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadPoll = useCallback(async () => {
    try {
      const data = await getPollInfo(pollId)
      setPoll(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [pollId])

  useEffect(() => { loadPoll() }, [loadPoll])

  useEffect(() => {
    if (!submitted || !poll?.is_public || poll?.status === 'ended') return
    const interval = setInterval(async () => {
      try {
        const data = await getResults(pollId)
        setResults(data)
        if (data.status === 'ended') setPoll(p => ({ ...p, status: 'ended' }))
      } catch { /* silently fail */ }
    }, 4000)
    return () => clearInterval(interval)
  }, [submitted, poll, pollId])

  const handleSubmit = async () => {
    if (!answer.trim()) return
    setSubmitting(true)
    setError('')
    try {
      await submitVote(pollId, answer.trim())
      setSubmitted(true)
      if (poll?.is_public) {
        try {
          const data = await getResults(pollId)
          setResults(data)
        } catch { /* private */ }
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // ── Loading ──
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 rounded-full animate-spin"
             style={{ borderColor: 'var(--border)', borderTopColor: 'var(--focal)' }} />
      </div>
    )
  }

  // ── Error ──
  if (error && !poll) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-5 text-center gap-2">
        <span className="tag tag-muted">Not found</span>
        <p className="font-display text-xl font-bold" style={{ color: 'var(--ink)' }}>
          Poll not found
        </p>
        <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>{error}</p>
      </div>
    )
  }

  // ── After submission: results ──
  if (submitted && results) {
    const maxVotes = Math.max(...results.clusters.map(c => c.votes), 1)

    return (
      <div className="min-h-screen flex flex-col items-center justify-start px-5 pt-16 pb-24">
        <div className="w-full max-w-[500px]">

          {/* Status */}
          <div className="flex items-center gap-2 mb-6">
            {results.status !== 'ended' ? (
              <span className="tag tag-green">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
                Live
              </span>
            ) : (
              <span className="tag tag-muted">Ended</span>
            )}
            <span className="text-sm" style={{ color: 'var(--ink-muted)' }}>
              {results.total_votes} vote{results.total_votes !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Focal card — question */}
          <div className="focal-card mb-6">
            <p className="text-xs font-medium uppercase tracking-[0.1em] mb-3"
               style={{ color: 'rgba(255,255,255,0.45)' }}>
              Question
            </p>
            <p className="font-display text-2xl font-bold leading-snug text-white">
              {results.question}
            </p>
            <p className="text-xs mt-3" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Your answer has been recorded.
            </p>
          </div>

          {/* Results */}
          <div className="card px-5 py-5 space-y-5">
            <p className="text-xs font-medium uppercase tracking-[0.1em]"
               style={{ color: 'var(--ink-muted)' }}>
              What people think
            </p>
            {results.clusters.map((cluster, i) => (
              <ClusterRow
                key={cluster.label}
                cluster={cluster}
                maxVotes={maxVotes}
                rank={i}
                totalVotes={results.total_votes}
              />
            ))}
          </div>

        </div>
      </div>
    )
  }

  // ── Thank you (private) ──
  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-5">
        <div className="text-center">
          <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-6"
               style={{ background: 'var(--focal)' }}>
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="font-display text-2xl font-bold mb-2" style={{ color: 'var(--ink)' }}>
            Answer recorded.
          </p>
          <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>
            Thank you for participating.
          </p>
        </div>
      </div>
    )
  }

  // ── Ended (before voting) ──
  if (poll?.status === 'ended') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-5">
        <div className="w-full max-w-[500px]">
          <span className="tag tag-muted mb-5 inline-block">Discussion ended</span>
          <div className="focal-card">
            <p className="font-display text-2xl font-bold text-white leading-snug">
              {poll.question}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ── Default: voting form ──
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5">
      <div className="w-full max-w-[500px]">

        {/* ── FOCAL CARD: the question — highlighted main area ─────────── */}
        <div className="focal-card mb-8">
          <p className="text-xs font-medium uppercase tracking-[0.1em] mb-4"
             style={{ color: 'rgba(255,255,255,0.45)' }}>
            Question
          </p>
          <p className="font-display text-3xl font-bold text-white leading-snug">
            {poll?.question}
          </p>
        </div>

        {/* Answer input — open, airy, below the card */}
        <div className="mb-8">
          <p className="text-xs font-medium uppercase tracking-[0.1em] mb-4"
             style={{ color: 'var(--ink-muted)' }}>
            Your answer
          </p>
          <textarea
            value={answer}
            onChange={e => setAnswer(e.target.value)}
            placeholder="Type anything — be as specific or open as you like..."
            rows={2}
            className="input-field text-xl resize-none pb-3 leading-relaxed"
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmit()
              }
            }}
          />
        </div>

        {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={!answer.trim() || submitting}
          className="btn-primary w-full py-4 text-base"
        >
          {submitting ? 'Submitting...' : 'Submit answer →'}
        </button>

      </div>
    </div>
  )
}

// ── Cluster row — chunky pill bars ───────────────────────────────────────────
function ClusterRow({ cluster, maxVotes, rank, totalVotes }) {
  const isSpecial = ['Others', 'No Preference'].includes(cluster.label)
  const isTop = rank === 0 && !isSpecial
  const pct = maxVotes > 0 ? (cluster.votes / maxVotes) * 100 : 0
  const share = totalVotes > 0 ? Math.round((cluster.votes / totalVotes) * 100) : 0

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {isTop && <span className="tag tag-yellow" style={{ padding: '2px 8px', fontSize: '0.7rem' }}>#1</span>}
          <span className="text-sm font-medium" style={{ color: isSpecial ? 'var(--ink-muted)' : 'var(--ink)' }}>
            {cluster.label}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs tabular-nums" style={{ color: 'var(--ink-muted)' }}>{share}%</span>
          <span className="text-sm font-semibold tabular-nums" style={{ color: isSpecial ? 'var(--ink-muted)' : 'var(--ink)' }}>
            {cluster.votes}
          </span>
        </div>
      </div>
      <div className="bar-track">
        <div
          className={`bar-fill ${isSpecial ? 'bar-muted' : 'bar-primary'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
