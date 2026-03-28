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

// ─── Types ────────────────────────────────────────────────────────────────────

type AvailabilityState = 'good' | 'stressed'
type Phase =
  | 'name'         // "Hi" + name input
  | 'checking'     // context reveal + 3-option check-in
  | 'ready_confirmed'
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

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital@0;1&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400&display=swap');`

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
      const state: AvailabilityState = option === 'stressed' ? 'stressed' : 'good'
      setPhase('ready_confirmed')
      // Small delay so user sees the selection before the phase transitions
      setTimeout(() => {
        if (onReady) onReady(state)
      }, 1200)
    } else {
      setPhase('not_ready_confirm')
    }
  }

  const handleNotifyChoice = (notify: boolean) => {
    setNotifyA(notify)
    // Notification logic: fires only if notify=true, handled by parent/future push system
    // For now, just log and proceed — P1/P2 push notifications are a separate build task
    console.log('notify_a:', notify)
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
          ${FONTS}
          body { font-family: 'DM Sans', sans-serif; }
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
                fontFamily: "'Playfair Display', serif",
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
                fontFamily: "'Playfair Display', serif",
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
              fontFamily: "'Playfair Display', serif",
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
        paddingTop: m ? 'max(40px, 8vh)' : 'max(56px, 10vh)',
        paddingBottom: '48px',
      }}>
        <style>{`${FONTS} body { font-family: 'DM Sans', sans-serif; }`}</style>

        <div style={{ width: '100%', maxWidth: '440px' }}>

          {/* ── MASTHEAD ── */}
          <div
            style={{
              textAlign: 'center',
              paddingBottom: '28px',
              marginBottom: '32px',
              borderBottom: `1px solid ${C.rule}`,
            }}
          >
            <span
              style={{
                fontFamily: "'Playfair Display', serif",
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
                fontFamily: "'Playfair Display', serif",
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
              fontFamily: "'Playfair Display', serif",
              fontSize: m ? '24px' : '28px',
              fontWeight: 400,
              color: C.ink,
              lineHeight: 1.3,
              marginBottom: '24px',
            }}
          >
            {displayName} reached out.
          </h1>

          {/* Bond context */}
          <p
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '15px',
              color: '#4a4540',
              lineHeight: 1.8,
              marginBottom: '16px',
            }}
          >
            Bond is a space where two people can share their sides of something — privately —
            without it turning into an argument. I&apos;ll hear from both of you separately,
            then put together something for you to read together.
          </p>

          {/* Honest privacy */}
          <p
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '14px',
              color: C.muted,
              lineHeight: 1.75,
              marginBottom: '36px',
              fontStyle: 'italic',
            }}
          >
            Your exact words stay private. What Bond understands from what you share
            — the feelings, what matters to you — shapes what it puts together for you both.
          </p>

          {/* Divider */}
          <div style={{ height: '1px', backgroundColor: C.rule, marginBottom: '28px' }} />

          {/* Check-in question */}
          <p
            style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: m ? '18px' : '20px',
              fontWeight: 400,
              color: C.ink,
              lineHeight: 1.4,
              marginBottom: '20px',
            }}
          >
            Before we go any further — how are you right now?
          </p>

          {/* 3 options */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
            {[
              {
                key: 'ready' as const,
                label: "I'm good — ready to be here",
                desc: 'Present and open.',
              },
              {
                key: 'stressed' as const,
                label: "I'm a bit stressed, but I can show up",
                desc: "I'm carrying some weight, but I'm here.",
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
  if (phase === 'ready_confirmed') {
    const isStressed = selectedOption === 'stressed'
    return (
      <div style={{ ...pageWrap }}>
        <style>{FONTS}</style>
        <div style={{ width: '100%', maxWidth: '440px', textAlign: 'center' }}>
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
              fontFamily: "'Playfair Display', serif",
              fontSize: '26px',
              fontWeight: 400,
              color: C.ink,
              marginBottom: '12px',
              lineHeight: 1.3,
            }}
          >
            Good to have you here.
          </h2>
          <p style={{ fontSize: '15px', color: '#4a4540', lineHeight: 1.75 }}>
            {isStressed
              ? "It\u2019s okay to show up carrying some weight. We\u2019ll go at a pace that works."
              : "We\u2019ll take it easy. The session is ready whenever you are."}
          </p>
        </div>
      </div>
    )
  }

  // ── PHASE: NOT READY CONFIRM ────────────────────────────────────────────────
  if (phase === 'not_ready_confirm') {
    const displayName = personAName || 'them'

    return (
      <div style={pageWrap}>
        <style>{`${FONTS} body { font-family: 'DM Sans', sans-serif; }`}</style>

        <div style={card}>
          <p
            style={{
              fontFamily: "'Playfair Display', serif",
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
            Let {displayName} know I&apos;ve seen this
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
                    const t = label === 'No thanks' ? null : label.toLowerCase().replace(' ', '_')
                    setReminderSet(t)
                  }}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '20px',
                    border: `1px solid ${reminderSet === (label === 'No thanks' ? null : label.toLowerCase().replace(' ', '_')) || (label === 'No thanks' && reminderSet === null && reminderSet !== undefined) ? C.accent : C.rule}`,
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
        <style>{FONTS}</style>
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
              fontFamily: "'Playfair Display', serif",
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
