'use client'

// ResolutionView — shown to each person privately when status = 'resolution_ready'.
//
// Both people said yes at the checkpoint — they want to work through this together.
// Bond now asks each person privately: "What's one thing you're willing to try?"
//
// The responses are saved privately (session_responses) and are not shown to the partner.
// After both respond, Bond acknowledges the step and closes the session warmly.

import { useState } from 'react'
import { useIsMobile } from '@/lib/useIsMobile'

type Props = {
  sessionId: string
  token: string
  myRole: 'a' | 'b'
  onResponded: () => void
}

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
  softAmber: '#f5ede0',
}

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital@0;1&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400&display=swap');`

export default function ResolutionView({ sessionId, token, myRole, onResponded }: Props) {
  const m = useIsMobile()
  const [commitment, setCommitment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!commitment.trim() || submitting) return
    setSubmitting(true)
    setError(null)

    try {
      const newStatus = myRole === 'a' ? 'a_responded_resolution' : 'b_responded_resolution'

      const res = await fetch('/api/session-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          token,
          person: myRole,
          step: 'resolution',
          response: { commitment: commitment.trim() },
          newStatus,
        }),
      })

      if (!res.ok) throw new Error('Could not save your response.')

      setSubmitted(true)
      setTimeout(() => onResponded(), 800)
    } catch (err) {
      console.error(err)
      setError('Bond had trouble saving your response. Give it a moment and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: C.paper,
        padding: m ? '24px 16px 60px' : '48px 24px 80px',
      }}
    >
      <style>{`
        ${FONTS}
        * { box-sizing: border-box; }
        body { font-family: 'DM Sans', sans-serif; margin: 0; }
        textarea:focus { outline: none; }
        @media (max-width: 640px) { .cmd-hint { display: none; } }
      `}</style>

      <div style={{ maxWidth: '540px', margin: '0 auto' }}>

        {/* Eyebrow */}
        <p style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: '11px',
          letterSpacing: '0.12em',
          color: C.dimmed,
          textTransform: 'uppercase',
          marginBottom: '20px',
        }}>
          Moving forward
        </p>

        {/* Heading */}
        <h1 style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: m ? '26px' : '30px',
          fontWeight: 400,
          color: C.ink,
          lineHeight: 1.3,
          marginBottom: '16px',
        }}>
          You both want to work through this.
        </h1>

        {/* Sub-text */}
        <p style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '16px',
          color: C.muted,
          lineHeight: 1.75,
          marginBottom: m ? '28px' : '48px',
          maxWidth: '460px',
        }}>
          That matters. Bond won't share what you write here with your partner — this is just for you to get clear on what you're bringing to the next step.
        </p>

        {/* The question */}
        {!submitted && (
          <div
            style={{
              padding: m ? '20px' : '32px',
              backgroundColor: C.softAmber,
              borderRadius: '8px',
            }}
          >
            <p style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: '22px',
              fontWeight: 400,
              fontStyle: 'italic',
              color: C.ink,
              marginBottom: '8px',
              lineHeight: 1.45,
            }}>
              Knowing what you know now — what&apos;s one thing you&apos;re willing to try, or commit to, in how you show up to this?
            </p>
            <p style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '14px',
              color: C.muted,
              lineHeight: 1.6,
              marginBottom: '24px',
            }}>
              It doesn&apos;t need to be big. Honest is more important than impressive. Your partner won&apos;t see this.
            </p>

            <textarea
              value={commitment}
              onChange={e => setCommitment(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Write whatever comes to mind…"
              rows={5}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '6px',
                border: `1.5px solid ${C.rule}`,
                backgroundColor: C.white,
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '15px',
                color: C.ink,
                lineHeight: 1.65,
                resize: 'vertical',
                marginBottom: '20px',
              }}
            />

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

            <div style={{ display: 'flex', alignItems: m ? 'stretch' : 'center', flexDirection: m ? 'column' : 'row', justifyContent: 'space-between', gap: m ? '12px' : '0' }}>
              <span className="cmd-hint" style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: '10px',
                color: '#c0b8b0',
                letterSpacing: '0.1em',
              }}>
                ⌘ + Enter to send
              </span>
              <button
                onClick={handleSubmit}
                disabled={!commitment.trim() || submitting}
                style={{
                  width: m ? '100%' : 'auto',
                  padding: '13px 28px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: commitment.trim() && !submitting ? C.accent : C.rule,
                  color: commitment.trim() && !submitting ? C.white : '#a09890',
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: commitment.trim() && !submitting ? 'pointer' : 'not-allowed',
                  transition: 'background-color 0.15s',
                }}
                onMouseEnter={e => {
                  if (commitment.trim() && !submitting)
                    e.currentTarget.style.backgroundColor = C.accentHover
                }}
                onMouseLeave={e => {
                  if (commitment.trim() && !submitting)
                    e.currentTarget.style.backgroundColor = C.accent
                }}
              >
                {submitting ? 'Saving…' : 'Share with Bond'}
              </button>
            </div>
          </div>
        )}

        {/* Submitted state */}
        {submitted && (
          <div style={{
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
              Bond has what it needs. Waiting for them.
            </p>
          </div>
        )}

      </div>
    </div>
  )
}
