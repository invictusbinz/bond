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
import CheckpointView from '@/components/CheckpointView'
import ResolutionView from '@/components/ResolutionView'
import ClosingView from '@/components/ClosingView'

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
  // New format (EFT+NVC personalized views)
  a_view?: string
  b_view?: string
  // Legacy format (backward compat)
  carrying_a?: string
  carrying_b?: string
  underneath?: string
  friction?: string
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
  'both_responded_synthesis',    // while post-synthesis API decides next step
  'both_responded_checkpoint',   // while post-checkpoint API decides next step
  'both_responded_resolution',
  'synthesis_revised',           // waiting for both to re-read revised synthesis
])

// Statuses that should trigger a decision API call (idempotent — safe to call multiple times)
const DECISION_TRIGGERS: Record<string, string> = {
  both_responded_synthesis: '/api/post-synthesis',
  both_responded_checkpoint: '/api/post-checkpoint',
  both_responded_resolution: '/api/post-resolution',
}

// Statuses that mean Person B has already completed their intake.
// If B refreshes the page in any of these states, skip the checkin/orientation/intake flow.
const POST_INTAKE_B_STATUSES = new Set([
  'synthesis_generating', 'synthesis_ready',
  'a_responded_synthesis', 'b_responded_synthesis', 'both_responded_synthesis',
  'synthesis_revising', 'synthesis_revised',
  'checkpoint_ready', 'a_responded_checkpoint', 'b_responded_checkpoint', 'both_responded_checkpoint',
  'resolution_ready', 'a_responded_resolution', 'b_responded_resolution', 'both_responded_resolution',
  'closing_generating', 'closing_ready', 'closed',
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
  // 1 = original synthesis, 2 = revised synthesis
  // Used to distinguish the checkpoint path (v1) from the revised-synthesis path (v2)
  // when the status is a_responded_checkpoint or b_responded_checkpoint.
  const [synthesisVersion, setSynthesisVersion] = useState<number>(1)

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
      if (data.content) {
        setSynthesis(data.content)
        setSynthesisVersion(data.version ?? 1)
      }
    }
  }

  // ── Trigger synthesis generation (idempotent) ──────────────────────────────
  async function triggerSynthesis(token: string) {
    if (synthesisTriggeredRef.current) return
    synthesisTriggeredRef.current = true
    try {
      const res = await fetch('/api/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, token }),
      })
      // fetch() never throws on HTTP errors — must check res.ok explicitly.
      // If synthesize returns 4xx (e.g. 422 because intakes aren't ready yet),
      // reset the ref so the next poll can retry rather than getting stuck.
      if (!res.ok) {
        synthesisTriggeredRef.current = false
        return
      }
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

      // If synthesis is already ready (or in a post-synthesis state), fetch the content.
      // Includes checkpoint responded states since v2 path shows revised synthesis there.
      if (['synthesis_ready', 'a_responded_synthesis', 'b_responded_synthesis',
           'both_responded_synthesis', 'synthesis_revising', 'synthesis_revised',
           'checkpoint_ready', 'a_responded_checkpoint', 'b_responded_checkpoint'].includes(data.status)) {
        fetchSynthesis()
      }

      setLoadState('ready')
    }
    init()
  }, [sessionId, searchParams])

  // ── Decision trigger tracker (prevent double-firing) ──────────────────────
  const decisionTriggeredRef = useRef<Record<string, boolean>>({})

  // ── Polling ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (loadState !== 'ready' || !session || !myToken) return

    const status = session.status
    const isFast = FAST_POLL_STATUSES.has(status)
    const isSlow = SLOW_POLL_STATUSES.has(status)

    if (!isFast && !isSlow) return

    // Trigger synthesis generation when we detect synthesis_generating
    if (status === 'synthesis_generating' && myToken) {
      triggerSynthesis(myToken)
    }

    // Trigger decision APIs (post-synthesis, post-checkpoint) when both have responded
    const decisionEndpoint = DECISION_TRIGGERS[status]
    if (decisionEndpoint && myToken && !decisionTriggeredRef.current[status]) {
      decisionTriggeredRef.current[status] = true
      fetch(decisionEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, token: myToken }),
      }).catch(err => {
        console.error(`Decision trigger error for ${status}:`, err)
        decisionTriggeredRef.current[status] = false // allow retry
      })
    }

    const interval = setInterval(async () => {
      const res = await fetch(`/api/sessions/${sessionId}`)
      if (!res.ok) return
      const updated: SessionData = await res.json()
      if (updated.status !== session.status) {
        setSession(updated)
        // Fetch synthesis content when it first becomes ready, or when revised.
        // Also fetch in checkpoint-responded states for v2 path.
        if (['synthesis_ready', 'synthesis_revised', 'a_responded_synthesis',
             'b_responded_synthesis', 'checkpoint_ready',
             'a_responded_checkpoint', 'b_responded_checkpoint'].includes(updated.status)) {
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
      return <IntakePersonA sessionId={sessionId} token={myToken} mode={session.mode} inviteUrl={inviteUrl} />
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

    // Both responded — post-synthesis decision running
    if (status === 'both_responded_synthesis') {
      return <WaitingScreen variant="synthesis_generating" />
    }

    // Revised synthesis ready — A reads it and answers the inline checkpoint question
    if (status === 'synthesis_revised' && synthesis) {
      return (
        <SynthesisView
          synthesis={synthesis}
          sessionId={sessionId}
          token={myToken}
          myRole="a"
          isRevised={true}
          onResponded={() => setSession(s => s ? { ...s, status: 'a_responded_checkpoint' } : s)}
        />
      )
    }

    // Checkpoint (original "both said yes" path from checkpoint_ready)
    if (status === 'checkpoint_ready') {
      return (
        <CheckpointView
          sessionId={sessionId}
          token={myToken}
          myRole="a"
          onResponded={() => setSession(s => s ? { ...s, status: 'a_responded_checkpoint' } : s)}
        />
      )
    }

    if (status === 'a_responded_checkpoint') {
      return <WaitingScreen variant="partner_checkpoint" />
    }

    // B responded checkpoint first — A still needs to answer.
    // v2 path: show revised synthesis with inline checkpoint question.
    // v1 path: show standalone CheckpointView.
    if (status === 'b_responded_checkpoint') {
      if (synthesisVersion === 2 && synthesis) {
        return (
          <SynthesisView
            synthesis={synthesis}
            sessionId={sessionId}
            token={myToken}
            myRole="a"
            isRevised={true}
            onResponded={() => setSession(s => s ? { ...s, status: 'a_responded_checkpoint' } : s)}
          />
        )
      }
      return (
        <CheckpointView
          sessionId={sessionId}
          token={myToken}
          myRole="a"
          onResponded={() => setSession(s => s ? { ...s, status: 'a_responded_checkpoint' } : s)}
        />
      )
    }

    if (status === 'resolution_ready') {
      return (
        <ResolutionView
          sessionId={sessionId}
          token={myToken}
          myRole="a"
          onResponded={() => setSession(s => s ? { ...s, status: 'a_responded_resolution' } : s)}
        />
      )
    }

    if (status === 'a_responded_resolution') {
      return <WaitingScreen variant="partner_resolution" />
    }

    // B responded resolution first — A still needs to answer
    if (status === 'b_responded_resolution') {
      return (
        <ResolutionView
          sessionId={sessionId}
          token={myToken}
          myRole="a"
          onResponded={() => setSession(s => s ? { ...s, status: 'a_responded_resolution' } : s)}
        />
      )
    }

    if (status === 'closing_generating') {
      return <WaitingScreen variant="closing_generating" />
    }

    if (status === 'closing_ready') {
      return <ClosingView sessionId={sessionId} token={myToken} />
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

    // If B has already completed intake (e.g. they refreshed the page),
    // skip the checkin/orientation/intake flow entirely and route by status.
    // Without this, a refresh would drop them back to the availability check-in.
    const bAlreadyDoneIntake = POST_INTAKE_B_STATUSES.has(status)

    // B's pre-intake flow: checkin → orientation → intake
    // Only shown if B hasn't completed intake yet.
    if (!bAlreadyDoneIntake && personBFlow === 'not_ready') {
      return <WaitingScreen variant="not_ready" onReadyNow={() => setPersonBFlow('orientation')} />
    }

    if (!bAlreadyDoneIntake && personBFlow === 'orientation') {
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

    if (!bAlreadyDoneIntake && personBFlow === 'intake' && (status === 'b_active' || status === 'awaiting_b')) {
      return (
        <IntakePersonB
          sessionId={sessionId}
          token={myToken}
          partnerSummary={partnerSummary}
        />
      )
    }

    // B was mid-intake and refreshed (status=b_active but personBFlow reset to 'checkin').
    // Skip availability check-in and orientation — they already went through both.
    // partnerSummary will be '' since we can't restore it from refresh, but that's okay.
    if (!bAlreadyDoneIntake && personBFlow === 'checkin' && status === 'b_active') {
      return (
        <IntakePersonB
          sessionId={sessionId}
          token={myToken}
          partnerSummary=""
        />
      )
    }

    if (!bAlreadyDoneIntake && personBFlow === 'checkin') {
      return (
        <AvailabilityCheckIn
          onReady={() => setPersonBFlow('orientation')}
          onNotReady={() => setPersonBFlow('not_ready')}
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

    if (status === 'both_responded_synthesis') {
      return <WaitingScreen variant="synthesis_generating" />
    }

    // Revised synthesis — B reads it and answers the inline checkpoint question
    if (status === 'synthesis_revised' && synthesis) {
      return (
        <SynthesisView
          synthesis={synthesis}
          sessionId={sessionId}
          token={myToken}
          myRole="b"
          isRevised={true}
          onResponded={() => setSession(s => s ? { ...s, status: 'b_responded_checkpoint' } : s)}
        />
      )
    }

    // Checkpoint (original "both said yes" path from checkpoint_ready)
    if (status === 'checkpoint_ready') {
      return (
        <CheckpointView
          sessionId={sessionId}
          token={myToken}
          myRole="b"
          onResponded={() => setSession(s => s ? { ...s, status: 'b_responded_checkpoint' } : s)}
        />
      )
    }

    if (status === 'b_responded_checkpoint') {
      return <WaitingScreen variant="partner_checkpoint" />
    }

    // A responded checkpoint first — B still needs to answer.
    // v2 path: show revised synthesis with inline checkpoint question.
    // v1 path: show standalone CheckpointView.
    if (status === 'a_responded_checkpoint') {
      if (synthesisVersion === 2 && synthesis) {
        return (
          <SynthesisView
            synthesis={synthesis}
            sessionId={sessionId}
            token={myToken}
            myRole="b"
            isRevised={true}
            onResponded={() => setSession(s => s ? { ...s, status: 'b_responded_checkpoint' } : s)}
          />
        )
      }
      return (
        <CheckpointView
          sessionId={sessionId}
          token={myToken}
          myRole="b"
          onResponded={() => setSession(s => s ? { ...s, status: 'b_responded_checkpoint' } : s)}
        />
      )
    }

    if (status === 'resolution_ready') {
      return (
        <ResolutionView
          sessionId={sessionId}
          token={myToken}
          myRole="b"
          onResponded={() => setSession(s => s ? { ...s, status: 'b_responded_resolution' } : s)}
        />
      )
    }

    if (status === 'b_responded_resolution') {
      return <WaitingScreen variant="partner_resolution" />
    }

    // A responded resolution first — B still needs to answer
    if (status === 'a_responded_resolution') {
      return (
        <ResolutionView
          sessionId={sessionId}
          token={myToken}
          myRole="b"
          onResponded={() => setSession(s => s ? { ...s, status: 'b_responded_resolution' } : s)}
        />
      )
    }

    if (status === 'closing_generating') return <WaitingScreen variant="closing_generating" />
    if (status === 'closing_ready') return <ClosingView sessionId={sessionId} token={myToken} />
    if (status === 'closed') return <ClosedScreen />



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

// ─── Closed screen — shown when one/both weren't ready (checkpoint said not_yet) ─

function ClosedScreen() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#faf8f4', padding: '24px' }}>
      <style>{FONTS}</style>
      <div style={{ maxWidth: '440px' }}>
        <p style={{ fontFamily: "'Playfair Display', serif", fontSize: '26px', fontWeight: 400, color: '#1a1714', marginBottom: '14px', lineHeight: 1.35 }}>
          This is as far as Bond can take you right now.
        </p>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '15px', color: '#6b6560', lineHeight: 1.75 }}>
          One or both of you wasn&apos;t ready to move through this together. That&apos;s okay. What you each shared still matters, and Bond holds it with care.
        </p>
      </div>
    </div>
  )
}

