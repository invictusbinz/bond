'use client'

import { useState, useRef, useEffect } from 'react'
import { useIsMobile } from '@/lib/useIsMobile'

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = 'intake' | 'complete'
type Message = { role: 'ai' | 'user'; text: string }

// ─── Constants ────────────────────────────────────────────────────────────────

// Person B's opening question — they've just read the orientation screen and the
// neutral summary of Person A's side. Now they're invited to share their own.
// "Not as a rebuttal" is intentional: it steers away from defensiveness.
const OPENING_QUESTION =
  "I've heard their side. Now I want to hear yours — not as a rebuttal, but your own experience of what's been going on. What's happening for you?"

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

// ─── Component ────────────────────────────────────────────────────────────────

type Props = {
  sessionId?: string  // links this intake to a specific session in Supabase
  token?: string      // Person B's token — used to verify and advance session status
  // The neutral AI-generated summary of Person A's side, produced during the
  // orientation screen. Passed to the intake API as background context only —
  // the AI uses it to ask better follow-up questions without revealing it to Person B.
  partnerSummary?: string
  // Availability state from the check-in. Injected into the intake-b system prompt
  // so the AI adjusts pacing and tone for stressed users.
  availabilityState?: 'good' | 'stressed'
}

const storageKey = (id?: string) => id ? `bond_intake_b_${id}` : null

