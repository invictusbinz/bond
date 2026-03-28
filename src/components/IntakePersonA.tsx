'use client'

import { useState, useRef, useEffect } from 'react'
import { useIsMobile } from '@/lib/useIsMobile'

type Mode = 'heard' | 'figure_it_out'
type Phase = 'mode_selection' | 'intake'
type Message = { role: 'ai' | 'user'; text: string }

const OPENING_QUESTIONS: Record<Mode, string> = {
  heard:
    "Before I invite them in, I want to understand what's on your mind. What happened, and how are you feeling about it?",
  figure_it_out:
    "Before I bring them in, tell me what's going on. What's the situation, and what feels unresolved for you?",
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
  disabled: '#a09890',
  greenSoft: '#d4e8dc',
  green: '#3d6b4f',
}

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital@0;1&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400&display=swap');`

type Props = {
  // When coming from a real session (via /session/[id]), these are provided.
  // When used standalone (legacy /intake route), they are omitted and the
  // component falls back to its built-in mode selection screen.
  sessionId?: string
  token?: string
  mode?: Mode
  // The correct invite URL for Person B — built by session page with person_b_token.
  // If not provided, the complete screen won't show the link.
  inviteUrl?: string
  // The 6-character join code — shown as an alternative to the full URL.
  joinCode?: string
  // Name fields — personalise the opening question and API system prompt
  personAName?: string
  partnerNickname?: string
  partnerRelationship?: string
  // Called when intake is complete and person taps "Invite them in".
  // Session page re-fetches status and routes to WaitingScreen awaiting_b.
  onComplete?: () => void
}

const storageKeyA = (id?: string) => id ? `bond_intake_a_${id}` : null

