'use client'

// SynthesisView — shown to both Person A and Person B once synthesis is ready.
//
// Displays the 4-section synthesis, then asks privately:
//   "Does this feel accurate to you?"  yes / partially / no
//
// If partially or no, a follow-up textarea appears.
// On submit: saves to session_responses, calls onResponded() so the
// session page can re-fetch status and show the right next screen.

import { useState } from 'react'

type SynthesisContent = {
  carrying_a: string
  carrying_b: string
  underneath: string
  friction: string
}

type Props = {
  synthesis: SynthesisContent
  sessionId: string
  token: string
  myRole: 'a' | 'b'
  onResponded: () => void
}

type AccuracyChoice = 'yes' | 'partially' | 'no'

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
  softAmber: '#f5ede0',
}

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital@0;1&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400&display=swap');`

const SECTIONS = [
  {
    key: 'carrying_a' as const,
    label: 'What one person is carrying',
  },
  {
    key: 'carrying_b' as const,
    label: 'What the other person is carrying',
  },
  {
    key: 'underneath' as const,
    label: 'What both of you seem to want, underneath it',
  },
  {
    key: 'friction' as const,
    label: 'Where the friction is living',
  },
]

export default function SynthesisView({ synthesis, sessionId, token, myRole, onResponded }: Props) {
  const [choice, setChoice] = useState<AccuracyChoice | null>(null)
  const [context, setContext] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit() {
    if (!choice) return
    setSubmitting(true)
    setError(null)

    try {
      // Determine new session status based on who's responding
      const newStatus = myRole === 'a' ? 'a_responded_synthesis' : 'b_responded_synthesis'

      // Save response to session_responses
      const res = await fetch('/api/session-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          token,
          person: myRole,
          step: 'synthesis_accuracy',
          response: { choice, context: context.trim() || null },
          newStatus,
        }),
      })

      if (!res.ok) {
        throw new Error('Could not save your response.')
      }

      setSubmitted(true)
      // Short pause so the submitted state is visible, then hand off to session page
      setTimeout(() => onResponded(), 800)
    } catch (err) {
      console.error(err)
      setError('Something went wrong saving your response. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const needsContext = choice === 'partially' || choice === 'no'

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: C.paper,
        padding: '48px 24px 80px',
      }}
    >
      <style>{`
        ${FONTS}
        * { box-sizing: border-box; }
        body { font-family: 'DM Sans', sans-serif; margin: 0; }
        textarea:focus { outline: none; }
        button:hover { opacity: 0.85; }
      `}</style>

      <div style={{ maxWidth: '580px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: '48px' }}>
          <p style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: '11px',
            letterSpacing: '0.12em',
            color: C.dimmed,
            textTransform: 'uppercase',
            marginBottom: '14px',
          }}>
            Bond's read
          </p>
          <h1 style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: '28px',
            fontWeight: 400,
            color: C.ink,
            lineHeight: 1.3,
            margin: 0,
          }}>
            Here's what Bond sees.
          </h1>
          <p style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '15px',
            color: C.muted,
            marginTop: '10px',
            lineHeight: 1.7,
          }}>
            This isn't a verdict — it's a mirror. Read it slowly.
          </p>
        </div>

        {/* Synthesis sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0px' }}>
          {SECTIONS.map(({ key, label }, i) => (
            <div
              key={key}
              style={{
                padding: '28px 0',
                borderBottom: i < SECTIONS.length - 1 ? `1px solid ${C.rule}` : 'none',
              }}
            >
              <p style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: '10px',
                letterSpacing: '0.1em',
                color: C.dimmed,
                textTransform: 'uppercase',
                marginBottom: '10px',
                margin: '0 0 10px 0',
              }}>
                {label}
              </p>
              <p style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: '17px',
                fontWeight: 400,
                fontStyle: 'italic',
                color: C.ink,
                lineHeight: 1.8,
                margin: 0,
              }}>
                {synthesis[key]}
              </p>
            </div>
          ))}
        </div>

        {/* Accuracy question */}
        {!submitted && (
          <div
            style={{
              marginTop: '52px',
              padding: '32px',
              backgroundColor: C.softAmber,
              borderRadius: '8px',
            }}
          >
            <p style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: '20px',
              fontWeight: 400,
              color: C.ink,
              marginBottom: '8px',
              lineHeight: 1.4,
            }}>
              Does this feel accurate to you?
            </p>
            <p style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '14px',
              color: C.muted,
              marginBottom: '24px',
              lineHeight: 1.6,
            }}>
              Only you can see your answer. Be honest — Bond uses this to decide what comes next.
            </p>

            {/* Choice buttons */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '24px' }}>
              {(['yes', 'partially', 'no'] as AccuracyChoice[]).map((opt) => (
                <button
                  key={opt}
                  onClick={() => setChoice(opt)}
                  style={{
                    padding: '10px 22px',
                    borderRadius: '6px',
                    border: `1.5px solid ${choice === opt ? C.accent : C.rule}`,
                    backgroundColor: choice === opt ? C.accentSoft : C.white,
                    color: choice === opt ? C.accent : C.ink,
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: '14px',
                    fontWeight: choice === opt ? 500 : 400,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {opt === 'yes' ? 'Yes, it does' : opt === 'partially' ? 'Partially' : 'Not really'}
                </button>
              ))}
            </div>

            {/* Context textarea — only shown for partial/no */}
            {needsContext && (
              <div style={{ marginBottom: '24px' }}>
                <p style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '14px',
                  color: C.muted,
                  marginBottom: '10px',
                }}>
                  {choice === 'partially'
                    ? "What did it miss or get wrong?"
                    : "What felt off? Help Bond understand."}
                </p>
                <textarea
                  value={context}
                  onChange={e => setContext(e.target.value)}
                  placeholder="Share what's missing or inaccurate…"
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '14px',
                    borderRadius: '6px',
                    border: `1.5px solid ${C.rule}`,
                    backgroundColor: C.white,
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: '14px',
                    color: C.ink,
                    lineHeight: 1.6,
                    resize: 'vertical',
                  }}
                />
              </div>
            )}

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
              disabled={!choice || submitting || (needsContext && context.trim().length < 2)}
              style={{
                padding: '14px 28px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: C.accent,
                color: C.white,
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '15px',
                fontWeight: 500,
                cursor: choice && !submitting ? 'pointer' : 'not-allowed',
                opacity: !choice || submitting || (needsContext && context.trim().length < 2) ? 0.45 : 1,
                transition: 'opacity 0.15s ease',
              }}
            >
              {submitting ? 'Saving…' : 'Share my response'}
            </button>
          </div>
        )}

        {/* Submitted state */}
        {submitted && (
          <div style={{
            marginTop: '52px',
            padding: '32px',
            backgroundColor: C.softAmber,
            borderRadius: '8px',
            textAlign: 'center',
          }}>
            <p style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: '20px',
              color: C.ink,
            }}>
              Your thoughts are in.
            </p>
          </div>
        )}

      </div>
    </div>
  )
}
