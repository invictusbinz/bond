'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

type AvailabilityOption = 'ready' | 'stressed' | 'not_now' | 'need_time'

type Phase =
  | 'checking'
  | 'ready_confirmed'
  | 'not_ready_followup'
  | 'not_ready_notified'
  | 'not_ready_private'
  | 'reminder_followup'
  | 'reminder_set'

type ReminderTime = 'few_hours' | 'tomorrow' | 'weekend'

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

const OPTIONS: { key: AvailabilityOption; label: string; description: string }[] = [
  {
    key: 'ready',
    label: "I'm good — ready to engage",
    description: 'Present and open to this conversation.',
  },
  {
    key: 'stressed',
    label: "I'm a bit stressed but I can show up",
    description: "I'm carrying some weight, but I'm here.",
  },
  {
    key: 'not_now',
    label: "Right now's not a great time for me",
    description: 'I need a day or two before I can engage.',
  },
  {
    key: 'need_time',
    label: 'I need a little time — remind me later',
    description: "Tell me when to come back.",
  },
]

const REMINDER_OPTIONS: { key: ReminderTime; label: string }[] = [
  { key: 'few_hours', label: 'In a few hours' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'weekend', label: 'This weekend' },
]

// ─── Shared style objects ─────────────────────────────────────────────────────

const pageWrap: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: C.paper,
  padding: '24px',
}

const card: React.CSSProperties = {
  backgroundColor: C.white,
  border: `1px solid ${C.rule}`,
  borderRadius: '8px',
  padding: '40px',
}

const eyebrow: React.CSSProperties = {
  fontFamily: "'DM Mono', monospace",
  fontSize: '10px',
  letterSpacing: '0.2em',
  textTransform: 'uppercase',
  color: C.accent,
  marginBottom: '20px',
}

const headline: React.CSSProperties = {
  fontFamily: "'Playfair Display', serif",
  fontSize: '26px',
  fontWeight: 400,
  color: C.ink,
  marginBottom: '8px',
  lineHeight: 1.3,
}

const subtext: React.CSSProperties = {
  fontSize: '14px',
  color: C.muted,
  lineHeight: 1.7,
  marginBottom: '28px',
}

const aiResponse: React.CSSProperties = {
  fontFamily: "'Playfair Display', serif",
  fontSize: '22px',
  fontWeight: 400,
  color: C.ink,
  lineHeight: 1.5,
  margin: '0 0 16px',
}

const bodyText: React.CSSProperties = {
  fontSize: '15px',
  color: '#4a4540',
  lineHeight: 1.75,
  marginBottom: '28px',
}

