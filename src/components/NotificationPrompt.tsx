'use client'

// NotificationPrompt — reusable opt-in card for web push notifications.
//
// Shown at the right moment in the session flow:
//   - Person A: on the WaitingScreen (awaiting_b variant) — "get notified when they join"
//   - Person B: after confirming availability — "get notified when it's time to come back"
//
// Persistence: opt-in/skip choice is saved to localStorage per-session so the prompt
// doesn't reappear on reload, and so "Setting up…" can't get stuck on a repeat attempt.
//
// Props:
//   headline    — short line explaining what the notification is for
//   buttonLabel — what the opt-in button says
//   sessionId   — session to link the subscription to
//   myPerson    — 'a' or 'b'
//   myToken     — session auth token for the subscribe API call
//   onOptedIn   — called after subscription is successfully saved (passes playerId)
//   onSkipped   — called when user taps "no thanks"

import { useState } from 'react'
import { subscribeToNotifications, saveSubscription, isNotificationsSupported } from '@/lib/onesignal'

// ─── Colors (matches Bond design system) ─────────────────────────────────────

const C = {
  ink: '#1a1714',
  paper: '#faf8f4',
  white: '#ffffff',
  accent: '#c4622d',
  accentHover: '#a0481f',
  rule: '#e0d8cc',
  muted: '#6b6560',
  dimmed: '#8a8480',
  greenSoft: '#d4e8dc',
  green: '#3d6b4f',
}

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  headline: string
  buttonLabel: string
  sessionId: string
  myPerson: 'a' | 'b'
  myToken: string
  onOptedIn?: (playerId: string) => void
  onSkipped?: () => void
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

function getStoredState(sessionId: string, person: string): 'done' | 'skipped' | null {
  try {
    const val = localStorage.getItem(`bond_notif_${sessionId}_${person}`)
    if (val === 'done' || val === 'skipped') return val
  } catch {}
  return null
}

function setStoredState(sessionId: string, person: string, val: 'done' | 'skipped') {
  try {
    localStorage.setItem(`bond_notif_${sessionId}_${person}`, val)
  } catch {}
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function NotificationPrompt({
  headline,
  buttonLabel,
  sessionId,
  myPerson,
  myToken,
  onOptedIn,
  onSkipped,
}: Props) {
  const [state, setState] = useState<'idle' | 'requesting' | 'confirmed' | 'skipped' | 'unsupported'>(() => {
    if (!isNotificationsSupported()) return 'unsupported'
    // If the user already decided in a previous page load, respect that decision.
    const stored = getStoredState(sessionId, myPerson)
    if (stored === 'done') return 'confirmed'  // already opted in — show brief confirmation
    if (stored === 'skipped') return 'skipped'  // already said no — hide entirely
    return 'idle'
  })

  // Fully hidden states
  if (state === 'unsupported' || state === 'skipped') return null

  // After opting in: show a small confirmation note instead of disappearing silently
  if (state === 'confirmed') {
    return (
      <div
        style={{
          backgroundColor: C.white,
          border: `1px solid ${C.greenSoft}`,
          borderRadius: '8px',
          padding: '14px 18px',
          marginTop: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <span style={{ fontSize: '14px', color: C.green }}>✓</span>
        <p
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '13px',
            color: C.green,
            margin: 0,
          }}
        >
          You&apos;ll be notified.
        </p>
      </div>
    )
  }

  async function handleOptIn() {
    setState('requesting')
    try {
      const playerId = await subscribeToNotifications()
      if (playerId) {
        await saveSubscription({ sessionId, person: myPerson, playerId, token: myToken })
        setStoredState(sessionId, myPerson, 'done')
        setState('confirmed')
        onOptedIn?.(playerId)
      } else {
        // User declined the browser permission dialog — treat as skipped
        setStoredState(sessionId, myPerson, 'skipped')
        setState('skipped')
        onSkipped?.()
      }
    } catch {
      // Any error: quietly skip — notifications are non-blocking
      setStoredState(sessionId, myPerson, 'skipped')
      setState('skipped')
      onSkipped?.()
    }
  }

  function handleSkip() {
    setStoredState(sessionId, myPerson, 'skipped')
    setState('skipped')
    onSkipped?.()
  }

  return (
    <div
      style={{
        backgroundColor: C.white,
        border: `1px solid ${C.rule}`,
        borderRadius: '8px',
        padding: '18px 20px',
        marginTop: '20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
      }}
    >
      {/* Text */}
      <p
        style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '14px',
          color: C.muted,
          lineHeight: 1.5,
          margin: 0,
          flex: 1,
        }}
      >
        {headline}
      </p>

      {/* Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        {/* Skip */}
        <button
          onClick={handleSkip}
          disabled={state === 'requesting'}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '13px',
            color: C.dimmed,
            padding: '4px 0',
            textDecoration: 'underline',
            textUnderlineOffset: '3px',
          }}
        >
          No thanks
        </button>

        {/* Opt in */}
        <button
          onClick={handleOptIn}
          disabled={state === 'requesting'}
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            backgroundColor: state === 'requesting' ? C.rule : C.accent,
            color: state === 'requesting' ? C.dimmed : C.white,
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '13px',
            fontWeight: 500,
            border: 'none',
            cursor: state === 'requesting' ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.15s',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => {
            if (state !== 'requesting') e.currentTarget.style.backgroundColor = C.accentHover
          }}
          onMouseLeave={(e) => {
            if (state !== 'requesting') e.currentTarget.style.backgroundColor = C.accent
          }}
        >
          {state === 'requesting' ? 'Setting up\u2026' : buttonLabel}
        </button>
      </div>
    </div>
  )
}
