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

// New format: personalized per-person views (EFT+NVC framework)
// Old format: 4-section generic structure (backward compat for existing sessions)
type SynthesisContent = {
  // New format
  a_view?: string
  b_view?: string
  // Old format (legacy — kept for backward compat)
  carrying_a?: string
  carrying_b?: string
  underneath?: string
  friction?: string
}

type Props = {
  synthesis: SynthesisContent
  sessionId: string
  token: string
  myRole: 'a' | 'b'
  onResponded: () => void
  // When true: this is the revised synthesis. Instead of the accuracy question,
  // show the checkpoint question inline ("Do you want to work through this together?").
  // Submits as step: 'checkpoint' rather than 'synthesis_accuracy'.
  isRevised?: boolean
}

type AccuracyChoice = 'yes' | 'partially' | 'no'
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
  softAmber: '#f5ede0',
}

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital@0;1&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400&display=swap');`

// ─── Legacy 4-section layout (for sessions generated before the EFT+NVC rework) ─
const LEGACY_SECTIONS = [
  { key: 'carrying_a' as const, label: 'What one person is carrying' },
  { key: 'carrying_b' as const, label: 'What the other person is carrying' },
  { key: 'underneath' as const, label: 'What both of you seem to want, underneath it' },
  { key: 'friction' as const, label: 'Where the friction is living' },
]

