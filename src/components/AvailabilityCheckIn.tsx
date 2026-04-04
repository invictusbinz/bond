'use client'

// AvailabilityCheckIn — Person B's landing screen.
//
// One combined screen that does four things in sequence:
//   1. Collects Person B's name (single input, "Hi")
//   2. Reveals who reached out (Person A's name) + what Bond is + honest privacy
//   3. Three-option availability check-in
//   4. Not-ready confirmation with explicit notification choice + inline reminder
//
// Props:
//   personAName   — Person A's name, passed from the session page
//   sessionId     — used to save person_b_name to the session record
//   token         — Person B's token for the PATCH call
//   onReady       — called when B confirms they're available; passes availability state
//   onNotReady    — called when B confirms they're not ready

import { useState, useRef, useEffect } from 'react'
import { useIsMobile } from '@/lib/useIsMobile'
import NotificationPrompt from '@/components/NotificationPrompt'

// ─── Types ────────────────────────────────────────────────────────────────────

type AvailabilityState = 'good' | 'stressed'
type Phase =
  | 'name'              // "Hi" + name input
  | 'checking'          // context reveal + 3-option check-in
  | 'ready_confirmed'   // brief confirmation + notification opt-in for B (P2: synthesis ready)
  | 'not_ready_confirm'
  | 'not_ready_done'

// ─── Constants ────────────────────────────────────────────────────────────────

const C = {
  ink: '#1a1714',
  paper: '#faf8f4',
  white: '#ffffff',
  accent: '#c4622d',
  accentHover: '#a0481f',
  rule: '#e0d8cc',
  muted: '#6b6560',
  dimmed: '#8a8480',
  disabled: '#a09890',
  greenSoft: '#d4e8dc',
  green: '#3d6b4f',
}


// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  personAName?: string
  sessionId?: string
  token?: string
  onReady?: (availabilityState: AvailabilityState) => void
  onNotReady?: () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AvailabilityCheckIn({
  personAName,
  sessionId,
  token,
  onReady,
  onNotReady,
}: Props = {}) {
  const [phase, setPhase] = useState<Phase>('name')
  const [personBName, setPersonBName] = useState('')
  const [selectedOption, setSelectedOption] = useState<'ready' | 'stressed' | 'not_ready' | null>(null)
  const [notifyA, setNotifyA] = useState<boolean | null>(null)
  const [reminderSet, setReminderSet] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const m = useIsMobile()
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (phase === 'name' && nameRef.current) nameRef.current.focus()
  }, [phase])

  // ── Save Person B's name to the session record ─────────────────────────────
  const savePersonBName = async (name: string) => {
    if (!sessionId || !token || !name.trim()) return
    try {
      await fetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_b_name: name.trim(), token }),
      })
    } catch (err) {
      console.log('Name save (non-blocking):', err)
    }
  }

  const handleNameSubmit = async () => {
    if (!personBName.trim()) return
    setSaving(true)
    await savePersonBName(personBName)
    setSaving(false)
    setPhase('checking')
  }

  const handleOptionSelect = (option: 'ready' | 'stressed' | 'not_ready') => {
    setSelectedOption(option)
    if (option === 'ready' || option === 'stressed') {
      // Show the ready_confirmed phase — it now holds the notification opt-in for B.
      // onReady is called from within that phase once B has decided on notifications.
      setPhase('ready_confirmed')
    } else {
      setPhase('not_ready_confirm')
    }
  }

  // Called from the ready_confirmed phase once B has made a notification decision.
  // Fires the P1 notification (tells A that B has joined) and calls onReady.
  const handleReadyProceed = async () => {
    const state: AvailabilityState = selectedOption === 'stressed' ? 'stressed' : 'good'

    // Fire P1 notification: tell Person A that B has joined.
    // Non-blocking — we don't wait for this to complete before advancing.
    if (sessionId) {
      fetch('/api/notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, event: 'b_joined' }),
      }).catch(err => console.log('P1 notify (non-blocking):', err))
    }

    if (onReady) onReady(state)
  }

  const handleNotifyChoice = (notify: boolean) => {
    setNotifyA(notify)
    // When B says "Let [A] know I've seen this" on the not-ready screen,
    // fire the P1 notification so A knows B looked but isn't ready yet.
    if (notify && sessionId) {
      fetch('/api/notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, event: 'b_joined' }),
      }).catch(err => console.log('P1 notify (non-blocking):', err))
    }
  }

  const handleReminderChoice = (time: string | null) => {
    setReminderSet(time)
    // After reminder choice, transition to not_ready_done or call parent
    setPhase('not_ready_done')
    if (onNotReady) onNotReady()
  }

  // ── pageWrap ───────────────────────────────────────────────────────────────
  const pageWrap: React.CSSProperties = {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.paper,
    padding: m ? '16px' : '24px',
  }

  const card: React.CSSProperties = {
    backgroundColor: C.white,
    border: `1px solid ${C.rule}`,
    borderRadius: '10px',
    padding: m ? '28px 20px' : '40px',
    width: '100%',
    maxWidth: '440px',
  }

  // ── PHASE: NAME ─────────────────────────────────────────────────────────────
  if (phase === 'name') {
    return (
      <div style={{
        ...pageWrap,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingTop: m ? 'max(40px, 8vh)' : 'max(56px, 10vh)',
        paddingBottom: '48px',
      }}>
        <style>{`
          input::placeholder { color: #b5aea6; }
          input:focus { border-bottom-color: ${C.accent} !important; }
        `}</style>

        <div style={{ width: '100%', maxWidth: '440px' }}>

          {/* ── MASTHEAD ── */}
          <div
            style={{
              textAlign: 'center',
              paddingBottom: '28px',
              marginBottom: '28px',
              borderBottom: `1px solid ${C.rule}`,
            }}
          >
            <span
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: m ? '26px' : '30px',
                fontWeight: 400,
                color: C.ink,
                display: 'block',
                marginBottom: '9px',
              }}
            >
              Bond
            </span>
            <span
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontStyle: 'italic',
                fontSize: '14px',
                color: C.accent,
                letterSpacing: '0.01em',
              }}
            >
              A private space for hard conversations.
            </span>
          </div>

          <h1
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 'clamp(38px, 8vw, 52px)',
              fontWeight: 400,
              color: C.ink,
              marginBottom: '32px',
              lineHeight: 1.1,
            }}
          >
            Hi
          </h1>

          <input
            ref={nameRef}
            type="text"
            value={personBName}
            onChange={(e) => setPersonBName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleNameSubmit() }}
            placeholder="your name"
            style={{
              width: '100%',
              padding: '12px 0',
              border: 'none',
              borderBottom: `1.5px solid #c8bfb4`,
              borderRadius: 0,
              backgroundColor: 'transparent',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '17px',
              color: C.ink,
              outline: 'none',
              boxSizing: 'border-box',
            }}
            autoComplete="given-name"
          />

          <button
            onClick={handleNameSubmit}
            disabled={!personBName.trim() || saving}
            style={{
              marginTop: '28px',
              padding: '13px 28px',
              minHeight: '44px',
              borderRadius: '8px',
              backgroundColor: personBName.trim() && !saving ? C.accent : C.rule,
              color: personBName.trim() && !saving ? C.white : C.disabled,
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '14px',
              fontWeight: 500,
              border: 'none',
              cursor: personBName.trim() && !saving ? 'pointer' : 'not-allowed',
              transition: 'background-color 0.15s',
              width: '100%',
            }}
            onMouseEnter={(e) => {
              if (personBName.trim() && !saving) e.currentTarget.style.backgroundColor = C.accentHover
            }}
            onMouseLeave={(e) => {
              if (personBName.trim() && !saving) e.currentTarget.style.backgroundColor = C.accent
            }}
          >
            {saving ? 'One moment…' : 'Continue →'}
          </button>
        </div>
      </div>
    )
  }

  // ── PHASE: CHECKING ─────────────────────────────────────────────────────────
  if (phase === 'checking') {
    const displayName = personAName || 'Someone'

    return (
      <div style={{
        ...pageWrap,
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingTop: m ? '20px' : '28px',
        paddingBottom: '48px',
      }}>
        <style>{`
`}</style>

        <div style={{ width: '100%', maxWidth: '440px' }}>

          {/* ── MASTHEAD — minimal mark, wayfinding only ── */}
          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            <span
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '20px',
                fontWeight: 400,
                color: C.ink,
              }}
            >
              Bond
            </span>
          </div>

          <h1
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: m ? '24px' : '28px',
              fontWeight: 400,
              color: C.ink,
              lineHeight: 1.3,
              marginBottom: '20px',
            }}
          >
            {`${displayName} reached out.`}
          </h1>

          {/* Bond context — warm, direct, matches Person A's register */}
          <p
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '15px',
              color: '#4a4540',
              lineHeight: 1.8,
              marginBottom: '32px',
            }}
          >
            Bond is a private space where two people can say what's really going on
            — without it turning into a fight. You each share separately.
            Neither of you sees what the other said. Bond listens to both of you,
            then puts something together for you to read together.
          </p>

          {/* Check-in question */}
          <p
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: m ? '18px' : '20px',
              fontWeight: 400,
              color: C.ink,
              lineHeight: 1.4,
              marginBottom: '20px',
            }}
          >
            How are you feeling right now?
          </p>

          {/* 3 options */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
            {[
              {
                key: 'ready' as const,
                label: "I'm good — ready to be here",
                desc: 'Present and open.',
              },
              {
                key: 'stressed' as const,
                label: "I'm a bit stressed, but I'm here",
                desc: "I'm carrying some weight, but I can do this.",
              },
              {
                key: 'not_ready' as const,
                label: "Right now's not a great time",
                desc: "This will be here when I'm ready.",
              },
            ].map((opt) => (
              <button
                key={opt.key}
                onClick={() => handleOptionSelect(opt.key)}
                style={{
                  textAlign: 'left',
                  padding: '16px 18px',
                  borderRadius: '8px',
                  border: `1px solid ${C.rule}`,
                  backgroundColor: C.white,
                  cursor: 'pointer',
                  width: '100%',
                  transition: 'border-color 0.15s, background-color 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = C.accent
                  e.currentTarget.style.backgroundColor = '#fdf8f5'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = C.rule
                  e.currentTarget.style.backgroundColor = C.white
                }}
              >
                <div
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: '14px',
                    fontWeight: 500,
                    color: C.ink,
                    marginBottom: '3px',
                  }}
                >
                  {opt.label}
                </div>
                <div
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: '13px',
                    color: C.muted,
                    lineHeight: 1.5,
                  }}
                >
                  {opt.desc}
                </div>
              </button>
            ))}
          </div>

          {/* Privacy note — moved below options, reassurance not friction */}
          <p
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '13px',
              color: C.muted,
              lineHeight: 1.75,
              marginBottom: '16px',
              fontStyle: 'italic',
            }}
          >
            Your exact words stay private. What Bond understands from what you share
            — the feelings, what matters to you — shapes what it puts together for you both.
          </p>

          <p
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '12px',
              color: C.dimmed,
              lineHeight: 1.6,
            }}
          >
            There&apos;s no wrong answer. How you show up matters — including saying you&apos;re not ready.
          </p>

        </div>
      </div>
    )
  }

  // ── PHASE: READY CONFIRMED ──────────────────────────────────────────────────
  // Shows a warm confirmation and an optional notification opt-in (P2: synthesis ready).
  // B taps "Begin" to proceed — this also fires the P1 notification to Person A.
  if (phase === 'ready_confirmed') {
    const isStressed = selectedOption === 'stressed'
    return (
      <div style={{ ...pageWrap }}>
        <div style={{ width: '100%', maxWidth: '440px' }}>

          {/* Confirmation mark + copy */}
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div
              style={{
                width: '52px',
                height: '52px',
                borderRadius: '50%',
                backgroundColor: C.greenSoft,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 24px',
                fontSize: '20px',
                color: C.green,
              }}
            >
              ✓
            </div>
            <h2
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '26px',
                fontWeight: 400,
                color: C.ink,
                marginBottom: '12px',
                lineHeight: 1.3,
              }}
            >
              Good to have you here.
            </h2>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '15px', color: '#4a4540', lineHeight: 1.75 }}>
              {isStressed
                ? "It\u2019s okay to show up carrying some weight. We\u2019ll go at a pace that works."
                : "We\u2019ll take it easy. The session is ready whenever you are."}
            </p>
          </div>

          {/* Notification opt-in for B — P2: notify when synthesis is ready.
              Only renders if we have the session context to save the subscription.
              NotificationPrompt self-hides after the user decides. */}
          {sessionId && token && (
            <NotificationPrompt
              headline="Want to know when your synthesis is ready? We can let you know."
              buttonLabel="Yes, notify me"
              sessionId={sessionId}
              myPerson="b"
              myToken={token}
            />
          )}

          {/* Continue button — fires P1 notification to A and starts intake */}
          <button
            onClick={handleReadyProceed}
            style={{
              marginTop: '24px',
              width: '100%',
              padding: '14px 20px',
              borderRadius: '8px',
              backgroundColor: C.accent,
              color: C.white,
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '14px',
              fontWeight: 500,
              border: 'none',
              cursor: 'pointer',
              transition: 'background-color 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = C.accentHover }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = C.accent }}
          >
            Begin
          </button>

        </div>
      </div>
    )
  }

  // ── PHASE: NOT READY CONFIRM ────────────────────────────────────────────────
  if (phase === 'not_ready_confirm') {
    const displayName = personAName || 'them'

    return (
      <div style={pageWrap}>
        <style>{`
`}</style>

        <div style={card}>
          <p
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: m ? '20px' : '24px',
              fontWeight: 400,
              color: C.ink,
              lineHeight: 1.4,
              marginBottom: '8px',
            }}
          >
            {personBName ? `Got it, ${personBName}.` : 'Got it.'}
          </p>
          <p
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '15px',
              color: '#4a4540',
              lineHeight: 1.75,
              marginBottom: '32px',
            }}
          >
            Come back whenever you&apos;re ready — this will be here.
          </p>

          {/* Primary notification button */}
          <button
            onClick={() => {
              handleNotifyChoice(true)
              handleReminderChoice(reminderSet)
            }}
            style={{
              width: '100%',
              padding: '14px 20px',
              borderRadius: '8px',
              backgroundColor: C.accent,
              color: C.white,
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '14px',
              fontWeight: 500,
              border: 'none',
              cursor: 'pointer',
              marginBottom: '12px',
              transition: 'background-color 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = C.accentHover }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = C.accent }}
          >
            {`Let ${displayName} know I've seen this`}
          </button>

          {/* Muted quiet-return link */}
          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            <button
              onClick={() => {
                handleNotifyChoice(false)
                handleReminderChoice(reminderSet)
              }}
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
              onMouseEnter={(e) => { e.currentTarget.style.color = C.muted }}
              onMouseLeave={(e) => { e.currentTarget.style.color = C.dimmed }}
            >
              I&apos;ll come back quietly
            </button>
          </div>

          {/* Reminder row */}
          <div
            style={{
              paddingTop: '20px',
              borderTop: `1px solid ${C.rule}`,
            }}
          >
            <p
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '12px',
                color: C.dimmed,
                marginBottom: '10px',
              }}
            >
              Want a reminder?
            </p>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {['Tomorrow', 'This weekend', 'No thanks'].map((label) => (
                <button
                  key={label}
                  onClick={() => {
                    const t = label === 'No thanks' ? 'no_thanks' : label.toLowerCase().replace(' ', '_')
                    setReminderSet(t)
                  }}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '20px',
                    border: `1px solid ${reminderSet === (label === 'No thanks' ? 'no_thanks' : label.toLowerCase().replace(' ', '_')) ? C.accent : C.rule}`,
                    backgroundColor: C.white,
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: '13px',
                    color: C.muted,
                    cursor: 'pointer',
                    transition: 'border-color 0.12s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = C.accent }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = C.rule }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── PHASE: NOT READY DONE (fallback if onNotReady not provided) ────────────
  if (phase === 'not_ready_done') {
    return (
      <div style={pageWrap}>
        <div style={{ width: '100%', maxWidth: '440px', textAlign: 'center' }}>
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '50%',
              backgroundColor: C.rule,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px',
              fontSize: '18px',
              color: C.dimmed,
            }}
          >
            —
          </div>
          <h2
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '26px',
              fontWeight: 400,
              color: C.ink,
              marginBottom: '12px',
              lineHeight: 1.3,
            }}
          >
            {notifyA ? 'Noted.' : 'No problem at all.'}
          </h2>
          <p style={{ fontSize: '15px', color: '#4a4540', lineHeight: 1.75 }}>
            {notifyA
              ? "They\u2019ll know you\u2019ve seen this. Come back whenever it feels right."
              : "Come back whenever you\u2019re ready. There\u2019s no rush."}
          </p>
        </div>
      </div>
    )
  }

  return null
}
