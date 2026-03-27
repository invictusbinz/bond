'use client'

// SessionStart — the homepage experience.
//
// Person A lands here, picks a mode, creates a session in Supabase,
// and is redirected to /session/[id] where their intake begins.
//
// If someone arrives with no session context, this is what they see.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveToken } from '@/lib/session'

type Mode = 'heard' | 'figure_it_out'

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
  disabled: '#a09890',
}

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital@0;1&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400&display=swap');`

export default function SessionStart() {
  const router = useRouter()
  const [selectedMode, setSelectedMode] = useState<Mode | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleStart = async () => {
    if (!selectedMode || creating) return
    setCreating(true)
    setError(null)

    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: selectedMode }),
      })

      if (!res.ok) throw new Error('Could not create session')

      const data = await res.json()

      // Save Person A's token to localStorage before navigating
      saveToken(data.sessionId, data.personAToken)

      // Navigate to the session page — IntakePersonA will be shown automatically
      router.push(`/session/${data.sessionId}`)
    } catch (err) {
      console.error('Session creation error:', err)
      setError('Something went wrong creating the session. Please try again.')
      setCreating(false)
    }
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
      <style>{`${FONTS} body { font-family: 'DM Sans', sans-serif; }`}</style>

      <div style={{ width: '100%', maxWidth: '440px' }}>

        {/* Brand mark */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1
            style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: '32px',
              fontWeight: 400,
              color: C.ink,
              marginBottom: '12px',
            }}
          >
            Bond
          </h1>
          <p
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '15px',
              color: C.muted,
              lineHeight: 1.7,
              maxWidth: '360px',
              margin: '0 auto',
            }}
          >
            Each of you shares your side privately. Bond listens, then reflects both perspectives back to you at the same time — so you can understand each other before you try to solve anything.
          </p>
        </div>

        {/* Session card */}
        <div
          style={{
            backgroundColor: C.white,
            border: `1px solid ${C.rule}`,
            borderRadius: '10px',
            padding: '36px',
          }}
        >
          <div
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: '10px',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: C.accent,
              marginBottom: '16px',
            }}
          >
            Start a Session
          </div>

          <h2
            style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: '22px',
              fontWeight: 400,
              color: C.ink,
              marginBottom: '8px',
              lineHeight: 1.35,
            }}
          >
            What are you coming here to work through?
          </h2>
          <p
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '13px',
              color: C.muted,
              lineHeight: 1.7,
              marginBottom: '24px',
            }}
          >
            Your partner won&apos;t see which you chose — it just shapes how Bond listens to you.
          </p>

          {/* Mode options */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
            {(['heard', 'figure_it_out'] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setSelectedMode(m)}
                style={{
                  textAlign: 'left',
                  padding: '15px 16px',
                  borderRadius: '8px',
                  border: selectedMode === m ? `2px solid ${C.accent}` : `1px solid ${C.rule}`,
                  backgroundColor: selectedMode === m ? C.accentSoft : C.white,
                  cursor: 'pointer',
                  width: '100%',
                  transition: 'border-color 0.15s, background-color 0.15s',
                }}
              >
                <div
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: '14px',
                    fontWeight: 500,
                    color: C.ink,
                    marginBottom: '3px',
                  }}
                >
                  {m === 'heard' ? 'I need to feel heard' : 'We need to work something out'}
                </div>
                <div
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: '13px',
                    color: C.muted,
                    lineHeight: 1.5,
                  }}
                >
                  {m === 'heard'
                    ? 'Something happened and I want my experience to be understood.'
                    : "There's a real disagreement or decision we need to get through together."}
                </div>
              </button>
            ))}
          </div>

          {error && (
            <p
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '13px',
                color: C.accent,
                marginBottom: '16px',
                lineHeight: 1.6,
              }}
            >
              {error}
            </p>
          )}

          <button
            onClick={handleStart}
            disabled={!selectedMode || creating}
            style={{
              width: '100%',
              padding: '13px 16px',
              borderRadius: '8px',
              backgroundColor: selectedMode && !creating ? C.accent : C.rule,
              color: selectedMode && !creating ? C.white : C.disabled,
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '14px',
              fontWeight: 500,
              border: 'none',
              cursor: selectedMode && !creating ? 'pointer' : 'not-allowed',
              transition: 'background-color 0.15s',
            }}
            onMouseEnter={(e) => {
              if (selectedMode && !creating) e.currentTarget.style.backgroundColor = C.accentHover
            }}
            onMouseLeave={(e) => {
              if (selectedMode && !creating) e.currentTarget.style.backgroundColor = C.accent
            }}
          >
            {creating ? 'Starting…' : 'Begin Session'}
          </button>
        </div>

        {/* Joining hint — for Person B who was sent the wrong link */}
        <p
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '12px',
            color: C.dimmed,
            textAlign: 'center',
            marginTop: '20px',
            lineHeight: 1.6,
          }}
        >
          Joining a session? Use the invite link your partner sent you.
        </p>

      </div>
    </div>
  )
}
