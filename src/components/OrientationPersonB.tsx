'use client'

// OrientationPersonB — summary-only screen before Person B's intake.
//
// The Bond context and privacy statement were already shown on the AvailabilityCheckIn
// landing screen. This screen shows only:
//   1. Person A's neutral AI-generated summary (why they reached out)
//   2. "I'm ready to share my side" button
//   3. Escape hatch — "Right now's not a great time" — returns to not-ready flow

import { useState, useEffect } from 'react'
import { useIsMobile } from '@/lib/useIsMobile'

const C = {
  ink: '#1a1714',
  paper: '#faf8f4',
  white: '#ffffff',
  accent: '#c4622d',
  accentHover: '#a0481f',
  rule: '#e0d8cc',
  muted: '#6b6560',
  dimmed: '#9a9390',
  summaryBg: '#f3ede4',
}

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital@0;1&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400&display=swap');`

type Props = {
  sessionId?: string
  onReady: (partnerSummary: string) => void
  onNotReady?: () => void    // escape hatch — "Right now's not a great time"
}

export default function OrientationPersonB({ sessionId, onReady, onNotReady }: Props) {
  const [summary, setSummary] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const m = useIsMobile()

  useEffect(() => {
    async function fetchSummary() {
      try {
        const url = sessionId
          ? `/api/summarize-person-a?sessionId=${sessionId}`
          : '/api/summarize-person-a'
        const res = await fetch(url)
        if (!res.ok) throw new Error('Fetch failed')
        const data = await res.json()
        setSummary(data.summary)
      } catch {
        setSummary(
          "They reached out to share something that\u2019s been weighing on them about your relationship. I heard their side privately \u2014 the fuller picture will come together once I hear from you too."
        )
      } finally {
        setLoading(false)
      }
    }
    fetchSummary()
  }, [sessionId])

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
      `}</style>

      {/* ── Header ── */}
      <div
        style={{
          padding: m ? '12px 16px' : '18px 24px',
          borderBottom: `1px solid ${C.rule}`,
          backgroundColor: C.white,
        }}
      >
        <div
          style={{
            maxWidth: '520px',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span
            style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: '18px',
              fontWeight: 400,
              color: C.ink,
            }}
          >
            Bond
          </span>
          <span
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: '10px',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: C.accent,
            }}
          >
            Your side
          </span>
        </div>
      </div>

      {/* ── Body ── */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: m ? '32px 16px 48px' : '56px 24px 64px',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
        }}
      >
        <div style={{ width: '100%', maxWidth: '520px' }}>

          {/* Summary label */}
          <p
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: '10px',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: C.dimmed,
              marginBottom: '6px',
            }}
          >
            Why they reached out
          </p>
          <p
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '12px',
              color: C.dimmed,
              lineHeight: 1.6,
              marginBottom: '16px',
            }}
          >
            Bond&apos;s interpretation — not their words.
          </p>

          {/* Summary card */}
          <div
            style={{
              backgroundColor: C.summaryBg,
              border: `1px solid ${C.rule}`,
              borderRadius: '10px',
              padding: m ? '20px' : '24px 28px',
              marginBottom: '40px',
              minHeight: '80px',
              display: 'flex',
              alignItems: loading ? 'center' : 'flex-start',
            }}
          >
            {loading ? (
              <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    style={{
                      width: '7px',
                      height: '7px',
                      borderRadius: '50%',
                      backgroundColor: C.accent,
                      opacity: 0.4,
                      animation: `pulse 1.4s ease-in-out ${i * 0.16}s infinite`,
                    }}
                  />
                ))}
                <style>{`
                  @keyframes pulse {
                    0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
                    40%           { opacity: 0.7; transform: scale(1.1); }
                  }
                `}</style>
              </div>
            ) : (
              <p
                style={{
                  fontFamily: "'Playfair Display', serif",
                  fontSize: m ? '15px' : '17px',
                  fontWeight: 400,
                  color: C.ink,
                  lineHeight: 1.75,
                  margin: 0,
                  fontStyle: 'italic',
                }}
              >
                {summary}
              </p>
            )}
          </div>

          {/* Continue button */}
          <button
            onClick={() => onReady(summary ?? '')}
            disabled={loading}
            style={{
              width: '100%',
              padding: '15px 24px',
              borderRadius: '8px',
              backgroundColor: loading ? C.rule : C.accent,
              color: loading ? C.dimmed : C.white,
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '15px',
              fontWeight: 500,
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.15s',
              letterSpacing: '0.01em',
              marginBottom: '20px',
            }}
            onMouseEnter={(e) => {
              if (!loading) e.currentTarget.style.backgroundColor = C.accentHover
            }}
            onMouseLeave={(e) => {
              if (!loading) e.currentTarget.style.backgroundColor = C.accent
            }}
          >
            I&apos;m ready to share my side
          </button>

          {/* Escape hatch */}
          {onNotReady && (
            <div style={{ textAlign: 'center' }}>
              <button
                onClick={onNotReady}
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
                Right now&apos;s not a great time
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
