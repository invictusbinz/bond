'use client'

// OrientationPersonB — the screen Person B reads before their intake begins.
//
// Two jobs:
//   1. Intention-setting: explain what Bond is, make the privacy promise,
//      tell Person B what happens next. Earn their trust before asking for anything.
//   2. Show Person A's summary: a neutral 2–3 sentence AI-generated description
//      of what Person A is feeling and needing — not their raw words.
//
// Person B reads this, then continues to their own intake.

import { useState, useEffect } from 'react'

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
  // Called when Person B taps "I'm ready" — passes the summary text along
  // so the intake API can use it as background context.
  onReady: (partnerSummary: string) => void
}

export default function OrientationPersonB({ onReady }: Props) {
  const [summary, setSummary] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchSummary() {
      try {
        const res = await fetch('/api/summarize-person-a')
        if (!res.ok) throw new Error('Fetch failed')
        const data = await res.json()
        setSummary(data.summary)
      } catch {
        // Fallback — the API itself already returns a safe fallback,
        // but guard here too just in case fetch fails entirely
        setSummary(
          "They reached out to share something that's been weighing on them about your relationship. I heard their side privately — the fuller picture will come together once I hear from you too."
        )
      } finally {
        setLoading(false)
      }
    }
    fetchSummary()
  }, [])

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
          padding: '18px 24px',
          borderBottom: `1px solid ${C.rule}`,
          backgroundColor: C.white,
        }}
      >
        <div
          style={{
            maxWidth: '560px',
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
            Before You Begin
          </span>
        </div>
      </div>

      {/* ── Body ── */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '48px 24px 60px',
        }}
      >
        <div style={{ maxWidth: '520px', margin: '0 auto' }}>

          {/* Title */}
          <h1
            style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: '28px',
              fontWeight: 400,
              color: C.ink,
              lineHeight: 1.3,
              marginBottom: '32px',
            }}
          >
            Before you share anything,<br />
            a few things to know.
          </h1>

          {/* ── Intention-setting paragraphs ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '36px' }}>

            <IntentionBlock
              label="What this is"
              text="Someone who knows you reached out through Bond because they wanted to communicate — about something between you two — without it becoming an argument. Bond isn't a mediator or a therapist. It's a space for both sides to be heard, privately, before anything is shared."
            />

            <IntentionBlock
              label="The privacy promise"
              text="I heard their side. I won't show it to you — and I won't show yours to them. What you write here is for me only. It won't go anywhere until I've heard from both of you."
            />

            <IntentionBlock
              label="What happens next"
              text="Once I've heard from both of you, I'll write a synthesis — a shared view of what's happening, what each of you seems to need, and where there might be common ground. You'll both see it at the same time. Neither side wins. Neither side loses."
            />

          </div>

          {/* ── Divider ── */}
          <div
            style={{
              height: '1px',
              backgroundColor: C.rule,
              marginBottom: '36px',
            }}
          />

          {/* ── Person A's summary ── */}
          <div>
            <p
              style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: '10px',
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: C.dimmed,
                marginBottom: '16px',
              }}
            >
              Here's what I heard from them
            </p>

            <div
              style={{
                backgroundColor: C.summaryBg,
                border: `1px solid ${C.rule}`,
                borderRadius: '8px',
                padding: '20px 22px',
                marginBottom: '12px',
                minHeight: '72px',
                display: 'flex',
                alignItems: loading ? 'center' : 'flex-start',
              }}
            >
              {loading ? (
                /* Pulse animation while summary generates */
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
                    fontSize: '16px',
                    fontWeight: 400,
                    color: C.ink,
                    lineHeight: 1.7,
                    margin: 0,
                    fontStyle: 'italic',
                  }}
                >
                  {summary}
                </p>
              )}
            </div>

            <p
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '12px',
                color: C.dimmed,
                lineHeight: 1.6,
                marginBottom: '40px',
              }}
            >
              I haven't told them you've seen this.
            </p>
          </div>

          {/* ── Continue button ── */}
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
            }}
            onMouseEnter={(e) => {
              if (!loading) e.currentTarget.style.backgroundColor = C.accentHover
            }}
            onMouseLeave={(e) => {
              if (!loading) e.currentTarget.style.backgroundColor = C.accent
            }}
          >
            I'm ready to share my side
          </button>

        </div>
      </div>
    </div>
  )
}

// ─── Sub-component: one intention block ──────────────────────────────────────

function IntentionBlock({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p
        style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: '10px',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: C.accent,
          marginBottom: '8px',
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '15px',
          color: '#3a3530',
          lineHeight: 1.75,
          margin: 0,
        }}
      >
        {text}
      </p>
    </div>
  )
}
