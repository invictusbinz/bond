'use client'

// /session/[id] — the universal session page.
//
// Both Person A and Person B land here. The page figures out:
//   1. Who you are  — by reading your token from localStorage
//   2. Where you are — by reading the session's current status from Supabase
//
// Then it hands off to the right component for that moment in the flow.
// No hardcoded "this is Person A's page" or "this is Person B's page."

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { getToken, saveToken } from '@/lib/session'

// ─── Components (imported as the session needs them) ──────────────────────────
import IntakePersonA from '@/components/IntakePersonA'
import AvailabilityCheckIn from '@/components/AvailabilityCheckIn'
import OrientationPersonB from '@/components/OrientationPersonB'
import IntakePersonB from '@/components/IntakePersonB'
import WaitingScreen from '@/components/WaitingScreen'

// ─── Types ────────────────────────────────────────────────────────────────────

type SessionData = {
  id: string
  mode: 'heard' | 'figure_it_out'
  status: string
  person_a_token: string
  person_b_token: string
  join_code: string
}

type MyRole = 'a' | 'b' | null
type LoadState = 'loading' | 'ready' | 'not_found' | 'no_access'

const C = {
  ink: '#1a1714',
  paper: '#faf8f4',
  white: '#ffffff',
  accent: '#c4622d',
  rule: '#e0d8cc',
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
  const [personBFlow, setPersonBFlow] = useState<'checkin' | 'orientation' | 'intake'>('checkin')

  useEffect(() => {
    async function init() {
      // Check for a join token in the URL (Person B's invite link)
      const joinToken = searchParams.get('join')
      if (joinToken) {
        saveToken(sessionId, joinToken)
        // Clean the URL so the token isn't visible after first load
        window.history.replaceState({}, '', `/session/${sessionId}`)
      }

      // Load the session from Supabase
      const res = await fetch(`/api/sessions/${sessionId}`)
      if (!res.ok) {
        setLoadState(res.status === 404 ? 'not_found' : 'no_access')
        return
      }
      const data: SessionData = await res.json()
      setSession(data)

      // Determine who this browser is
      const storedToken = getToken(sessionId)
      if (!storedToken) {
        setLoadState('no_access')
        return
      }

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

      setLoadState('ready')
    }
    init()
  }, [sessionId, searchParams])

  // ── Loading / error states ──────────────────────────────────────────────────

  if (loadState === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: C.paper }}>
        <style>{FONTS}</style>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '14px', color: C.muted }}>
          Loading…
        </p>
      </div>
    )
  }

  if (loadState === 'not_found') {
    return <ErrorScreen message="This session doesn't exist or the link has expired." />
  }

  if (loadState === 'no_access' || !session || !myRole || !myToken) {
    return <ErrorScreen message="You don't have access to this session. Check that you used the right link." />
  }

  // ── Person A routing ────────────────────────────────────────────────────────

  if (myRole === 'a') {
    // Person A is done — waiting for Person B
    if (['awaiting_b', 'b_active', 'both_complete', 'synthesis_generating',
         'synthesis_ready', 'a_responded_synthesis', 'b_responded_synthesis'].includes(session.status)) {
      return (
        <WaitingScreen
          message="Your side is in."
          subMessage="Waiting for the other person to share their side. You'll hear from Bond when the synthesis is ready."
          sessionId={sessionId}
          token={myToken}
        />
      )
    }

    // Person A is doing their intake
    return (
      <IntakePersonA
        sessionId={sessionId}
        token={myToken}
        mode={session.mode}
      />
    )
  }

  // ── Person B routing ────────────────────────────────────────────────────────

  if (myRole === 'b') {
    // Person B has completed their intake — waiting
    if (['both_complete', 'synthesis_generating', 'synthesis_ready',
         'a_responded_synthesis', 'b_responded_synthesis'].includes(session.status)) {
      return (
        <WaitingScreen
          message="Your side is in."
          subMessage="Bond is now working with both perspectives. You'll be notified when the synthesis is ready."
          sessionId={sessionId}
          token={myToken}
        />
      )
    }

    // Person B's three-step flow: check-in → orientation → intake
    if (personBFlow === 'checkin') {
      return (
        <AvailabilityCheckIn
          onReady={() => setPersonBFlow('orientation')}
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

    if (personBFlow === 'intake') {
      return (
        <IntakePersonB
          sessionId={sessionId}
          token={myToken}
          partnerSummary={partnerSummary}
        />
      )
    }
  }

  return <ErrorScreen message="Something unexpected happened. Please try refreshing." />
}

// ─── Error screen ─────────────────────────────────────────────────────────────

function ErrorScreen({ message }: { message: string }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: C.paper, padding: '24px' }}>
      <style>{FONTS}</style>
      <div style={{ maxWidth: '400px', textAlign: 'center' }}>
        <p style={{ fontFamily: "'Playfair Display', serif", fontSize: '22px', color: C.ink, marginBottom: '12px' }}>
          Something's off.
        </p>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '14px', color: C.muted, lineHeight: 1.7 }}>
          {message}
        </p>
      </div>
    </div>
  )
}
