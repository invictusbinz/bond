'use client'

// WaitingScreen — covers every "hold on" moment in the session.
//
// Variants:
//   awaiting_b           — Person A waiting for B to join (static, shows invite link)
//   b_active             — Person A waiting while B is doing their intake (static)
//   synthesis_generating — Both waiting for Bond to read everything (auto-updates)
//   synthesis_revising   — Both waiting for Bond to revise after feedback (auto-updates)
//   partner_synthesis    — Submitted synthesis response, waiting for partner (auto-updates)
//   partner_checkpoint   — Submitted checkpoint response, waiting for partner (auto-updates)
//   partner_resolution   — Submitted resolution, waiting for partner (auto-updates)
//   closing_generating   — Both waiting for Bond to write closing reflection (auto-updates)
//   not_ready            — Person B came but isn't ready yet (static)
//
// For static variants, the person can close the tab and return later.
// For auto-updating variants, the session page handles the polling
// and will re-render the right screen when status changes.

import { useState } from 'react'

export type WaitingVariant =
  | 'awaiting_b'
  | 'b_active'
  | 'synthesis_generating'
  | 'synthesis_revising'
  | 'partner_synthesis'
  | 'partner_checkpoint'
  | 'partner_resolution'
  | 'closing_generating'
  | 'not_ready'

type Props = {
  variant: WaitingVariant
  inviteUrl?: string   // shown for awaiting_b variant
  joinCode?: string    // shown for awaiting_b variant
}

const C = {
  ink: '#1a1714',
  paper: '#faf8f4',
  white: '#ffffff',
  accent: '#c4622d',
  rule: '#e0d8cc',
  muted: '#6b6560',
  dimmed: '#8a8480',
  greenSoft: '#d4e8dc',
  green: '#3d6b4f',
  blueSoft: '#dce8f0',
  blue: '#3a5f7d',
}

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital@0;1&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400&display=swap');`

type ScreenCopy = {
  headline: string
  body: string
  note?: string      // small note at the bottom (e.g. "you can close this tab")
  color: { soft: string; dot: string }
}

const COPY: Record<WaitingVariant, ScreenCopy> = {
  awaiting_b: {
    headline: 'Your side is in.',
    body: 'Now send them the link. When they\'re ready to share their side, Bond will bring it all together.',
    note: 'You can close this tab and come back anytime.',
    color: { soft: C.greenSoft, dot: C.green },
  },
  b_active: {
    headline: 'They\'re sharing their side.',
    body: 'The other person is in their session right now. You\'ll hear from Bond when it\'s time.',
    note: 'You can close this tab and come back anytime.',
    color: { soft: C.blueSoft, dot: C.blue },
  },
  synthesis_generating: {
    headline: 'Bond is reading what you both shared.',
    body: 'This takes a moment. Breathe.',
    color: { soft: C.greenSoft, dot: C.green },
  },
  synthesis_revising: {
    headline: 'Bond is taking another look.',
    body: 'You gave it important feedback. It\'s adjusting.',
    color: { soft: C.blueSoft, dot: C.blue },
  },
  partner_synthesis: {
    headline: 'Your thoughts are in.',
    body: 'Waiting for the other person to read and share theirs.',
    color: { soft: C.greenSoft, dot: C.green },
  },
  partner_checkpoint: {
    headline: 'You\'ve answered.',
    body: 'Waiting for the other person to decide.',
    color: { soft: C.blueSoft, dot: C.blue },
  },
  partner_resolution: {
    headline: 'Your reflection is in.',
    body: 'Waiting for theirs.',
    color: { soft: C.greenSoft, dot: C.green },
  },
  closing_generating: {
    headline: 'Bond is writing your closing reflection.',
    body: 'Almost there.',
    color: { soft: C.greenSoft, dot: C.green },
  },
  not_ready: {
    headline: 'Come back when you\'re ready.',
    body: 'This session will be here. Take the time you need.',
    note: 'The other person has already shared their side and is waiting.',
    color: { soft: C.blueSoft, dot: C.blue },
  },
}

export default function WaitingScreen({ variant, inviteUrl, joinCode }: Props) {
  const copy = COPY[variant]
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    if (!inviteUrl) return
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: C.paper,
        padding: '24px',
      }}
    >
      <style>{`
        ${FONTS}
        * { box-sizing: border-box; }
        body { font-family: 'DM Sans', sans-serif; margin: 0; }
        @keyframes breathe {
          0%, 100% { opacity: 0.4; transform: scale(0.95); }
          50%       { opacity: 1;   transform: scale(1.05); }
        }
        button:hover { opacity: 0.85; }
      `}</style>

      <div style={{ width: '100%', maxWidth: '480px', textAlign: 'center' }}>

        {/* Breathing dot */}
        <div
          style={{
            width: '52px',
            height: '52px',
            borderRadius: '50%',
            backgroundColor: copy.color.soft,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 32px',
            animation: 'breathe 3s ease-in-out infinite',
          }}
        >
          <div
            style={{
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              backgroundColor: copy.color.dot,
              opacity: 0.7,
            }}
          />
        </div>

        {/* Headline */}
        <h2
          style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: '26px',
            fontWeight: 400,
            color: C.ink,
            marginBottom: '14px',
            lineHeight: 1.35,
          }}
        >
          {copy.headline}
        </h2>

        {/* Body */}
        <p
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '15px',
            color: C.muted,
            lineHeight: 1.75,
            marginBottom: copy.note || inviteUrl ? '32px' : '0',
          }}
        >
          {copy.body}
        </p>

        {/* Invite link block — only for awaiting_b */}
        {variant === 'awaiting_b' && inviteUrl && (
          <div
            style={{
              backgroundColor: C.white,
              border: `1px solid ${C.rule}`,
              borderRadius: '8px',
              padding: '20px 24px',
              marginBottom: '20px',
              textAlign: 'left',
            }}
          >
            <p style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: '10px',
              letterSpacing: '0.1em',
              color: C.dimmed,
              textTransform: 'uppercase',
              marginBottom: '10px',
            }}>
              Invite link
            </p>
            <p
              style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: '12px',
                color: C.ink,
                wordBreak: 'break-all',
                lineHeight: 1.5,
                marginBottom: '14px',
              }}
            >
              {inviteUrl}
            </p>

            {joinCode && (
              <p style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '13px',
                color: C.muted,
                marginBottom: '14px',
              }}>
                Or share the join code: <span style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: '15px',
                  color: C.ink,
                  letterSpacing: '0.1em',
                }}>{joinCode}</span>
              </p>
            )}

            <button
              onClick={handleCopy}
              style={{
                padding: '10px 20px',
                borderRadius: '6px',
                border: `1.5px solid ${C.rule}`,
                backgroundColor: copied ? C.greenSoft : C.white,
                color: copied ? C.green : C.ink,
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {copied ? 'Copied ✓' : 'Copy invite link'}
            </button>
          </div>
        )}

        {/* Footer note */}
        {copy.note && (
          <p
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '13px',
              color: C.dimmed,
              lineHeight: 1.6,
            }}
          >
            {copy.note}
          </p>
        )}

      </div>
    </div>
  )
}
