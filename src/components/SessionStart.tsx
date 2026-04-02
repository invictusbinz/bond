'use client'

// SessionStart — Person A's entry point.
//
// Three-phase typeform-style flow:
//   1. Name  — "Hi" + name input. Single field, full focus.
//   2. Partner — Bond context + partner name + optional relationship (inline).
//   3. Mode — Mode selection + "Begin Session" → creates session.
//
// Person B can also enter a 6-character join code here to join a session
// without needing the full invite URL.

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { saveToken } from '@/lib/session'
import { useIsMobile } from '@/lib/useIsMobile'

type Mode = 'heard' | 'figure_it_out'
type Phase = 'name' | 'partner' | 'mode'

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


const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 0',
  border: 'none',
  borderBottom: `1.5px solid #c8bfb4`,
  borderRadius: 0,
  backgroundColor: 'transparent',
  fontFamily: "'DM Sans', sans-serif",
  fontSize: '17px',
  color: '#1a1714',
  outline: 'none',
  boxSizing: 'border-box',
}

export default function SessionStart() {
  const router = useRouter()
  const m = useIsMobile()

  // ── Phase state ────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>('name')

  // ── Person A fields ────────────────────────────────────────────────────────
  const [personAName, setPersonAName] = useState('')
  const [partnerNickname, setPartnerNickname] = useState('')
  const [partnerRelationship, setPartnerRelationship] = useState('')
  const [selectedMode, setSelectedMode] = useState<Mode | null>(null)
  const [creating, setCreating] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)

  // ── Person B join code ─────────────────────────────────────────────────────
  const [joinCode, setJoinCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)

  // ── Input refs for focus management ───────────────────────────────────────
  const nameRef = useRef<HTMLInputElement>(null)
  const partnerRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (phase === 'name' && nameRef.current) nameRef.current.focus()
    if (phase === 'partner' && partnerRef.current) partnerRef.current.focus()
  }, [phase])

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleNameSubmit = () => {
    if (!personAName.trim()) return
    setPhase('partner')
  }

  const handlePartnerSubmit = () => {
    if (!partnerNickname.trim()) return
    setPhase('mode')
  }

  const handleStart = async () => {
    if (!selectedMode || creating) return
    setCreating(true)
    setStartError(null)

    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: selectedMode,
          person_a_name: personAName.trim() || null,
          partner_nickname: partnerNickname.trim() || null,
          partner_relationship: partnerRelationship.trim() || null,
        }),
      })

      if (!res.ok) throw new Error('Could not create session')

      const data = await res.json()
      saveToken(data.sessionId, data.personAToken)
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

      router.push(`/session/${data.sessionId}?join=${data.personBToken}`)
    } catch (err) {
      console.error('Join code error:', err)
      setJoinError('Bond had trouble looking up that code. Give it a moment and try again.')
      setJoining(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingTop: phase === 'name'
          ? (m ? 'max(40px, 8vh)' : 'max(56px, 10vh)')
          : (m ? '20px' : '28px'),
        paddingBottom: '48px',
        backgroundColor: C.paper,
        paddingLeft: m ? '20px' : '24px',
        paddingRight: m ? '20px' : '24px',
      }}
    >
      <style>{`
        input::placeholder { color: #b5aea6; }
        input:focus { border-bottom-color: #c4622d !important; }
      `}</style>

      <div style={{ width: '100%', maxWidth: '440px' }}>

        {/* ── MASTHEAD — full on name phase, minimal mark on subsequent phases ── */}
        <div
          style={{
            textAlign: 'center',
            paddingBottom: phase === 'name' ? '28px' : '12px',
            marginBottom: phase === 'name' ? '40px' : '20px',
            borderBottom: phase === 'name' ? `1px solid ${C.rule}` : 'none',
          }}
        >
          <span
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: phase === 'name' ? (m ? '26px' : '30px') : '20px',
              fontWeight: 400,
              color: C.ink,
              display: 'block',
              marginBottom: phase === 'name' ? '9px' : 0,
            }}
          >
            Bond
          </span>
          {phase === 'name' && (
            <span
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontStyle: 'italic',
                fontSize: '14px',
                color: C.accent,
                letterSpacing: '0.01em',
              }}
            >
              A private space for hard conversations.
            </span>
          )}
        </div>

        {/* ── PHASE 1: Name ── */}
        {phase === 'name' && (
          <div>

            <h1
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 'clamp(38px, 8vw, 52px)',
                fontWeight: 400,
                color: C.ink,
                marginBottom: '32px',
                lineHeight: 1.1,
              }}
            >
              Hi
            </h1>

            <input
              ref={nameRef}
              type="text"
              value={personAName}
              onChange={(e) => setPersonAName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleNameSubmit() }}
              placeholder="your name"
              style={inputStyle}
              autoComplete="given-name"
            />

            <button
              onClick={handleNameSubmit}
              disabled={!personAName.trim()}
              style={{
                marginTop: '28px',
                padding: '13px 28px',
                minHeight: '44px',
                borderRadius: '8px',
                backgroundColor: personAName.trim() ? C.accent : C.rule,
                color: personAName.trim() ? C.white : C.disabled,
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '14px',
                fontWeight: 500,
                border: 'none',
                cursor: personAName.trim() ? 'pointer' : 'not-allowed',
                transition: 'background-color 0.15s',
                width: '100%',
              }}
              onMouseEnter={(e) => { if (personAName.trim()) e.currentTarget.style.backgroundColor = C.accentHover }}
              onMouseLeave={(e) => { if (personAName.trim()) e.currentTarget.style.backgroundColor = C.accent }}
            >
              Continue →
            </button>
          </div>
        )}

        {/* ── PHASE 2: Partner + Bond context ── */}
        {phase === 'partner' && (
          <div>
            <p
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: m ? '22px' : '26px',
                fontWeight: 400,
                color: C.ink,
                lineHeight: 1.4,
                marginBottom: '24px',
              }}
            >
              Good to have you here, {personAName}.
            </p>

            <p
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '15px',
                color: '#4a4540',
                lineHeight: 1.8,
                marginBottom: '36px',
              }}
            >
              Bond is a private space where two people can say what's really going on
              — without it turning into a fight. You each share privately. Neither of you sees
              what the other wrote. Bond listens to both of you, then puts together a shared
              picture you read at the same time.
            </p>

            {/* Partner name + relationship inline */}
            <div style={{ marginBottom: '12px' }}>
              <label
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '10px',
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: C.dimmed,
                  display: 'block',
                  marginBottom: '8px',
                }}
              >
                Who are you starting this with?
              </label>
              <input
                ref={partnerRef}
                type="text"
                value={partnerNickname}
                onChange={(e) => setPartnerNickname(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && partnerNickname.trim()) partnerRef.current?.blur() }}
                placeholder="their name or nickname"
                style={inputStyle}
                autoComplete="off"
              />
            </div>

            <div style={{ marginBottom: '36px' }}>
              <input
                type="text"
                value={partnerRelationship}
                onChange={(e) => setPartnerRelationship(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handlePartnerSubmit() }}
                placeholder="relationship — e.g. partner, brother, close friend (optional)"
                style={{ ...inputStyle, fontSize: '15px', color: C.muted }}
                autoComplete="off"
              />
            </div>

            <div>
              <button
                onClick={handlePartnerSubmit}
                disabled={!partnerNickname.trim()}
                style={{
                  width: '100%',
                  padding: '12px 28px',
                  borderRadius: '8px',
                  backgroundColor: partnerNickname.trim() ? C.accent : C.rule,
                  color: partnerNickname.trim() ? C.white : C.disabled,
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '14px',
                  fontWeight: 500,
                  border: 'none',
                  cursor: partnerNickname.trim() ? 'pointer' : 'not-allowed',
                  transition: 'background-color 0.15s',
                }}
                onMouseEnter={(e) => { if (partnerNickname.trim()) e.currentTarget.style.backgroundColor = C.accentHover }}
                onMouseLeave={(e) => { if (partnerNickname.trim()) e.currentTarget.style.backgroundColor = C.accent }}
              >
                Continue →
              </button>
              <div style={{ textAlign: 'center', marginTop: '14px' }}>
                <button
                  onClick={() => setPhase('name')}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: '13px',
                    color: C.dimmed,
                    padding: '4px 0',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = C.muted }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = C.dimmed }}
                >
                  Back
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── PHASE 3: Mode selection ── */}
        {phase === 'mode' && (
          <div>
            <div style={{ marginBottom: '32px' }}>
              <h2
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: m ? '22px' : '26px',
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
                }}
              >
                {`${partnerNickname} won't see which you chose — it just shapes how Bond listens to you.`}
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
              {(['heard', 'figure_it_out'] as Mode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setSelectedMode(mode)}
                  style={{
                    textAlign: 'left',
                    padding: '15px 16px',
                    borderRadius: '8px',
                    border: selectedMode === mode ? `2px solid ${C.accent}` : `1px solid ${C.rule}`,
                    backgroundColor: selectedMode === mode ? C.accentSoft : C.white,
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
                    {mode === 'heard' ? 'I need to be heard' : 'We need to figure something out'}
                  </div>
                  <div
                    style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: '13px',
                      color: C.muted,
                      lineHeight: 1.5,
                    }}
                  >
                    {mode === 'heard'
                      ? 'I have something on my mind. I want to share it and feel understood.'
                      : "There\u2019s a real decision or disagreement we need to work through together."}
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

            <div>
              <button
                onClick={handleStart}
                disabled={!selectedMode || creating}
                style={{
                  width: '100%',
                  padding: '13px 28px',
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
              <div style={{ textAlign: 'center', marginTop: '14px' }}>
                <button
                  onClick={() => setPhase('partner')}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: '13px',
                    color: C.dimmed,
                    padding: '4px 0',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = C.muted }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = C.dimmed }}
                >
                  Back
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Join a Session (always visible at bottom) ── */}
        <div
          style={{
            marginTop: 'clamp(72px, 13vh, 104px)',
            paddingTop: '24px',
            borderTop: `1px solid ${C.rule}`,
          }}
        >
          <p
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '10px',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: C.dimmed,
              marginBottom: '12px',
            }}
          >
            Join a Session
          </p>

          <div style={{ display: 'flex', flexDirection: m ? 'column' : 'row', gap: '10px' }}>
            <input
              type="text"
              value={joinCode}
              onChange={(e) => {
                const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
                setJoinCode(val)
                if (joinError) setJoinError(null)
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleJoin() }}
              placeholder="6-character code"
              maxLength={6}
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: '8px',
                border: joinError ? `1.5px solid ${C.accent}` : `1px solid ${C.rule}`,
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '15px',
                letterSpacing: '0.12em',
                color: C.ink,
                backgroundColor: C.paper,
                outline: 'none',
                boxSizing: 'border-box',
                width: '100%',
              }}
            />
            <button
              onClick={handleJoin}
              disabled={joinCode.trim().length < 6 || joining}
              style={{
                padding: '10px 18px',
                borderRadius: '8px',
                backgroundColor: joinCode.trim().length === 6 && !joining ? C.ink : C.rule,
                color: joinCode.trim().length === 6 && !joining ? C.white : C.disabled,
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '14px',
                fontWeight: 500,
                border: 'none',
                cursor: joinCode.trim().length === 6 && !joining ? 'pointer' : 'not-allowed',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                width: m ? '100%' : 'auto',
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