const footerNote: React.CSSProperties = {
  fontSize: '12px',
  color: C.dimmed,
  lineHeight: 1.6,
  marginTop: '24px',
  paddingTop: '20px',
  borderTop: `1px solid ${C.rule}`,
}

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  // Called when Person B confirms they are ready to proceed to intake.
  // If not provided, the ready_confirmed screen is a dead-end (original behaviour).
  onReady?: () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AvailabilityCheckIn({ onReady }: Props = {}) {
  const [phase, setPhase] = useState<Phase>('checking')
  const [selectedOption, setSelectedOption] = useState<AvailabilityOption | null>(null)
  const [hoveredOption, setHoveredOption] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Save to Supabase, non-blocking — won't crash if table doesn't exist yet
  const saveToSupabase = async (option: AvailabilityOption, extra?: Record<string, unknown>) => {
    try {
      const { error } = await supabase.from('availability_check_ins').insert({
        availability: option,
        ...extra,
        checked_in_at: new Date().toISOString(),
      })
      if (error) console.log('Supabase save (non-blocking):', error)
    } catch (err) {
      console.log('Save error (non-blocking):', err)
    }
  }

  const handleOptionSelect = async (option: AvailabilityOption) => {
    setSelectedOption(option)
    if (option === 'ready' || option === 'stressed') {
      setLoading(true)
      await saveToSupabase(option)
      setLoading(false)
      setPhase('ready_confirmed')
    } else if (option === 'not_now') {
      setPhase('not_ready_followup')
    } else if (option === 'need_time') {
      setPhase('reminder_followup')
    }
  }

  const handleNotReadyChoice = async (notify: boolean) => {
    setLoading(true)
    await saveToSupabase(selectedOption!, { notify_initiator: notify })
    setLoading(false)
    setPhase(notify ? 'not_ready_notified' : 'not_ready_private')
  }

  const handleReminderChoice = async (time: ReminderTime) => {
    setLoading(true)
    await saveToSupabase(selectedOption!, { reminder_time: time })
    setLoading(false)
    setPhase('reminder_set')
  }

  // ─── Sub-option button (reused in follow-up phases) ───────────────────────
  const renderSubOption = (label: string, onClick: () => void) => (
    <button
      key={label}
      onClick={onClick}
      disabled={loading}
      style={{
        textAlign: 'left',
        padding: '14px 18px',
        borderRadius: '8px',
        border: `1px solid ${C.rule}`,
        backgroundColor: C.white,
        cursor: loading ? 'not-allowed' : 'pointer',
        width: '100%',
        fontFamily: "'DM Sans', sans-serif",
        fontSize: '14px',
        fontWeight: 500,
        color: loading ? C.disabled : C.ink,
        opacity: loading ? 0.6 : 1,
        transition: 'border-color 0.15s, color 0.15s',
      }}
      onMouseEnter={(e) => {
        if (!loading) {
          e.currentTarget.style.borderColor = C.accent
          e.currentTarget.style.color = C.accent
        }
      }}
      onMouseLeave={(e) => {
        if (!loading) {
          e.currentTarget.style.borderColor = C.rule
          e.currentTarget.style.color = C.ink
        }
      }}
    >
      {label}
    </button>
  )

  // ─── PHASE: CHECKING ───────────────────────────────────────────────────────
  if (phase === 'checking') {
    return (
      <div style={pageWrap}>
        <style>{`${FONTS} body { font-family: 'DM Sans', sans-serif; }`}</style>

        <div style={{ width: '100%', maxWidth: '440px' }}>
          <div style={card}>
            <div style={eyebrow}>Availability Check-In</div>

            <h1 style={headline}>How are you feeling right now?</h1>
            <p style={subtext}>
              There&apos;s a Bond Session waiting for you. Before you go in, take a moment.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {OPTIONS.map((opt) => {
                const isHovered = hoveredOption === opt.key
                return (
                  <button
                    key={opt.key}
                    onClick={() => handleOptionSelect(opt.key)}
                    disabled={loading}
                    onMouseEnter={() => { if (!loading) setHoveredOption(opt.key) }}
                    onMouseLeave={() => setHoveredOption(null)}
                    style={{
                      textAlign: 'left',
                      padding: '16px 18px',
                      borderRadius: '8px',
                      border: isHovered ? `1px solid ${C.accent}` : `1px solid ${C.rule}`,
                      backgroundColor: isHovered ? '#fdf8f5' : C.white,
                      cursor: loading ? 'not-allowed' : 'pointer',
                      width: '100%',
                      opacity: loading ? 0.6 : 1,
                      transition: 'border-color 0.15s, background-color 0.15s',
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
                      {opt.description}
                    </div>
                  </button>
                )
              })}
            </div>

            <p style={footerNote}>
              There&apos;s no wrong answer here. How you show up matters — including saying you&apos;re not ready.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ─── PHASE: READY CONFIRMED ────────────────────────────────────────────────
  if (phase === 'ready_confirmed') {
    const isStressed = selectedOption === 'stressed'
    return (
      <div style={pageWrap}>
        <style>{`${FONTS} body { font-family: 'DM Sans', sans-serif; }`}</style>
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
            {isStressed ? 'Good to know.' : 'Good to have you here.'}
          </h2>
          <p style={{ fontSize: '15px', color: '#4a4540', lineHeight: 1.75, marginBottom: onReady ? '32px' : '0' }}>
            {isStressed
              ? "It's okay to show up carrying some weight. We'll go at a pace that works. Take your time."
              : "We'll take it at a reasonable pace. The session is ready whenever you are."}
          </p>

          {/* Only show continue button if the parent has provided an onReady handler */}
          {onReady && (
            <button
              onClick={onReady}
              style={{
                padding: '13px 32px',
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
              Continue
            </button>
          )}
        </div>
      </div>
    )
  }

  // ─── PHASE: NOT READY FOLLOWUP ─────────────────────────────────────────────
  if (phase === 'not_ready_followup') {
    return (
      <div style={pageWrap}>
        <style>{`${FONTS} body { font-family: 'DM Sans', sans-serif; }`}</style>

        <div style={{ width: '100%', maxWidth: '440px' }}>
          <div style={card}>
            <div style={eyebrow}>Availability Check-In</div>

            <p style={aiResponse}>That&apos;s okay to say.</p>
            <p style={bodyText}>
              Would you like me to let them know you&apos;ve seen this but need a day or two?
              I won&apos;t share anything else — just that you&apos;ve acknowledged it.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {renderSubOption('Yes, let them know', () => handleNotReadyChoice(true))}
              {renderSubOption("No, I'll come back on my own", () => handleNotReadyChoice(false))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ─── PHASE: NOT READY — NOTIFIED ───────────────────────────────────────────
  if (phase === 'not_ready_notified') {
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
            Done.
          </h2>
          <p style={{ fontSize: '15px', color: '#4a4540', lineHeight: 1.75 }}>
            They&apos;ll know you&apos;ve seen this and will be in touch when you&apos;re ready.
            Come back whenever it feels right.
          </p>
        </div>
      </div>
    )
  }

  // ─── PHASE: NOT READY — PRIVATE ────────────────────────────────────────────
  if (phase === 'not_ready_private') {
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
            No problem at all.
          </h2>
          <p style={{ fontSize: '15px', color: '#4a4540', lineHeight: 1.75 }}>
            Come back whenever you&apos;re ready. There&apos;s no rush.
          </p>
        </div>
      </div>
    )
  }

  // ─── PHASE: REMINDER FOLLOWUP ──────────────────────────────────────────────
  if (phase === 'reminder_followup') {
    return (
      <div style={pageWrap}>
        <style>{`${FONTS} body { font-family: 'DM Sans', sans-serif; }`}</style>

        <div style={{ width: '100%', maxWidth: '440px' }}>
          <div style={card}>
            <div style={eyebrow}>Availability Check-In</div>

            <p style={aiResponse}>Of course.</p>
            <p style={bodyText}>When would be a better time?</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {REMINDER_OPTIONS.map((opt) =>
                renderSubOption(opt.label, () => handleReminderChoice(opt.key))
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ─── PHASE: REMINDER SET ───────────────────────────────────────────────────
  if (phase === 'reminder_set') {
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
            ↺
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
            Got it.
          </h2>
          <p style={{ fontSize: '15px', color: '#4a4540', lineHeight: 1.75 }}>
            The session will be here when you come back.
          </p>
        </div>
      </div>
    )
  }

  return null
}
