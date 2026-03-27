'use client'

// SessionStart — the homepage experience.
//
// Person A lands here, picks a mode, creates a session in Supabase,
// and is redirected to /session/[id] where their intake begins.
//
// Person B can also enter a 6-character join code here to join a session
// without needing the full invite URL. The code lookup calls /api/join
// which returns the session ID and Person B's token, then redirects to
// /session/[id]?join=[token] — the same flow as clicking the invite link.

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

  // ── Person A: start a session ──────────────────────────────────────────────
  const [selectedMode, setSelectedMode] = useState<Mode | null>(null)
  const [creating, setCreating] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)

  // ── Person B: join via code ────────────────────────────────────────────────
  const [joinCode, setJoinCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)

  const handleStart = async () => {
    if (!selectedMode || creating) return
    setCreating(true)
    setStartError(null)

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
      setStartError('Bond had trouble starting the session. Give it a moment and try again.')
      setCreating(false)
    }
  }

  const handleJoin = async () => {
    const code = joinCode.trim().toUpperCase()
    if (!code || joining) return
    setJoining(true)
    setJoinError(null)

    try {
      const res = await fetch(`/api/join?code=${encodeURIComponent(code)}`)
      const data = await res.json()

      if (!res.ok) {
        setJoinError(data.error || 'Bond couldn\u2019t find that session. Double-check the code and try again.')
        setJoining(false)
        return
      }

      // Redirect to session page — it will save the token from the URL param
      // and route B into the availability check-in flow automatically
      router.push(`/session/${data.sessionId}?join=${data.personBToken}`)
    } catch (err) {
      console.error('Join code error:', err)
      setJoinError('Bond had trouble looking up that code. Give it a moment and try again.')
      setJoining(false)
    }
  }

  const handleJoinKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleJoin()
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

        {/* ── Start a Session card ── */}
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

          {startError && (
            <p
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '13px',
                color: C.accent,
                marginBottom: '16px',
                lineHeight: 1.6,
              }}
            >
              {startError}
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

        {/* ── Join a Session card ── */}
        <div
          style={{
            backgroundColor: C.white,
            border: `1px solid ${C.rule}`,
            borderRadius: '10px',
            padding: '28px 36px',
            marginTop: '16px',
          }}
        >
          <div
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: '10px',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: C.muted,
              marginBottom: '14px',
            }}
          >
            Join a Session
          </div>

          <p
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '13px',
              color: C.muted,
              lineHeight: 1.7,
              marginBottom: '16px',
            }}
          >
            Your partner started a session and gave you a 6-character code.
          </p>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <input
                type="text"
                value={joinCode}
                onChange={(e) => {
                  // Auto-uppercase, max 6 characters, letters and digits only
                  const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
                  setJoinCode(val)
                  if (joinError) setJoinError(null)
                }}
                onKeyDown={handleJoinKeyDown}
                placeholder="e.g. ABX4K2"
                maxLength={6}
                style={{
                  width: '100%',
                  padding: '11px 14px',
                  borderRadius: '8px',
                  border: joinError ? `1.5px solid ${C.accent}` : `1px solid ${C.rule}`,
                  fontFamily: "'DM Mono', monospace",
                  fontSize: '15px',
                  letterSpacing: '0.12em',
                  color: C.ink,
                  backgroundColor: C.paper,
                  outline: 'none',
                  transition: 'border-color 0.15s',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = C.accent
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = joinError ? C.accent : C.rule
                }}
              />
            </div>

            <button
              onClick={handleJoin}
              disabled={joinCode.trim().length < 6 || joining}
              style={{
                padding: '11px 18px',
                borderRadius: '8px',
                backgroundColor: joinCode.trim().length === 6 && !joining ? C.ink : C.rule,
                color: joinCode.trim().length === 6 && !joining ? C.white : C.disabled,
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '14px',
                fontWeight: 500,
                border: 'none',
                cursor: joinCode.trim().length === 6 && !joining ? 'pointer' : 'not-allowed',
                whiteSpace: 'nowrap',
                transition: 'background-color 0.15s',
                flexShrink: 0,
              }}
            >
              {joining ? 'Joining…' : 'Join'}
            </button>
          </div>

          {joinError && (
            <p
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '13px',
                color: C.accent,
                marginTop: '10px',
                lineHeight: 1.6,
              }}
            >
              {joinError}
            </p>
          )}
        </div>

      </div>
    </div>
  )
}
