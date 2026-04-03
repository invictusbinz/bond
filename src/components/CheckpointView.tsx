'use client'

// CheckpointView — shown to both people after synthesis is settled.
//
// Asks one question privately: where are you?
// Two options, each with an honest description of what comes next.
//
// "This was what I needed." → session closes. Each person gets a private debrief.
// "I want to keep working through this." → Bond helps both work through what's unresolved.
//
// The grounding line names the partner and explains what happens — users have no
// product map at this moment and need to know what each choice actually leads to.
//
// Internal values stay as 'yes' and 'not_yet' for DB compatibility:
//   yes      → "I want to keep working through this."
//   not_yet  → "This was what I needed."

import { useState } from 'react'
import { useIsMobile } from '@/lib/useIsMobile'

type Props = {
  sessionId: string
  token: string
  myRole: 'a' | 'b'
  partnerName?: string                    // used in the grounding line
  onResponded: (choice: string) => void   // passes back what was chosen
}

type CheckpointChoice = 'yes' | 'not_yet'

const C = {
  ink: '#1a1714',
  paper: '#faf8f4',
  white: '#ffffff',
  accent: '#c4622d',
  accentHover: '#a0481f',
  accentSoft: '#fdf5f0',
  rule: '#e0d8cc',
  muted: '#6b6560',
  dimmed: '#8a8480',
  softBlue: '#e8eef4',
  blue: '#3a5f7d',
}


export default function CheckpointView({ sessionId, token, myRole, partnerName, onResponded }: Props) {
  const m = useIsMobile()
  const [choice, setChoice] = useState<CheckpointChoice | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit() {
    if (!choice) return
    setSubmitting(true)
    setError(null)

    try {
      const newStatus = myRole === 'a' ? 'a_responded_checkpoint' : 'b_responded_checkpoint'

      const res = await fetch('/api/session-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          token,
          person: myRole,
          step: 'checkpoint',
          response: { choice },
          newStatus,
        }),
      })

      if (!res.ok) throw new Error('Could not save your response.')

      // Save choice locally so the split screen can show per-person copy
      // even if the person refreshes their browser after submitting.
      try {
        localStorage.setItem(`bond_checkpoint_choice_${sessionId}`, choice)
      } catch {}

      setSubmitted(true)
      setTimeout(() => onResponded(choice), 800)
    } catch (err) {
      console.error(err)
      setError('Bond had trouble saving your response. Give it a moment and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // Grounding line names the partner if we have them, otherwise generic.
  const groundingLine = partnerName
    ? `${partnerName} will be asked the same thing. What you both choose determines what comes next.`
    : "They'll be asked the same thing. What you both choose determines what comes next."

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: C.paper,
        padding: m ? '24px 16px' : '48px 24px',
      }}
    >
      <style>{`
                * { box-sizing: border-box; }
        button:hover { opacity: 0.85; }
      `}</style>

      <div style={{ width: '100%', maxWidth: '520px' }}>

        {/* Eyebrow */}
        <p style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '11px',
          letterSpacing: '0.12em',
          color: C.dimmed,
          textTransform: 'uppercase',
          marginBottom: '20px',
        }}>
          A moment to check in
        </p>

        {/* Headline */}
        <h1 style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: m ? '26px' : '30px',
          fontWeight: 400,
          color: C.ink,
          lineHeight: 1.3,
          marginBottom: '16px',
        }}>
          Bond has heard you both.
        </h1>

        {/* Divider */}
        <div style={{
          width: '40px',
          height: '1px',
          backgroundColor: C.rule,
          marginBottom: '32px',
        }} />

        {/* Choices */}
        {!submitted ? (
          <div>

            {/* Grounding line */}
            <p style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '15px',
              color: C.muted,
              lineHeight: 1.7,
              marginBottom: '28px',
            }}>
              {groundingLine}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '32px' }}>

              {/* Option 1 — done / "This was what I needed." */}
              <button
                onClick={() => setChoice('not_yet')}
                style={{
                  padding: '18px 24px',
                  borderRadius: '8px',
                  border: `1.5px solid ${choice === 'not_yet' ? C.blue : C.rule}`,
                  backgroundColor: choice === 'not_yet' ? C.softBlue : C.white,
                  color: C.ink,
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '15px',
                  fontWeight: choice === 'not_yet' ? 500 : 400,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                  lineHeight: 1.5,
                }}
              >
                <span style={{ display: 'block', marginBottom: '5px' }}>This was what I needed.</span>
                <span style={{
                  fontSize: '13px',
                  color: C.muted,
                  fontWeight: 400,
                }}>
                  Bond closes this session here. You'll each get a private reflection — just yours.
                </span>
              </button>

              {/* Option 2 — keep going / "I want to keep working through this." */}
              <button
                onClick={() => setChoice('yes')}
                style={{
                  padding: '18px 24px',
                  borderRadius: '8px',
                  border: `1.5px solid ${choice === 'yes' ? C.accent : C.rule}`,
                  backgroundColor: choice === 'yes' ? C.accentSoft : C.white,
                  color: C.ink,
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '15px',
                  fontWeight: choice === 'yes' ? 500 : 400,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                  lineHeight: 1.5,
                }}
              >
                <span style={{ display: 'block', marginBottom: '5px' }}>I want to keep working through this.</span>
                <span style={{
                  fontSize: '13px',
                  color: C.muted,
                  fontWeight: 400,
                }}>
                  Bond will help you both work through what's still unresolved — with Bond in the middle, same as before.
                </span>
              </button>

            </div>

            {error && (
              <p style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '13px',
                color: '#b94040',
                marginBottom: '16px',
              }}>
                {error}
              </p>
            )}

            <button
              onClick={handleSubmit}
              disabled={!choice || submitting}
              style={{
                width: m ? '100%' : 'auto',
                padding: '14px 28px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: C.accent,
                color: C.white,
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '15px',
                fontWeight: 500,
                cursor: choice && !submitting ? 'pointer' : 'not-allowed',
                opacity: !choice || submitting ? 0.45 : 1,
                transition: 'opacity 0.15s ease',
              }}
            >
              {submitting ? 'Saving…' : 'Share my answer'}
            </button>
          </div>
        ) : (
          <div style={{
            padding: '28px',
            backgroundColor: C.accentSoft,
            borderRadius: '8px',
          }}>
            <p style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '20px',
              color: C.ink,
            }}>
              You've answered.
            </p>
          </div>
        )}

      </div>
    </div>
  )
}
