'use client'

// /session/[id] — the universal session page.
//
// Both Person A and Person B land here. The page figures out:
//   1. Who you are  — by reading your token from localStorage
//   2. Where you are — by reading the session's current status from Supabase
//
// Then it hands off to the right component for that moment in the flow.
//
// POLLING: For short AI-processing waits (synthesis_generating, synthesis_revising,
// closing_generating) the page re-fetches the session every 4 seconds automatically.
// For longer human waits (awaiting_b, b_active, partner responded states), it polls
// every 10 seconds — enough to detect changes without hammering the server.
// For static states (not_ready, closed), no polling.
//
// SYNTHESIS TRIGGER: When this page detects status = 'synthesis_generating' and
// the calling person is Person B (the one who just finished), it fires /api/synthesize.
// The call is idempotent — safe if both A and B's pages fire it simultaneously.

import { useEffect, useState, useRef } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { getToken, saveToken } from '@/lib/session'

// ─── Components ───────────────────────────────────────────────────────────────
import IntakePersonA from '@/components/IntakePersonA'
import AvailabilityCheckIn from '@/components/AvailabilityCheckIn'
import OrientationPersonB from '@/components/OrientationPersonB'
import IntakePersonB from '@/components/IntakePersonB'
import WaitingScreen from '@/components/WaitingScreen'
import SynthesisView from '@/components/SynthesisView'

// ─── Types ────────────────────────────────────────────────────────────────────

type SessionData = {
  id: string
  mode: 'heard' | 'figure_it_out'
  status: string
  person_a_token: string
  person_b_token: string
  join_code: string
}

type SynthesisContent = {
  carrying_a: string
  carrying_b: string
  underneath: string
  friction: string
}

type MyRole = 'a' | 'b' | null
type LoadState = 'loading' | 'ready' | 'not_found' | 'no_access'

// Statuses where the page should auto-refresh to detect changes
const FAST_POLL_STATUSES = new Set([
  'synthesis_generating',
  'synthesis_revising',
  'closing_generating',
])

const SLOW_POLL_STATUSES = new Set([
  'awaiting_b',
  'b_active',
  'a_responded_synthesis',
  'b_responded_synthesis',
  'a_responded_checkpoint',
  'b_responded_checkpoint',
  'a_responded_resolution',
  'b_responded_resolution',
  'both_responded_synthesis',    // while AI decides next step
  'both_responded_checkpoint',
  'both_responded_resolution',
])

const C = {
  ink: '#1a1714',
  paper: '#faf8f4',
  muted: '#6b6560',
}

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital@0;1&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400&display=swap');`

// ─── Component ────────────────────────────────────────────────────────────────

