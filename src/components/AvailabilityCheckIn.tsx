'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

type Phase = 'checking' | 'ready' | 'not_ready'

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

export default function AvailabilityCheckIn() {
  const [phase, setPhase] = useState<Phase>('checking')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (available: boolean) => {
    setLoading(true)
    setError(null)
    try {
      const { error: saveError } = await supabase.from('availability_check_ins').insert({
        available,
        checked_in_at: new Date().toISOString(),
      })
      if (saveError) console.log('Save error (non-blocking):', saveError)
      setPhase(available ? 'ready' : 'not_ready')
    } catch (err) {
      console.error('Error:', err)
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ─── PHASE: READY ────────────────────────────────────────────────────────────
  if (phase === 'ready') {
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
        <style>{FONTS}</style>
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
              fontSize: '22px',
              color: C.green,
            }}
          >
            ✓
          </div>
          <h1
            style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: '28px',
              fontWeight: 400,
              color: C.ink,
              marginBottom: '12px',
              lineHeight: 1.3,
            }}
          >
            Good to have you here.
          </h1>
          <p style={{ color: '#4a4540', fontSize: '15px', lineHeight: 1.7 }}>
            Take a moment to settle in. Your session is ready when you are.
          </p>
        </div>
      </div>
    )
  }

  // ─── PHASE: NOT READY ────────────────────────────────────────────────────────
  if (phase === 'not_ready') {
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
              fontSize: '20px',
              color: C.dimmed,
            }}
          >
            —
          </div>
          <h1
            style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: '28px',
              fontWeight: 400,
              color: C.ink,
              marginBottom: '12px',
              lineHeight: 1.3,
            }}
          >
            No problem at all.
          </h1>
          <p style={{ color: '#4a4540', fontSize: '15px', lineHeight: 1.7 }}>
            Come back whenever you&apos;re ready. There&apos;s no rush.
          </p>
        </div>
      </div>
    )
  }

  // ─── PHASE: CHECK-IN ─────────────────────────────────────────────────────────
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
      <style>{`${FONTS} body { font-family: 'DM Sans', sans-serif; }`}</style>

      <div
        style={{
          width: '100%',
          maxWidth: '440px',
          backgroundColor: C.white,
          border: `1px solid ${C.rule}`,
          borderRadius: '8px',
          padding: '40px',
        }}
      >
        {/* Eyebrow */}
        <div
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: '10px',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: C.accent,
            marginBottom: '20px',
          }}
        >
          Availability Check-In
        </div>

        {/* Headline */}
        <h1
          style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: '28px',
            fontWeight: 400,
            color: C.ink,
            marginBottom: '12px',
            lineHeight: 1.3,
          }}
        >
          How are you showing up right now?
        </h1>

        <p
          style={{
            fontSize: '15px',
            color: '#4a4540',
            lineHeight: 1.7,
            marginBottom: '32px',
          }}
        >
          Before going further, I want to check in with you first. Are you in a
          place to engage with this conversation?
        </p>

        {/* Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button
            onClick={() => handleSubmit(true)}
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px 16px',
              borderRadius: '8px',
              backgroundColor: loading ? C.rule : C.accent,
              color: loading ? C.disabled : C.white,
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '14px',
              fontWeight: 500,
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
            onMouseEnter={(e) => {
              if (!loading) e.currentTarget.style.backgroundColor = C.accentHover
            }}
            onMouseLeave={(e) => {
              if (!loading) e.currentTarget.style.backgroundColor = C.accent
            }}
          >
            {loading ? 'Saving…' : "Yes, I'm ready"}
          </button>

          <button
            onClick={() => handleSubmit(false)}
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px 16px',
              borderRadius: '8px',
              backgroundColor: 'transparent',
              color: loading ? C.disabled : '#4a4540',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '14px',
              fontWeight: 500,
              border: `1px solid ${C.rule}`,
              cursor: loading ? 'not-allowed' : 'pointer',
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
                e.currentTarget.style.color = '#4a4540'
              }
            }}
          >
            {loading ? 'Saving…' : 'Not right now'}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              marginTop: '16px',
              padding: '12px 16px',
              backgroundColor: '#fdf5f0',
              border: `1px solid ${C.rule}`,
              borderRadius: '8px',
            }}
          >
            <p
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '13px',
                color: C.accent,
                margin: 0,
              }}
            >
              {error}
            </p>
          </div>
        )}

        {/* Footer note */}
        <p
          style={{
            fontSize: '12px',
            color: C.dimmed,
            lineHeight: 1.6,
            marginTop: '24px',
            paddingTop: '20px',
            borderTop: `1px solid ${C.rule}`,
          }}
        >
          There&apos;s no wrong answer here. If you&apos;re not in the right headspace,
          saying so is the right call.
        </p>
      </div>
    </div>
  )
}
