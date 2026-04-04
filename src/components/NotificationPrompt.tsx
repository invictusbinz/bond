'use client'

// NotificationPrompt — reusable opt-in card for web push notifications.
//
// Shown at the right moment in the session flow:
//   - Person A: on the WaitingScreen (awaiting_b variant) — "get notified when they join"
//   - Person B: after confirming availability — "get notified when your synthesis is ready"
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
  const [state, setState] = useState<'idle' | 'requesting' | 'done' | 'skipped' | 'unsupported'>(
    isNotificationsSupported() ? 'idle' : 'unsupported'
  )

  // If this browser doesn't support push, hide the component entirely.
  if (state === 'unsupported' || state === 'done' || state === 'skipped') return null

  async function handleOptIn() {
    setState('requesting')
    try {
      const playerId = await subscribeToNotifications()
      if (playerId) {
        await saveSubscription({ sessionId, person: myPerson, playerId, token: myToken })
        setState('done')
        onOptedIn?.(playerId)
      } else {
        // User declined the browser permission dialog — treat as skipped
        setState('skipped')
        onSkipped?.()
      }
    } catch {
      // Any error: quietly skip — notifications are non-blocking
      setState('skipped')
      onSkipped?.()
    }
  }

  function handleSkip() {
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
          {state === 'requesting' ? 'Setting up…' : buttonLabel}
        </button>
      </div>
    </div>
  )
}