export default function SessionPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const sessionId = params.id as string

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [session, setSession] = useState<SessionData | null>(null)
  const [myRole, setMyRole] = useState<MyRole>(null)
  const [myToken, setMyToken] = useState<string | null>(null)
  const [partnerSummary, setPartnerSummary] = useState('')
  const [personBFlow, setPersonBFlow] = useState<'checkin' | 'orientation' | 'intake' | 'not_ready'>('checkin')
  const [synthesis, setSynthesis] = useState<SynthesisContent | null>(null)

  // Track whether synthesis has been triggered this session to avoid double-firing
  const synthesisTriggeredRef = useRef(false)

  // ── Fetch session from Supabase ────────────────────────────────────────────
  async function fetchSession(): Promise<SessionData | null> {
    const res = await fetch(`/api/sessions/${sessionId}`)
    if (!res.ok) return null
    return res.json()
  }

  // ── Fetch synthesis content ────────────────────────────────────────────────
  async function fetchSynthesis() {
    const res = await fetch(`/api/synthesis?sessionId=${sessionId}`)
    if (res.ok) {
      const data = await res.json()
      if (data.content) setSynthesis(data.content)
    }
  }

  // ── Trigger synthesis generation (idempotent) ──────────────────────────────
  async function triggerSynthesis(token: string) {
    if (synthesisTriggeredRef.current) return
    synthesisTriggeredRef.current = true
    try {
      await fetch('/api/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, token }),
      })
      // After synthesis completes, re-fetch session to get updated status
      const updated = await fetchSession()
      if (updated) setSession(updated)
    } catch (err) {
      console.error('Synthesis trigger error:', err)
      synthesisTriggeredRef.current = false // allow retry
    }
  }

  // ── Initial load ───────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      // Check for a join token in the URL (Person B's invite link)
      const joinToken = searchParams.get('join')
      if (joinToken) {
        saveToken(sessionId, joinToken)
        window.history.replaceState({}, '', `/session/${sessionId}`)
      }

      const res = await fetch(`/api/sessions/${sessionId}`)
      if (!res.ok) {
        setLoadState(res.status === 404 ? 'not_found' : 'no_access')
        return
      }
      const data: SessionData = await res.json()
      setSession(data)

      const storedToken = getToken(sessionId)
      if (!storedToken) { setLoadState('no_access'); return }

      if (storedToken === data.person_a_token) {
        setMyRole('a')
        setMyToken(storedToken)
      } else if (storedToken === data.person_b_token) {
        setMyRole('b')
        setMyToken(storedToken)
      } else {
        setLoadState('no_access')
        return
      }

      // If synthesis is already ready, fetch the content
      if (['synthesis_ready', 'a_responded_synthesis', 'b_responded_synthesis',
           'both_responded_synthesis', 'synthesis_revising', 'synthesis_revised',
           'checkpoint_ready'].includes(data.status)) {
        fetchSynthesis()
      }

      setLoadState('ready')
    }
    init()
  }, [sessionId, searchParams])

  // ── Polling ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (loadState !== 'ready' || !session || !myToken) return

    const status = session.status
    const isFast = FAST_POLL_STATUSES.has(status)
    const isSlow = SLOW_POLL_STATUSES.has(status)

    if (!isFast && !isSlow) return

    // Trigger synthesis when we detect synthesis_generating
    if (status === 'synthesis_generating' && myToken) {
      triggerSynthesis(myToken)
    }

    const interval = setInterval(async () => {
      const res = await fetch(`/api/sessions/${sessionId}`)
      if (!res.ok) return
      const updated: SessionData = await res.json()
      if (updated.status !== session.status) {
        setSession(updated)
        // Fetch synthesis content when it becomes ready
        if (['synthesis_ready', 'a_responded_synthesis', 'b_responded_synthesis'].includes(updated.status)) {
          fetchSynthesis()
        }
      }
    }, isFast ? 4000 : 10000)

    return () => clearInterval(interval)
  }, [loadState, session?.status, myToken])

  // ── Loading / error states ─────────────────────────────────────────────────

  if (loadState === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: C.paper }}>
        <style>{FONTS}</style>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '14px', color: C.muted }}>Loading…</p>
      </div>
    )
  }

  if (loadState === 'not_found') {
    return <ErrorScreen message="This session doesn't exist or the link has expired." />
  }

  if (loadState === 'no_access' || !session || !myRole || !myToken) {
    return <ErrorScreen message="You don't have access to this session. Check that you used the right link." />
  }

  const status = session.status

  // Derive invite URL for Person A's waiting screen
  const inviteUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/session/${sessionId}?join=${session.person_b_token}`
    : ''

  // ── Has this person responded to synthesis? ────────────────────────────────
  // Used to decide: show synthesis OR show "waiting for partner"
  const iHaveRespondedSynthesis =
    (myRole === 'a' && (status === 'a_responded_synthesis' || status === 'both_responded_synthesis')) ||
    (myRole === 'b' && (status === 'b_responded_synthesis' || status === 'both_responded_synthesis'))

  // ── PERSON A routing ───────────────────────────────────────────────────────

  if (myRole === 'a') {

    // A is doing their intake
    if (status === 'a_intake') {
      return <IntakePersonA sessionId={sessionId} token={myToken} mode={session.mode} />
    }

    // A waiting for B to join
    if (status === 'awaiting_b') {
      return (
        <WaitingScreen
          variant="awaiting_b"
          inviteUrl={inviteUrl}
          joinCode={session.join_code}
        />
      )
    }

    // B has joined and is doing their intake
    if (status === 'b_active') {
      return <WaitingScreen variant="b_active" />
    }

    // Both done — synthesis is being generated
    if (status === 'both_complete' || status === 'synthesis_generating') {
      return <WaitingScreen variant="synthesis_generating" />
    }

    // Synthesis ready — A hasn't responded yet
    if (status === 'synthesis_ready' && synthesis) {
      return (
        <SynthesisView
          synthesis={synthesis}
          sessionId={sessionId}
          token={myToken}
          myRole="a"
          onResponded={() => setSession(s => s ? { ...s, status: 'a_responded_synthesis' } : s)}
        />
      )
    }

    // A responded, waiting for B
    if (status === 'a_responded_synthesis') {
      return <WaitingScreen variant="partner_synthesis" />
    }

    // B responded first — A still needs to read and respond
    if (status === 'b_responded_synthesis' && synthesis && !iHaveRespondedSynthesis) {
      return (
        <SynthesisView
          synthesis={synthesis}
          sessionId={sessionId}
          token={myToken}
          myRole="a"
          onResponded={() => setSession(s => s ? { ...s, status: 'a_responded_synthesis' } : s)}
        />
      )
    }

    // Both responded — synthesis revision or checkpoint (coming soon)
    if (status === 'synthesis_revising') {
      return <WaitingScreen variant="synthesis_revising" />
    }

    if (status === 'both_responded_synthesis' || status === 'synthesis_revised') {
      return <WaitingScreen variant="synthesis_generating" /> // placeholder until checkpoint is built
    }

    // Checkpoint states (placeholder — checkpoint component coming next)
    if (status === 'checkpoint_ready') {
      return <ComingSoonScreen label="Checkpoint" />
    }

    if (status === 'a_responded_checkpoint') {
      return <WaitingScreen variant="partner_checkpoint" />
    }

    if (status === 'resolution_ready') {
      return <ComingSoonScreen label="Resolution" />
    }

    if (status === 'a_responded_resolution') {
      return <WaitingScreen variant="partner_resolution" />
    }

    if (status === 'closing_generating') {
      return <WaitingScreen variant="closing_generating" />
    }

    if (status === 'closing_ready') {
      return <ComingSoonScreen label="Closing reflection" />
    }

    if (status === 'closed') {
      return <ClosedScreen />
    }

    // Fallback loading (e.g. synthesis_ready but synthesis content not yet fetched)
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: C.paper }}>
        <style>{FONTS}</style>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '14px', color: C.muted }}>One moment…</p>
      </div>
    )
  }

  // ── PERSON B routing ───────────────────────────────────────────────────────

  if (myRole === 'b') {

    // B's pre-intake flow: checkin → orientation → intake
    if (personBFlow === 'not_ready') {
      return <WaitingScreen variant="not_ready" />
    }

    if (personBFlow === 'checkin') {
      return (
        <AvailabilityCheckIn
          onReady={() => setPersonBFlow('orientation')}
          onNotReady={() => setPersonBFlow('not_ready')}
        />
      )
    }

    if (personBFlow === 'orientation') {
      return (
        <OrientationPersonB
          sessionId={sessionId}
          onReady={(summary) => {
            setPartnerSummary(summary)
            setPersonBFlow('intake')
          }}
        />
      )
    }

    if (personBFlow === 'intake' && (status === 'b_active' || status === 'awaiting_b')) {
      return (
        <IntakePersonB
          sessionId={sessionId}
          token={myToken}
          partnerSummary={partnerSummary}
        />
      )
    }

    // Both done — synthesis generating
    if (status === 'both_complete' || status === 'synthesis_generating') {
      return <WaitingScreen variant="synthesis_generating" />
    }

    // Synthesis ready — B hasn't responded yet
    if (status === 'synthesis_ready' && synthesis) {
      return (
        <SynthesisView
          synthesis={synthesis}
          sessionId={sessionId}
          token={myToken}
          myRole="b"
          onResponded={() => setSession(s => s ? { ...s, status: 'b_responded_synthesis' } : s)}
        />
      )
    }

    // B responded, waiting for A
    if (status === 'b_responded_synthesis') {
      return <WaitingScreen variant="partner_synthesis" />
    }

    // A responded first — B still needs to read and respond
    if (status === 'a_responded_synthesis' && synthesis && !iHaveRespondedSynthesis) {
      return (
        <SynthesisView
          synthesis={synthesis}
          sessionId={sessionId}
          token={myToken}
          myRole="b"
          onResponded={() => setSession(s => s ? { ...s, status: 'b_responded_synthesis' } : s)}
        />
      )
    }

    // Synthesis revision
    if (status === 'synthesis_revising') {
      return <WaitingScreen variant="synthesis_revising" />
    }

    if (status === 'both_responded_synthesis' || status === 'synthesis_revised') {
      return <WaitingScreen variant="synthesis_generating" />
    }

    // Checkpoint / resolution / closing (placeholders)
    if (status === 'checkpoint_ready') return <ComingSoonScreen label="Checkpoint" />
    if (status === 'b_responded_checkpoint') return <WaitingScreen variant="partner_checkpoint" />
    if (status === 'resolution_ready') return <ComingSoonScreen label="Resolution" />
    if (status === 'b_responded_resolution') return <WaitingScreen variant="partner_resolution" />
    if (status === 'closing_generating') return <WaitingScreen variant="closing_generating" />
    if (status === 'closing_ready') return <ComingSoonScreen label="Closing reflection" />
    if (status === 'closed') return <ClosedScreen />

    // Fallback: B is in intake flow but status already moved forward
    if (['b_active', 'awaiting_b'].includes(status) && personBFlow === 'intake') {
      return (
        <IntakePersonB
          sessionId={sessionId}
          token={myToken}
          partnerSummary={partnerSummary}
        />
      )
    }

    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: C.paper }}>
        <style>{FONTS}</style>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '14px', color: C.muted }}>One moment…</p>
      </div>
    )
  }

  return <ErrorScreen message="Something unexpected happened. Please try refreshing." />
}

// ─── Error screen ──────────────────────────────────────────────────────────────

function ErrorScreen({ message }: { message: string }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#faf8f4', padding: '24px' }}>
      <style>{FONTS}</style>
      <div style={{ maxWidth: '400px', textAlign: 'center' }}>
        <p style={{ fontFamily: "'Playfair Display', serif", fontSize: '22px', color: '#1a1714', marginBottom: '12px' }}>
          Something's off.
        </p>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '14px', color: '#6b6560', lineHeight: 1.7 }}>
          {message}
        </p>
      </div>
    </div>
  )
}

// ─── Closed screen ─────────────────────────────────────────────────────────────

function ClosedScreen() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#faf8f4', padding: '24px' }}>
      <style>{FONTS}</style>
      <div style={{ maxWidth: '440px', textAlign: 'center' }}>
        <p style={{ fontFamily: "'Playfair Display', serif", fontSize: '26px', fontWeight: 400, color: '#1a1714', marginBottom: '14px', lineHeight: 1.35 }}>
          This is as far as Bond can take you right now.
        </p>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '15px', color: '#6b6560', lineHeight: 1.75 }}>
          One or both of you wasn't ready to move through this together. That's okay. What you each shared still matters, and Bond holds it with care.
        </p>
      </div>
    </div>
  )
}

// ─── Coming soon placeholder ───────────────────────────────────────────────────

function ComingSoonScreen({ label }: { label: string }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#faf8f4', padding: '24px' }}>
      <style>{FONTS}</style>
      <div style={{ maxWidth: '400px', textAlign: 'center' }}>
        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '11px', letterSpacing: '0.12em', color: '#8a8480', textTransform: 'uppercase', marginBottom: '14px' }}>
          Coming next
        </p>
        <p style={{ fontFamily: "'Playfair Display', serif", fontSize: '22px', fontWeight: 400, color: '#1a1714' }}>
          {label}
        </p>
      </div>
    </div>
  )
}
