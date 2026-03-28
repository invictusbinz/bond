'use client'

// ClosingView — shown to both people when status = 'closing_ready'.
//
// Two beats:
//   1. The closing message — "You both showed up for this." — warm acknowledgement.
//   2. "See your private reflection" CTA — generates and reveals their personal debrief.
//      Debrief is per-person and private. Each person sees their own.

import { useState } from 'react'
import { useIsMobile } from '@/lib/useIsMobile'

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
}

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital@0;1&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400&display=swap');`

type Props = {
  sessionId: string
  token: string
}

type DebriefPhase = 'idle' | 'loading' | 'ready' | 'error'

export default function ClosingView({ sessionId, token }: Props) {
  const m = useIsMobile()
  const [debriefPhase, setDebriefPhase] = useState<DebriefPhase>('idle')
  const [debrief, setDebrief] = useState<string | null>(null)

  const handleRevealDebrief = async () => {
    if (debriefPhase === 'loading' || debriefPhase === 'ready') return
    setDebriefPhase('loading')

    try {
      const res = await fetch('/api/debrief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, token }),
      })

      if (!res.ok) throw new Error('Debrief generation failed')

      const data = await res.json()
      if (!data.debrief) throw new Error('Empty debrief')

      setDebrief(data.debrief)
      setDebriefPhase('ready')
    } catch (err) {
      console.error('Debrief fetch error:', err)
      setDebriefPhase('error')
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: C.paper,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <style>{`
        ${FONTS}
        body { font-family: 'DM Sans', sans-serif; }
        @keyframes dot-pulse {
          0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
          40%            { opacity: 1;   transform: scale(1.1); }
        }
      `}</style>

      {/* ── Header ── */}
      <div
        style={{
          padding: m ? '12px 16px' : '18px 24px',
          borderBottom: `1px solid ${C.rule}`,
          backgroundColor: C.white,
          flexShrink: 0,
        }}
      >
        <div style={{ maxWidth: '560px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: "'Playfair Display', serif", fontSize: '18px', fontWeight: 400, color: C.ink }}>
            Bond
          </span>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', color: C.accent }}>
            Session closed
          </span>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: m ? '28px 16px 48px' : '56px 24px 72px' }}>
        <div style={{ maxWidth: '520px', margin: '0 auto' }}>

          {/* ── Closing message ── */}
          <p
            style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: m ? '26px' : '30px',
              fontWeight: 400,
              color: C.ink,
              lineHeight: 1.3,
              marginBottom: '20px',
            }}
          >
            You both showed up for this.
          </p>

          <p
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '16px',
              color: C.muted,
              lineHeight: 1.8,
              marginBottom: '56px',
              maxWidth: '460px',
            }}
          >
            Bond heard you both, held your perspectives with care, and you each took a step forward. Whatever comes next, you know a little more about where the other person is — and that&apos;s not nothing.
          </p>

          {/* ── Divider ── */}
          <div style={{ height: '1px', backgroundColor: C.rule, marginBottom: '48px' }} />

          {/* ── Debrief section ── */}

          {debriefPhase === 'idle' && (
            <div>
              <p
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: '10px',
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                  color: C.dimmed,
                  marginBottom: '12px',
                }}
              >
                Just for you
              </p>
              <p
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '15px',
                  color: C.muted,
                  lineHeight: 1.75,
                  marginBottom: '24px',
                  maxWidth: '420px',
                }}
              >
                Bond noticed some things about how you showed up in this conversation. Your private reflection is ready when you are.
              </p>
              <button
                onClick={handleRevealDebrief}
                style={{
                  padding: '12px 24px',
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
                See your private reflection
              </button>
            </div>
          )}

          {debriefPhase === 'loading' && (
            <div>
              <p
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: '10px',
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                  color: C.dimmed,
                  marginBottom: '20px',
                }}
              >
                Just for you
              </p>
              <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    style={{
                      width: '7px',
                      height: '7px',
                      borderRadius: '50%',
                      backgroundColor: C.accent,
                      animationName: 'dot-pulse',
                      animationDuration: '1.4s',
                      animationTimingFunction: 'ease-in-out',
                      animationIterationCount: 'infinite',
                      animationDelay: `${i * 0.16}s`,
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {debriefPhase === 'ready' && debrief && (
            <div>
              <p
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: '10px',
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                  color: C.accent,
                  marginBottom: '28px',
                }}
              >
                Just for you
              </p>

              {/* Render debrief paragraphs */}
              {debrief.split('\n\n').filter(p => p.trim()).map((para, i) => (
                <p
                  key={i}
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: '16px',
                    color: C.ink,
                    lineHeight: 1.85,
                    marginBottom: '24px',
                  }}
                >
                  {para.trim()}
                </p>
              ))}
            </div>
          )}

          {debriefPhase === 'error' && (
            <div>
              <p
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '14px',
                  color: C.muted,
                  lineHeight: 1.7,
                  marginBottom: '16px',
                }}
              >
                Bond had trouble loading your reflection. Use the button below to try again.
              </p>
              <button
                onClick={() => { setDebriefPhase('idle') }}
                style={{
                  background: 'none',
                  border: 'none',
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '13px',
                  color: C.accent,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  textUnderlineOffset: '2px',
                  padding: 0,
                }}
              >
                Try again
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
