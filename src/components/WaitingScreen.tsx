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
import { useIsMobile } from '@/lib/useIsMobile'

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
  inviteUrl?: string       // shown for awaiting_b variant
  joinCode?: string        // shown for awaiting_b variant
  onReadyNow?: () => void  // shown for not_ready variant — lets B restart the flow
  partnerName?: string     // when known, personalises copy ("Waiting for Yash" vs "Waiting for them")
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


type ScreenCopy = {
  headline: string
  body: string
  note?: string      // small note at the bottom (e.g. "you can close this tab")
  color: { soft: string; dot: string }
}

const COPY: Record<WaitingVariant, ScreenCopy> = {
  awaiting_b: {
    headline: 'Your side is in.',
    body: 'Send them the link when you\'re ready. When they share their side, Bond will bring it all together.',
    note: 'You can close this tab and come back anytime.',
    color: { soft: C.greenSoft, dot: C.green },
  },
  b_active: {
    headline: 'They\'re sharing their side.',
    body: 'Bond\'s with them now. You\'ll know when it\'s time.',
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
    body: 'Taking your feedback into account.',
    color: { soft: C.blueSoft, dot: C.blue },
  },
  partner_synthesis: {
    headline: 'Your thoughts are in.',
    body: 'Waiting for them to read their side.',
    color: { soft: C.greenSoft, dot: C.green },
  },
  partner_checkpoint: {
    headline: 'You\'ve answered.',
    body: 'Waiting for their answer.',
    color: { soft: C.blueSoft, dot: C.blue },
  },
  partner_resolution: {
    headline: 'Your reflection is in.',
    body: 'Waiting for their reflection.',
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
    note: 'They\u2019ve shared their side. No pressure \u2014 take what you need.',
    color: { soft: C.blueSoft, dot: C.blue },
  },
}

export default function WaitingScreen({ variant, inviteUrl, joinCode, onReadyNow, partnerName }: Props) {
  const base = COPY[variant]
  const m = useIsMobile()

  // Personalise copy with partner's name where relevant.
  // Falls back to the static strings when no name is known.
  const copy: ScreenCopy = {
    ...base,
    headline:
      variant === 'b_active' && partnerName
        ? `${partnerName} is sharing their side.`
        : base.headline,
    body:
      variant === 'partner_synthesis' && partnerName
        ? `Waiting for ${partnerName} to read their side.`
        : variant === 'partner_checkpoint' && partnerName
        ? `Waiting for ${partnerName}'s answer.`
        : variant === 'partner_resolution' && partnerName
        ? `Waiting for ${partnerName}'s reflection.`
        : base.body,
    note:
      variant === 'not_ready' && partnerName
        ? `${partnerName} has shared their side. No pressure — take what you need.`
        : base.note,
  }

  const [copied, setCopied] = useState(false)

  function handleCopy() {
    if (!inviteUrl) return
    // Try modern clipboard API first, fall back to execCommand for older browsers
    if (navigator.clipboard) {
      navigator.clipboard.writeText(inviteUrl).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2500)
      }).catch(() => fallbackCopy(inviteUrl))
    } else {
      fallbackCopy(inviteUrl)
    }
  }

  function fallbackCopy(text: string) {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    try { document.execCommand('copy') } catch {}
    document.body.removeChild(textarea)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: C.paper,
        padding: m ? '16px' : '24px',
      }}
    >
      <style>{`
                * { box-sizing: border-box; }
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
            fontFamily: "'DM Sans', sans-serif",
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
              padding: m ? '16px' : '20px 24px',
              marginBottom: '20px',
              textAlign: 'left',
            }}
          >
            <p style={{
              fontFamily: "'DM Sans', sans-serif",
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
                fontFamily: "'DM Sans', sans-serif",
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
                  fontFamily: "'DM Sans', sans-serif",
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
              marginBottom: onReadyNow ? '24px' : '0',
            }}
          >
            {copy.note}
          </p>
        )}

        {/* "I'm ready now" — only for not_ready variant */}
        {variant === 'not_ready' && onReadyNow && (
          <button
            onClick={onReadyNow}
            style={{
              padding: '11px 28px',
              borderRadius: '8px',
              border: `1.5px solid ${C.rule}`,
              backgroundColor: C.white,
              color: C.ink,
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = C.accent
              e.currentTarget.style.color = C.accent
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = C.rule
              e.currentTarget.style.color = C.ink
            }}
          >
            I'm ready now
          </button>
        )}

      </div>
    </div>
  )
}