export default function IntakePersonA({ sessionId, token, mode: modeProp, inviteUrl: inviteUrlProp, joinCode, personAName, partnerNickname, partnerRelationship, onComplete }: Props = {}) {
  // Restore from localStorage on mount — so refreshing mid-intake doesn't lose progress
  const savedState = (() => {
    const key = storageKeyA(sessionId)
    if (!key || typeof window === 'undefined') return null
    try {
      const raw = localStorage.getItem(key)
      return raw ? JSON.parse(raw) as { messages: Message[]; userMessageCount: number } : null
    } catch { return null }
  })()

  // If mode is already known (passed from session page), skip mode_selection
  const [phase, setPhase] = useState<Phase>(modeProp ? 'intake' : 'mode_selection')
  const [mode, setMode] = useState<Mode | null>(modeProp ?? null)
  const [selectedMode, setSelectedMode] = useState<Mode | null>(null)
  const [messages, setMessages] = useState<Message[]>(savedState?.messages ?? [])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [userMessageCount, setUserMessageCount] = useState(savedState?.userMessageCount ?? 0)
  const [error, setError] = useState<string | null>(null)
  const [showContinue, setShowContinue] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const m = useIsMobile()

  // Persist messages to localStorage after every update
  useEffect(() => {
    const key = storageKeyA(sessionId)
    if (!key) return
    try {
      localStorage.setItem(key, JSON.stringify({ messages, userMessageCount }))
    } catch { /* storage quota — non-blocking */ }
  }, [messages, userMessageCount, sessionId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // When mode prop is provided, seed the opening question immediately.
  // Personalise with partnerNickname if available.
  useEffect(() => {
    if (modeProp && messages.length === 0) {
      const ref = partnerNickname || 'them'
      const personalised: Record<Mode, string> = {
        heard: `Before I invite ${ref} in, I want to understand what's on your mind. What happened, and how are you feeling about it?`,
        figure_it_out: `Before I bring ${ref} in, tell me what's going on. What's the situation, and what feels unresolved for you?`,
      }
      setMessages([{ role: 'ai', text: personalised[modeProp] }])
      setTimeout(() => textareaRef.current?.focus(), 150)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modeProp])

  const handleStartSession = () => {
    if (!selectedMode) return
    setMode(selectedMode)
    setMessages([{ role: 'ai', text: OPENING_QUESTIONS[selectedMode] }])
    setPhase('intake')
    setTimeout(() => textareaRef.current?.focus(), 150)
  }

  const handleForceClose = async () => {
    if (loading || !mode) return
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, mode, userMessageCount, sessionId, token, forceClose: true, personAName, partnerNickname, partnerRelationship }),
      })
      if (!res.ok) throw new Error('API error')
      const data = await res.json()
      const aiMessage: Message = { role: 'ai', text: data.text }
      setMessages([...messages, aiMessage])
      if (data.isComplete) {
        const key = storageKeyA(sessionId)
        if (key) try { localStorage.removeItem(key) } catch { /* ok */ }
        setTimeout(() => setShowContinue(true), 3500)
      }
    } catch (err) {
      console.error('Force close error:', err)
      setError('Bond had trouble wrapping up your intake. Give it a moment and try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async () => {
    if (!input.trim() || loading || !mode) return
    setError(null)

    const userMessage: Message = { role: 'user', text: input.trim() }
    const newMessages = [...messages, userMessage]
    const newCount = userMessageCount + 1

    setMessages(newMessages)
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setLoading(true)
    setUserMessageCount(newCount)

    try {
      const res = await fetch('/api/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, mode, userMessageCount: newCount, sessionId, token, personAName, partnerNickname, partnerRelationship }),
      })

      if (!res.ok) throw new Error('API error')

      const data = await res.json()
      if (data.error) throw new Error(data.error)

      const aiMessage: Message = { role: 'ai', text: data.text }
      const finalMessages = [...newMessages, aiMessage]
      setMessages(finalMessages)

      if (data.isComplete) {
        // Intake saved to Supabase + session status advanced by the API route.
        const key = storageKeyA(sessionId)
        if (key) try { localStorage.removeItem(key) } catch { /* ok */ }
        // Let the closing message breathe in the conversation view for a moment
        // before transitioning — without this pause the screen cuts away before
        // the person has finished reading what Bond said.
        setTimeout(() => setShowContinue(true), 3500)
      }
    } catch (err) {
      console.error('Intake error:', err)
      setError('Bond didn\u2019t receive that. Your message is restored below \u2014 try sending it again.')
      // Restore state so user can retry
      setMessages(messages)
      setUserMessageCount(userMessageCount)
      setInput(userMessage.text)
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`
  }

  // Derive what to show in the conversation
  const lastMsg = messages[messages.length - 1]
  const currentQuestion = !loading && lastMsg?.role === 'ai' ? lastMsg : null
  const historyMessages = currentQuestion ? messages.slice(0, -1) : messages

  // ─── PHASE: MODE SELECTION ───────────────────────────────────────────────────
  if (phase === 'mode_selection') {
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
          <div
            style={{
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
              New Session
            </div>

            {/* Headline */}
            <h1
              style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: '26px',
                fontWeight: 400,
                color: C.ink,
                marginBottom: '8px',
                lineHeight: 1.3,
              }}
            >
              What kind of support do you need right now?
            </h1>
            <p
              style={{
                fontSize: '14px',
                color: C.muted,
                lineHeight: 1.7,
                marginBottom: '28px',
              }}
            >
              This shapes how the session unfolds. The other person won&apos;t see which you chose.
            </p>

            {/* Mode options */}
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '28px' }}
            >
              {(['heard', 'figure_it_out'] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setSelectedMode(m)}
                  style={{
                    textAlign: 'left',
                    padding: '16px 18px',
                    borderRadius: '8px',
                    border:
                      selectedMode === m ? `2px solid ${C.accent}` : `1px solid ${C.rule}`,
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
                      marginBottom: '4px',
                    }}
                  >
                    {m === 'heard' ? 'I need to be heard' : 'We need to figure something out'}
                  </div>
                  <div
                    style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: '13px',
                      color: C.muted,
                      lineHeight: 1.55,
                    }}
                  >
                    {m === 'heard'
                      ? 'I have something on my mind. I want to share it and feel understood.'
                      : "There's a real decision or disagreement we need to work through together."}
                  </div>
                </button>
              ))}
            </div>

            {/* Start button */}
            <button
              onClick={handleStartSession}
              disabled={!selectedMode}
              style={{
                width: '100%',
                padding: '13px 16px',
                borderRadius: '8px',
                backgroundColor: selectedMode ? C.accent : C.rule,
                color: selectedMode ? C.white : C.disabled,
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '14px',
                fontWeight: 500,
                border: 'none',
                cursor: selectedMode ? 'pointer' : 'not-allowed',
                transition: 'background-color 0.15s',
              }}
              onMouseEnter={(e) => {
                if (selectedMode) e.currentTarget.style.backgroundColor = C.accentHover
              }}
              onMouseLeave={(e) => {
                if (selectedMode) e.currentTarget.style.backgroundColor = C.accent
              }}
            >
              Begin Session
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── PHASE: INTAKE ───────────────────────────────────────────────────────────
  return (
    <div
      style={{
        // Use -webkit-fill-available on iOS to respect the browser chrome height
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: C.paper,
      }}
    >
      <style>{`
        ${FONTS}
        body { font-family: 'DM Sans', sans-serif; }
        textarea { outline: none; }
        textarea::placeholder { color: #b0a89e; }
        @keyframes dot-pulse {
          0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
          40%            { opacity: 1;   transform: scale(1.1); }
        }
        /* iOS Safari: fill the visible viewport, not the full 100vh */
        @supports (-webkit-touch-callout: none) {
          .intake-shell { height: -webkit-fill-available; }
        }
        /* Hide keyboard shortcut hint on touch devices */
        @media (max-width: 640px) { .cmd-hint { display: none; } }
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
            Your side
          </span>
        </div>
      </div>

      {/* ── Conversation area ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: m ? '20px 16px 16px' : '36px 24px 24px' }}>
        <div style={{ maxWidth: '560px', margin: '0 auto' }}>

          {/* History: previous exchanges (muted) */}
          {historyMessages.map((msg, i) =>
            msg.role === 'user' ? (
              // User bubble — right-aligned card
              <div
                key={i}
                style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}
              >
                <div
                  style={{
                    maxWidth: '82%',
                    padding: '12px 16px',
                    backgroundColor: C.white,
                    border: `1px solid ${C.rule}`,
                    borderRadius: '8px',
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: '14px',
                    color: C.ink,
                    lineHeight: 1.65,
                  }}
                >
                  {msg.text}
                </div>
              </div>
            ) : (
              // Previous AI question — italic, dimmed
              <div key={i} style={{ marginBottom: '20px' }}>
                <p
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: '14px',
                    color: C.dimmed,
                    lineHeight: 1.7,
                    fontStyle: 'italic',
                    margin: 0,
                  }}
                >
                  {msg.text}
                </p>
              </div>
            )
          )}

          {/* Current AI question — prominent, serif */}
          {currentQuestion && (
            <div style={{ marginBottom: '36px' }}>
              <p
                style={{
                  fontFamily: "'Playfair Display', serif",
                  fontSize: historyMessages.length === 0 ? (m ? '20px' : '24px') : (m ? '17px' : '20px'),
                  fontWeight: 400,
                  color: C.ink,
                  lineHeight: 1.55,
                  margin: 0,
                }}
              >
                {currentQuestion.text}
              </p>
            </div>
          )}

          {/* Loading dots */}
          {loading && (
            <div
              style={{
                display: 'flex',
                gap: '5px',
                alignItems: 'center',
                marginBottom: '24px',
                height: '24px',
              }}
            >
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
          )}

          {/* Error */}
          {error && (
            <div
              style={{
                padding: '12px 16px',
                backgroundColor: C.accentSoft,
                border: `1px solid ${C.rule}`,
                borderRadius: '8px',
                marginBottom: '20px',
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

          <div ref={bottomRef} />
        </div>
      </div>

      {/* ── Input area ── */}
      <div
        style={{
          borderTop: `1px solid ${C.rule}`,
          backgroundColor: C.white,
          padding: m ? '12px 16px' : '20px 24px',
          // On iOS, add extra bottom padding for the home indicator safe area
          paddingBottom: m ? 'max(12px, env(safe-area-inset-bottom, 12px))' : '20px',
          flexShrink: 0,
        }}
      >
        <div style={{ maxWidth: '560px', margin: '0 auto' }}>

          {showContinue ? (
            /* Intake complete — show "Invite them in" button */
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <button
                onClick={() => onComplete?.()}
                style={{
                  padding: '13px 28px',
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
                Invite them in
              </button>
            </div>
          ) : (
            /* Active intake — textarea + send + escape hatch */
            <>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="The more you share here, the more Bond has to work with."
                disabled={loading}
                rows={3}
                style={{
                  width: '100%',
                  resize: 'none',
                  border: 'none',
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '15px',
                  color: C.ink,
                  lineHeight: 1.65,
                  backgroundColor: 'transparent',
                  padding: 0,
                  marginBottom: '14px',
                  boxSizing: 'border-box',
                  overflowY: 'hidden',
                  minHeight: '72px',
                  maxHeight: '200px',
                  opacity: loading ? 0.5 : 1,
                }}
              />
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span
                  className="cmd-hint"
                  style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: '10px',
                    color: '#c0b8b0',
                    letterSpacing: '0.1em',
                  }}
                >
                  ⌘ + Enter to send
                </span>
                <button
                  onClick={handleSubmit}
                  disabled={!input.trim() || loading}
                  style={{
                    padding: '10px 22px',
                    borderRadius: '8px',
                    backgroundColor: input.trim() && !loading ? C.accent : C.rule,
                    color: input.trim() && !loading ? C.white : C.disabled,
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: '13px',
                    fontWeight: 500,
                    border: 'none',
                    cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    if (input.trim() && !loading)
                      e.currentTarget.style.backgroundColor = C.accentHover
                  }}
                  onMouseLeave={(e) => {
                    if (input.trim() && !loading)
                      e.currentTarget.style.backgroundColor = C.accent
                  }}
                >
                  {loading ? 'Thinking…' : 'Send'}
                </button>
              </div>

              {/* Subtle "done" escape hatch — only after first user message */}
              {userMessageCount >= 1 && !loading && (
                <div style={{ textAlign: 'center', marginTop: '14px' }}>
                  <button
                    onClick={handleForceClose}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: '12px',
                      color: '#b0a89e',
                      padding: '4px 0',
                      textDecoration: 'underline',
                      textUnderlineOffset: '2px',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = C.muted }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = '#b0a89e' }}
                  >
                    I&apos;ve shared enough — Bond can work with this
                  </button>
                </div>
              )}
            </>
          )}

        </div>
      </div>
    </div>
  )
}

