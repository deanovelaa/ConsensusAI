// AdminDashboard.jsx — warm funky minimal redesign
//
// Question lives in the focal card. Results in a white card with chunky bars.
// Settings and actions in clean cards below.

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { getResults, endPoll, updateSettings } from '../api'

export default function AdminDashboard() {
  const { pollId } = useParams()
  const [searchParams] = useSearchParams()

  const adminToken =
    searchParams.get('token') ||
    localStorage.getItem(`poll_admin_${pollId}`) ||
    ''

  const [poll, setPoll] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [ending, setEnding] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const intervalRef = useRef(null)

  const loadResults = useCallback(async () => {
    try {
      const data = await getResults(pollId, adminToken)
      setPoll(data)
      setError('')
    } catch (err) {
      setError(err.message)
      clearInterval(intervalRef.current)
    } finally {
      setLoading(false)
    }
  }, [pollId, adminToken])

  useEffect(() => {
    loadResults()
    intervalRef.current = setInterval(loadResults, 3000)
    return () => clearInterval(intervalRef.current)
  }, [loadResults])

  useEffect(() => {
    if (poll?.status === 'ended') clearInterval(intervalRef.current)
  }, [poll?.status])

  const handleTogglePublic = async () => {
    const next = !poll.settings.is_public
    setPoll(p => ({ ...p, settings: { ...p.settings, is_public: next } }))
    try {
      await updateSettings(pollId, adminToken, { is_public: next })
    } catch (err) {
      setPoll(p => ({ ...p, settings: { ...p.settings, is_public: !next } }))
      setError(err.message)
    }
  }

  const handleEndPoll = async () => {
    setEnding(true)
    try {
      await endPoll(pollId, adminToken)
      setPoll(p => ({ ...p, status: 'ended' }))
      setConfirmEnd(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setEnding(false)
    }
  }

  const copyVoterLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/poll/${pollId}`)
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2000)
  }

  if (!adminToken) return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5 text-center gap-2">
      <span className="tag tag-muted">Access required</span>
      <p className="font-display text-xl font-bold" style={{ color: 'var(--ink)' }}>Open your admin link</p>
    </div>
  )

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 rounded-full animate-spin"
           style={{ borderColor: 'var(--border)', borderTopColor: 'var(--focal)' }} />
    </div>
  )

  if (error && !poll) return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5 text-center gap-2">
      <span className="tag tag-muted">Error</span>
      <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>{error}</p>
    </div>
  )

  const isEnded = poll?.status === 'ended'
  const maxVotes = Math.max(...(poll?.clusters?.map(c => c.votes) || [1]), 1)

  return (
    <div className="min-h-screen">
      <div className="max-w-[560px] mx-auto px-5 pt-14 pb-28">

        {/* Status row */}
        <div className="flex items-center gap-2 mb-6">
          {isEnded ? (
            <span className="tag tag-muted">Ended</span>
          ) : (
            <span className="tag tag-green">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
              Live
            </span>
          )}
          <span className="text-sm tabular-nums" style={{ color: 'var(--ink-muted)' }}>
            {poll?.total_votes || 0} vote{poll?.total_votes !== 1 ? 's' : ''}
          </span>
          {!isEnded && (
            <span className="text-xs ml-auto" style={{ color: 'var(--ink-muted)' }}>
              Updating live
            </span>
          )}
        </div>

        {/* ── FOCAL CARD: question ─────────────────────────────────────── */}
        <div className="focal-card mb-5">
          <p className="text-xs font-medium uppercase tracking-[0.1em] mb-3"
             style={{ color: 'rgba(255,255,255,0.45)' }}>
            Your poll
          </p>
          <p className="font-display text-2xl font-bold text-white leading-snug">
            {poll?.question}
          </p>

          {/* Voter link inside focal card */}
          <div className="mt-5 flex items-center gap-3 py-2.5 px-3 rounded-xl"
               style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>
            <span className="flex-1 text-xs font-mono truncate" style={{ color: 'rgba(255,255,255,0.55)' }}>
              {window.location.origin}/poll/{pollId}
            </span>
            <button
              onClick={copyVoterLink}
              className="text-xs font-medium shrink-0 transition-all duration-150 py-1 px-3 rounded-full"
              style={{
                background: copiedLink ? 'rgba(52,211,153,0.2)' : 'rgba(255,255,255,0.12)',
                color: copiedLink ? '#34D399' : 'rgba(255,255,255,0.7)',
              }}
            >
              {copiedLink ? '✓ Copied' : 'Copy link'}
            </button>
          </div>
        </div>

        {/* ── Results card ────────────────────────────────────────────── */}
        <div className="card px-5 py-5 mb-5">
          <p className="text-xs font-medium uppercase tracking-[0.1em] mb-5"
             style={{ color: 'var(--ink-muted)' }}>
            Consensus clusters
          </p>

          {poll?.clusters?.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>
                Waiting for the first vote...
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {poll.clusters.map((cluster, i) => (
                <ClusterRow
                  key={cluster.label}
                  cluster={cluster}
                  maxVotes={maxVotes}
                  rank={i}
                  totalVotes={poll.total_votes}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Settings card ────────────────────────────────────────────── */}
        {!isEnded && (
          <div className="card px-5 py-5 mb-5">
            <p className="text-xs font-medium uppercase tracking-[0.1em] mb-4"
               style={{ color: 'var(--ink-muted)' }}>
              Settings
            </p>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                  Show results to voters
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--ink-muted)' }}>
                  {poll?.settings?.is_public
                    ? 'Voters see the live leaderboard'
                    : 'Results are hidden from voters'}
                </p>
              </div>
              <button
                type="button"
                className="toggle-track shrink-0"
                data-on={String(poll?.settings?.is_public)}
                onClick={handleTogglePublic}
                role="switch"
                aria-checked={poll?.settings?.is_public}
                aria-label="Show results to voters"
              >
                <span className="toggle-thumb" />
              </button>
            </div>
          </div>
        )}

        {/* ── End discussion ───────────────────────────────────────────── */}
        {!isEnded && (
          confirmEnd ? (
            <div className="card px-5 py-5">
              <p className="font-display text-lg font-bold mb-1" style={{ color: 'var(--ink)' }}>
                End discussion?
              </p>
              <p className="text-sm mb-5" style={{ color: 'var(--ink-muted)' }}>
                The poll freezes. No more votes will be accepted.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleEndPoll}
                  disabled={ending}
                  className="btn-primary flex-1 py-3"
                >
                  {ending ? 'Ending...' : 'End it'}
                </button>
                <button
                  onClick={() => setConfirmEnd(false)}
                  className="btn-ghost flex-1 py-3"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmEnd(true)}
              className="btn-ghost w-full py-3.5"
            >
              End discussion
            </button>
          )
        )}

        {/* ── Ended state ──────────────────────────────────────────────── */}
        {isEnded && (
          <div className="text-center pt-2">
            <span className="tag tag-muted">Results are frozen</span>
          </div>
        )}

        {error && <p className="mt-6 text-xs text-red-500">{error}</p>}

      </div>
    </div>
  )
}

// ── Cluster row ───────────────────────────────────────────────────────────────
function ClusterRow({ cluster, maxVotes, rank, totalVotes }) {
  const isSpecial = ['Others', 'No Preference'].includes(cluster.label)
  const isTop = rank === 0 && !isSpecial
  const pct = maxVotes > 0 ? (cluster.votes / maxVotes) * 100 : 0
  const share = totalVotes > 0 ? Math.round((cluster.votes / totalVotes) * 100) : 0

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {isTop && (
            <span className="tag tag-yellow" style={{ padding: '2px 8px', fontSize: '0.7rem' }}>#1</span>
          )}
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