export default function SynthesisView({ synthesis, sessionId, token, myRole, onResponded, isRevised = false }: Props) {
  // Accuracy flow (original synthesis)
  const [accuracyChoice, setAccuracyChoice] = useState<AccuracyChoice | null>(null)
  const [context, setContext] = useState('')
  // Checkpoint flow (revised synthesis)
  const [checkpointChoice, setCheckpointChoice] = useState<CheckpointChoice | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit() {
    const hasChoice = isRevised ? !!checkpointChoice : !!accuracyChoice
    if (!hasChoice) return
    setSubmitting(true)
    setError(null)

    try {
      let step: string
      let response: object
      let newStatus: string

      if (isRevised) {
        // Revised synthesis → submit as checkpoint step directly
        step = 'checkpoint'
        response = { choice: checkpointChoice }
        newStatus = myRole === 'a' ? 'a_responded_checkpoint' : 'b_responded_checkpoint'
      } else {
        // Original synthesis → submit as synthesis_accuracy
        step = 'synthesis_accuracy'
        response = { choice: accuracyChoice, context: context.trim() || null }
        newStatus = myRole === 'a' ? 'a_responded_synthesis' : 'b_responded_synthesis'
      }

      const res = await fetch('/api/session-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, token, person: myRole, step, response, newStatus }),
      })

      if (!res.ok) {
        throw new Error('Could not save your response.')
      }

      setSubmitted(true)
      setTimeout(() => onResponded(), 800)
    } catch (err) {
      console.error(err)
      setError('Bond had trouble saving your response. Give it a moment and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const needsContext = accuracyChoice === 'partially' || accuracyChoice === 'no'
  const canSubmit = isRevised ? !!checkpointChoice : (!!accuracyChoice && !(needsContext && context.trim().length < 2))

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
            Bond's read on you
          </p>
          <h1 style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: '28px',
            fontWeight: 400,
            color: C.ink,
            lineHeight: 1.3,
            margin: 0,
          }}>
            Here's what Bond sees in you.
          </h1>
          <p style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '15px',
            color: C.muted,
            marginTop: '10px',
            lineHeight: 1.7,
          }}>
            This is your side of the picture — not a verdict, not a score. Read it slowly.
          </p>
        </div>

        {/* Synthesis content — personalized view or legacy 4-section fallback */}
        {(synthesis.a_view || synthesis.b_view) ? (
          /* ── New format: personalized flowing view per person ── */
          <div>
            {(myRole === 'a' ? synthesis.a_view : synthesis.b_view)
              ?.split('\n\n')
              .filter(p => p.trim())
              .map((para, i) => (
                <p
                  key={i}
                  style={{
                    fontFamily: "'Playfair Display', serif",
                    fontSize: '18px',
                    fontWeight: 400,
                    fontStyle: 'italic',
                    color: C.ink,
                    lineHeight: 1.85,
                    margin: 0,
                    marginBottom: '28px',
                  }}
                >
                  {para.trim()}
                </p>
              ))
            }
          </div>
        ) : (
          /* ── Legacy format: 4-section labeled layout (backward compat) ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0px' }}>
            {LEGACY_SECTIONS.map(({ key, label }, i) => (
              <div
                key={key}
                style={{
                  padding: '28px 0',
                  borderBottom: i < LEGACY_SECTIONS.length - 1 ? `1px solid ${C.rule}` : 'none',
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
        )}

        {/* Response section — accuracy question (original) or checkpoint question (revised) */}
        {!submitted && (
          <div
            style={{
              marginTop: '52px',
              padding: '32px',
              backgroundColor: C.softAmber,
              borderRadius: '8px',
            }}
          >
            {isRevised ? (
              /* ── Checkpoint question (revised synthesis path) ── */
              <>
                <p style={{
                  fontFamily: "'Playfair Display', serif",
                  fontSize: '22px',
                  fontWeight: 400,
                  fontStyle: 'italic',
                  color: C.ink,
                  marginBottom: '8px',
                  lineHeight: 1.4,
                }}>
                  Do you want to work through this together?
                </p>
                <p style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '14px',
                  color: C.muted,
                  marginBottom: '28px',
                  lineHeight: 1.6,
                }}>
                  Only you can see your answer. There&apos;s no wrong response — Bond just needs to know where you are.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
                  <button
                    onClick={() => setCheckpointChoice('yes')}
                    style={{
                      padding: '16px 20px',
                      borderRadius: '6px',
                      border: `1.5px solid ${checkpointChoice === 'yes' ? C.accent : C.rule}`,
                      backgroundColor: checkpointChoice === 'yes' ? C.accentSoft : C.white,
                      color: C.ink,
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: '14px',
                      fontWeight: checkpointChoice === 'yes' ? 500 : 400,
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.15s ease',
                      lineHeight: 1.5,
                    }}
                  >
                    <span style={{ display: 'block', marginBottom: '2px' }}>Yes, I want to work through this</span>
                    <span style={{ fontSize: '12px', color: C.muted, fontWeight: 400 }}>I&apos;m ready to move forward together.</span>
                  </button>

                  <button
                    onClick={() => setCheckpointChoice('not_yet')}
                    style={{
                      padding: '16px 20px',
                      borderRadius: '6px',
                      border: `1.5px solid ${checkpointChoice === 'not_yet' ? C.blue : C.rule}`,
                      backgroundColor: checkpointChoice === 'not_yet' ? C.softBlue : C.white,
                      color: C.ink,
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: '14px',
                      fontWeight: checkpointChoice === 'not_yet' ? 500 : 400,
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.15s ease',
                      lineHeight: 1.5,
                    }}
                  >
                    <span style={{ display: 'block', marginBottom: '2px' }}>Not yet — I need more time</span>
                    <span style={{ fontSize: '12px', color: C.muted, fontWeight: 400 }}>This was useful. I&apos;m just not ready to take the next step right now.</span>
                  </button>
                </div>
              </>
            ) : (
              /* ── Accuracy question (original synthesis path) ── */
              <>
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

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '24px' }}>
                  {(['yes', 'partially', 'no'] as AccuracyChoice[]).map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setAccuracyChoice(opt)}
                      style={{
                        padding: '10px 22px',
                        borderRadius: '6px',
                        border: `1.5px solid ${accuracyChoice === opt ? C.accent : C.rule}`,
                        backgroundColor: accuracyChoice === opt ? C.accentSoft : C.white,
                        color: accuracyChoice === opt ? C.accent : C.ink,
                        fontFamily: "'DM Sans', sans-serif",
                        fontSize: '14px',
                        fontWeight: accuracyChoice === opt ? 500 : 400,
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
                      {accuracyChoice === 'partially'
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
              </>
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
              disabled={!canSubmit || submitting}
              style={{
                padding: '14px 28px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: C.accent,
                color: C.white,
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '15px',
                fontWeight: 500,
                cursor: canSubmit && !submitting ? 'pointer' : 'not-allowed',
                opacity: !canSubmit || submitting ? 0.45 : 1,
                transition: 'opacity 0.15s ease',
              }}
            >
              {submitting ? 'Saving…' : 'Share my answer'}
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