export default function IntakePersonB({ sessionId, token, partnerSummary = '', availabilityState = 'good' }: Props) {
  const m = useIsMobile()
  // Restore from localStorage on mount — so refreshing mid-intake doesn't lose progress
  const savedState = (() => {
    const key = storageKey(sessionId)
    if (!key || typeof window === 'undefined') return null
    try {
      const raw = localStorage.getItem(key)
      return raw ? JSON.parse(raw) as { messages: Message[]; userMessageCount: number } : null
    } catch { return null }
  })()

  const [phase, setPhase] = useState<Phase>('intake')
  const [messages, setMessages] = useState<Message[]>(
    savedState?.messages ?? [{ role: 'ai', text: OPENING_QUESTION }]
  )
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [userMessageCount, setUserMessageCount] = useState(savedState?.userMessageCount ?? 0)
  const [error, setError] = useState<string | null>(null)
  // Context strip — collapses by default so it doesn't crowd the intake view.
  // Person B can tap to re-read the orientation summary at any point.
  const [contextOpen, setContextOpen] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Persist messages to localStorage after every update
  useEffect(() => {
    const key = storageKey(sessionId)
    if (!key) return
    try {
      localStorage.setItem(key, JSON.stringify({ messages, userMessageCount }))
    } catch { /* storage quota exceeded — non-blocking */ }
  }, [messages, userMessageCount, sessionId])

  // Scroll to bottom whenever messages update or AI is loading
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Auto-focus the textarea when the component mounts
  useEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 150)
  }, [])

  const handleForceClose = async () => {
    if (loading) return
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/intake-b', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, userMessageCount, partnerSummary, sessionId, token, availabilityState, forceClose: true }),
      })
      if (!res.ok) throw new Error('API error')
      const data = await res.json()
      const aiMessage: Message = { role: 'ai', text: data.text }
      setMessages([...messages, aiMessage])
      if (data.isComplete) {
        // Clear saved state — intake is done, next session starts fresh
        const key = storageKey(sessionId)
        if (key) try { localStorage.removeItem(key) } catch { /* ok */ }
        // Let the closing message breathe in the conversation view before transitioning
        setTimeout(() => setPhase('complete'), 3500)
      }
    } catch (err) {
      console.error('Force close error:', err)
      setError('Bond had trouble wrapping up your intake. Give it a moment and try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async () => {
    if (!input.trim() || loading) return
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
      const res = await fetch('/api/intake-b', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, userMessageCount: newCount, partnerSummary, sessionId, token, availabilityState }),
      })

      if (!res.ok) throw new Error('API error')

      const data = await res.json()
      if (data.error) throw new Error(data.error)

      const aiMessage: Message = { role: 'ai', text: data.text }
      const finalMessages = [...newMessages, aiMessage]
      setMessages(finalMessages)

      if (data.isComplete) {
        // Intake saved to Supabase + session status advanced by the API route.
        const key = storageKey(sessionId)
        if (key) try { localStorage.removeItem(key) } catch { /* ok */ }
        // Let the closing message breathe in the conversation view before transitioning
        setTimeout(() => setPhase('complete'), 3500)
      }
    } catch (err) {
      console.error('Intake B error:', err)
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

  // Derive what to show in the conversation:
  // - historyMessages: everything except the current AI question (shown muted/dimmed)
  // - currentQuestion: the most recent AI message (shown prominently)
  const lastMsg = messages[messages.length - 1]
  const currentQuestion = !loading && lastMsg?.role === 'ai' ? lastMsg : null
  const historyMessages = currentQuestion ? messages.slice(0, -1) : messages

  // ─── PHASE: COMPLETE ─────────────────────────────────────────────────────────
  if (phase === 'complete') {
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
        <style>{`${FONTS} body { font-family: 'DM Sans', sans-serif; }`}</style>
        <div style={{ width: '100%', maxWidth: '440px' }}>

          {/* Eyebrow */}
          <p
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: '11px',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: C.accent,
              marginBottom: '20px',
            }}
          >
            Your side is in
          </p>

          {/* Heading */}
          <h1
            style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: m ? '26px' : '30px',
              fontWeight: 400,
              color: C.ink,
              lineHeight: 1.3,
              marginBottom: '16px',
            }}
          >
            Bond has heard you both.
          </h1>

          {/* Sub-text */}
          <p
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '16px',
              color: C.muted,
              lineHeight: 1.75,
              maxWidth: '380px',
            }}
          >
            Bond is now putting together a shared picture — what you each seem to need, and where there might be common ground. You&apos;ll both see it at the same time.
          </p>

        </div>
      </div>
    )
  }

  // ─── PHASE: INTAKE ───────────────────────────────────────────────────────────
  return (
    <div
      className="intake-shell"
      style={{
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
        @supports (-webkit-touch-callout: none) { .intake-shell { height: -webkit-fill-available; } }
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

      {/* ── Context strip (collapsible) ── */}
      {/* Only shown if there's an orientation summary to display. Collapsed by default. */}
      {partnerSummary && (
        <div
          style={{
            borderBottom: `1px solid ${C.rule}`,
            backgroundColor: contextOpen ? C.accentSoft : C.white,
            flexShrink: 0,
            transition: 'background-color 0.2s',
          }}
        >
          <div style={{ maxWidth: '560px', margin: '0 auto' }}>
            {/* Toggle row */}
            <button
              onClick={() => setContextOpen((o) => !o)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: m ? '10px 16px' : '10px 24px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <span
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: '10px',
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                  color: contextOpen ? C.accent : C.dimmed,
                }}
              >
                What they&apos;re carrying
              </span>
              <span
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: '11px',
                  color: contextOpen ? C.accent : C.dimmed,
                  // Rotate the chevron when open
                  display: 'inline-block',
                  transform: contextOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s',
                }}
              >
                ↓
              </span>
            </button>

            {/* Expanded summary text */}
            {contextOpen && (
              <div style={{ padding: m ? '0 16px 16px' : '0 24px 16px' }}>
                <p
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: '14px',
                    color: C.ink,
                    lineHeight: 1.75,
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {partnerSummary}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

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
          paddingBottom: m ? 'max(12px, env(safe-area-inset-bottom, 12px))' : '20px',
          flexShrink: 0,
        }}
      >
        <div style={{ maxWidth: '560px', margin: '0 auto' }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Take your time. Write whatever comes to mind."
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
        </div>
      </div>
    </div>
  )
}
