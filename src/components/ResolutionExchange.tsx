'use client'

// ResolutionExchange — Phase 2 mediated conversation component.
//
// Shown to both people when status reaches the resolution_exchange_* states.
// Both A and B can see each other's messages in a shared thread.
// Bond is present as an active third — it responds after each person's message
// and eventually proposes a Resolution Statement that both people confirm.
//
// Turn structure:
//   Bond opens → A writes → Bond responds → B writes → Bond responds → ... → Bond proposes statement
//   Both confirm → session closes with the Resolution Statement as a shared artifact.
//
// This component manages its own message fetching + polling for new messages.

import { useState, useEffect, useRef } from 'react'
import { useIsMobile } from '@/lib/useIsMobile'

// ─── Types ────────────────────────────────────────────────────────────────────

type Message = {
  id: string
  person: 'a' | 'b' | 'bond'
  content: string
  is_resolution_statement: boolean
  created_at: string
}

type Props = {
  sessionId: string
  token: string
  myRole: 'a' | 'b'
  status: string
  personAName?: string
  personBName?: string
  partnerNickname?: string
  onStatusChange: (newStatus: string) => void
}

// ─── Colour palette ───────────────────────────────────────────────────────────

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
  softAmber: '#f5ede0',
  bondBg: '#f0ebe3',
}

// Statuses where this person's input should be enabled
const MY_TURN_STATUS: Record<'a' | 'b', string> = {
  a: 'resolution_exchange_a_turn',
  b: 'resolution_exchange_b_turn',
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ResolutionExchange({
  sessionId,
  token,
  myRole,
  status,
  personAName,
  personBName,
  partnerNickname,
  onStatusChange,
}: Props) {
  const m = useIsMobile()

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [hasConfirmed, setHasConfirmed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadedOnce, setLoadedOnce] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const openingTriggeredRef = useRef(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Derive display names
  const myName = myRole === 'a' ? (personAName || 'You') : (personBName || 'You')
  const partnerName = myRole === 'a'
    ? (partnerNickname || personBName || 'Them')
    : (personAName || 'Them')

  const isMyTurn = status === MY_TURN_STATUS[myRole]
  const isBondTurn = status === 'resolution_exchange_bond_turn'
  const isOpening = status === 'resolution_exchange_opening'
  const isStatementProposed = status === 'resolution_statement_proposed'
  const isWaitingForPartnerConfirm =
    (myRole === 'a' && status === 'a_confirmed_statement') ||
    (myRole === 'b' && status === 'b_confirmed_statement')
  const partnerHasConfirmedFirst =
    (myRole === 'a' && status === 'b_confirmed_statement') ||
    (myRole === 'b' && status === 'a_confirmed_statement')

  // ── Fetch messages ────────────────────────────────────────────────────────

  async function fetchMessages() {
    const res = await fetch(
      `/api/resolution-exchange/messages?sessionId=${sessionId}&token=${token}`
    )
    if (!res.ok) return
    const data = await res.json()
    setMessages(data.messages || [])
    setLoadedOnce(true)
  }

  // ── Trigger Bond's opening message ───────────────────────────────────────

  async function triggerOpening() {
    if (openingTriggeredRef.current) return
    openingTriggeredRef.current = true
    try {
      await fetch('/api/resolution-exchange/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, token }),
      })
    } catch (err) {
      console.error('Opening trigger error:', err)
      openingTriggeredRef.current = false // allow retry
    }
  }

  // ── Initial load + trigger opening if needed ──────────────────────────────

  useEffect(() => {
    fetchMessages()
    if (status === 'resolution_ready') {
      triggerOpening()
    }
  }, [])

  // ── Poll for messages + status changes when waiting ───────────────────────

  useEffect(() => {
    const shouldPoll =
      !isMyTurn &&
      status !== 'closing_ready' &&
      status !== 'closed'

    if (!shouldPoll) {
      if (pollRef.current) clearInterval(pollRef.current)
      return
    }

    pollRef.current = setInterval(async () => {
      // Fetch new messages
      await fetchMessages()

      // Fetch updated session status
      const res = await fetch(`/api/sessions/${sessionId}`)
      if (res.ok) {
        const updated = await res.json()
        if (updated.status !== status) {
          onStatusChange(updated.status)
        }
      }
    }, 4000)

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [status, isMyTurn])

  // ── Trigger opening when status transitions to resolution_exchange_opening ──

  useEffect(() => {
    if (status === 'resolution_ready') {
      triggerOpening()
    }
  }, [status])

  // ── Auto-scroll to bottom when messages change ────────────────────────────

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  // ── Send a message ────────────────────────────────────────────────────────

  async function handleSend() {
    if (!input.trim() || sending || !isMyTurn) return
    setSending(true)
    setError(null)

    const optimisticMessage: Message = {
      id: 'optimistic-' + Date.now(),
      person: myRole,
      content: input.trim(),
      is_resolution_statement: false,
      created_at: new Date().toISOString(),
    }

    setMessages(prev => [...prev, optimisticMessage])
    setInput('')

    try {
      const res = await fetch('/api/resolution-exchange/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, token, content: optimisticMessage.content }),
      })

      if (!res.ok) {
        // Remove optimistic message on failure
        setMessages(prev => prev.filter(msg => msg.id !== optimisticMessage.id))
        setInput(optimisticMessage.content)
        const data = await res.json()
        setError(data.error || 'Something went wrong. Try again.')
      } else {
        const data = await res.json()
        // Re-fetch to get Bond's response
        await fetchMessages()
        onStatusChange(data.action || '')
      }
    } catch (err) {
      console.error('Send error:', err)
      setMessages(prev => prev.filter(msg => msg.id !== optimisticMessage.id))
      setInput(optimisticMessage.content)
      setError('Bond had trouble receiving your message. Try again.')
    } finally {
      setSending(false)
    }
  }

  // ── Confirm Resolution Statement ─────────────────────────────────────────

  async function handleConfirm() {
    if (confirming || hasConfirmed) return
    setConfirming(true)
    setError(null)

    try {
      const res = await fetch('/api/resolution-exchange/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, token }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Something went wrong.')
      } else {
        setHasConfirmed(true)
        onStatusChange(data.action || '')
      }
    } catch (err) {
      console.error('Confirm error:', err)
      setError('Something went wrong. Try again.')
    } finally {
      setConfirming(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSend()
    }
  }

  // ── Status header copy ───────────────────────────────────────────────────

  function getStatusCopy() {
    if (isOpening) return "Bond is opening the exchange\u2026"
    if (isBondTurn) return "Bond is responding\u2026"
    if (isMyTurn) return "Your turn"
    if (isStatementProposed) return "Bond has a proposal"
    if (isWaitingForPartnerConfirm) return `Waiting for ${partnerName}\u2026`
    if (partnerHasConfirmedFirst) return `${partnerName} agreed. Your turn to confirm.`
    return `Waiting for ${partnerName}\u2026`
  }

  // ── Render a single message ──────────────────────────────────────────────

  function renderMessage(msg: Message) {
    const isMine = msg.person === myRole
    const isBond = msg.person === 'bond'
    const isStatement = msg.is_resolution_statement

    // Resolution Statement — special full-width card
    if (isStatement) {
      return (
        <div
          key={msg.id}
          style={{
            margin: '20px 0',
            padding: m ? '20px' : '28px',
            backgroundColor: C.white,
            border: `1.5px solid ${C.accent}`,
            borderRadius: '10px',
          }}
        >
          <p style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '11px',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: C.accent,
            marginBottom: '14px',
          }}>
            Bond's proposal
          </p>
          <p style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: m ? '17px' : '19px',
            color: C.ink,
            lineHeight: 1.65,
            fontStyle: 'italic',
            marginBottom: '20px',
          }}>
            {msg.content}
          </p>

          {/* Confirm button — shown unless this person has already confirmed */}
          {(isStatementProposed || partnerHasConfirmedFirst) && !hasConfirmed && (
            <button
              onClick={handleConfirm}
              disabled={confirming}
              style={{
                padding: '12px 24px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: confirming ? C.rule : C.accent,
                color: confirming ? '#a09890' : C.white,
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '14px',
                fontWeight: 500,
                cursor: confirming ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.15s',
                width: m ? '100%' : 'auto',
              }}
              onMouseEnter={e => {
                if (!confirming) e.currentTarget.style.backgroundColor = C.accentHover
              }}
              onMouseLeave={e => {
                if (!confirming) e.currentTarget.style.backgroundColor = C.accent
              }}
            >
              {confirming ? 'Confirming\u2026' : 'I agree to this'}
            </button>
          )}

          {/* After confirming */}
          {hasConfirmed && !isWaitingForPartnerConfirm && (
            <p style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '14px',
              color: C.muted,
            }}>
              You agreed. Waiting for {partnerName}.
            </p>
          )}

          {isWaitingForPartnerConfirm && (
            <p style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '14px',
              color: C.muted,
            }}>
              You agreed. Waiting for {partnerName}.
            </p>
          )}
        </div>
      )
    }

    // Bond's regular message
    if (isBond) {
      return (
        <div
          key={msg.id}
          style={{
            margin: '12px 0',
            padding: m ? '14px 16px' : '16px 20px',
            backgroundColor: C.bondBg,
            borderRadius: '8px',
          }}
        >
          <p style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '11px',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: C.dimmed,
            marginBottom: '8px',
          }}>
            Bond
          </p>
          <p style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '15px',
            color: C.ink,
            lineHeight: 1.7,
            whiteSpace: 'pre-wrap',
          }}>
            {msg.content}
          </p>
        </div>
      )
    }

    // Person A or B message
    const senderName = isMine ? 'You' : partnerName

    return (
      <div
        key={msg.id}
        style={{
          margin: '8px 0',
          display: 'flex',
          flexDirection: 'column',
          alignItems: isMine ? 'flex-end' : 'flex-start',
        }}
      >
        <p style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '11px',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: isMine ? C.accent : C.dimmed,
          marginBottom: '5px',
        }}>
          {senderName}
        </p>
        <div
          style={{
            maxWidth: m ? '90%' : '80%',
            padding: '12px 16px',
            backgroundColor: isMine ? C.accentSoft : C.white,
            border: `1px solid ${isMine ? '#f0d5c8' : C.rule}`,
            borderRadius: isMine ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
          }}
        >
          <p style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '15px',
            color: C.ink,
            lineHeight: 1.65,
            whiteSpace: 'pre-wrap',
          }}>
            {msg.content}
          </p>
        </div>
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────

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
        * { box-sizing: border-box; }
        textarea:focus { outline: none; }
        @media (max-width: 640px) { .cmd-hint { display: none; } }
      `}</style>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div
        style={{
          padding: m ? '20px 16px 14px' : '28px 24px 18px',
          borderBottom: `1px solid ${C.rule}`,
          position: 'sticky',
          top: 0,
          backgroundColor: C.paper,
          zIndex: 10,
        }}
      >
        <div style={{ maxWidth: '620px', margin: '0 auto' }}>
          <p style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '11px',
            letterSpacing: '0.12em',
            color: C.dimmed,
            textTransform: 'uppercase',
            marginBottom: '4px',
          }}>
            Working through it
          </p>
          <p style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '14px',
            color: C.muted,
          }}>
            {getStatusCopy()}
          </p>
        </div>
      </div>

      {/* ── Message thread ───────────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: m ? '20px 16px' : '24px',
        }}
      >
        <div style={{ maxWidth: '620px', margin: '0 auto' }}>

          {/* Loading state on first fetch */}
          {!loadedOnce && (
            <p style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '14px',
              color: C.muted,
              textAlign: 'center',
              paddingTop: '40px',
            }}>
              Loading\u2026
            </p>
          )}

          {/* Opening / Bond processing indicator */}
          {loadedOnce && messages.length === 0 && (
            <p style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '15px',
              color: C.muted,
              textAlign: 'center',
              paddingTop: '40px',
              lineHeight: 1.7,
            }}>
              Bond is opening the exchange\u2026
            </p>
          )}

          {/* Messages */}
          {messages.map(renderMessage)}

          {/* Bond typing indicator */}
          {isBondTurn && (
            <div style={{ margin: '12px 0', padding: '14px 20px', backgroundColor: C.bondBg, borderRadius: '8px' }}>
              <p style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '11px',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: C.dimmed,
                marginBottom: '6px',
              }}>
                Bond
              </p>
              <p style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '15px',
                color: C.dimmed,
                fontStyle: 'italic',
              }}>
                Thinking\u2026
              </p>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* ── Input area — only shown when it's this person's turn ─────────── */}
      {isMyTurn && (
        <div
          style={{
            borderTop: `1px solid ${C.rule}`,
            padding: m ? '16px' : '20px 24px',
            backgroundColor: C.paper,
          }}
        >
          <div style={{ maxWidth: '620px', margin: '0 auto' }}>
            {error && (
              <p style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '13px',
                color: '#b94040',
                marginBottom: '10px',
              }}>
                {error}
              </p>
            )}
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Say what you want them to understand\u2026"
              rows={m ? 3 : 4}
              disabled={sending}
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: '6px',
                border: `1.5px solid ${C.rule}`,
                backgroundColor: C.white,
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '15px',
                color: C.ink,
                lineHeight: 1.65,
                resize: 'vertical',
                marginBottom: '12px',
              }}
            />
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexDirection: m ? 'column' : 'row',
              gap: m ? '10px' : '0',
            }}>
              <span className="cmd-hint" style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '10px',
                color: '#c0b8b0',
                letterSpacing: '0.1em',
              }}>
                &#8984; + Enter to send
              </span>
              <button
                onClick={handleSend}
                disabled={!input.trim() || sending}
                style={{
                  width: m ? '100%' : 'auto',
                  padding: '12px 24px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: input.trim() && !sending ? C.accent : C.rule,
                  color: input.trim() && !sending ? C.white : '#a09890',
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: input.trim() && !sending ? 'pointer' : 'not-allowed',
                  transition: 'background-color 0.15s',
                }}
                onMouseEnter={e => {
                  if (input.trim() && !sending) e.currentTarget.style.backgroundColor = C.accentHover
                }}
                onMouseLeave={e => {
                  if (input.trim() && !sending) e.currentTarget.style.backgroundColor = C.accent
                }}
              >
                {sending ? 'Sending\u2026' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Waiting message — when it's not your turn but no input shown */}
      {!isMyTurn && !isBondTurn && !isOpening && !isStatementProposed && !isWaitingForPartnerConfirm && !partnerHasConfirmedFirst && loadedOnce && messages.length > 0 && (
        <div style={{
          borderTop: `1px solid ${C.rule}`,
          padding: m ? '14px 16px' : '16px 24px',
          backgroundColor: C.paper,
          textAlign: 'center',
        }}>
          <p style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '13px',
            color: C.dimmed,
          }}>
            {partnerName} is responding\u2026
          </p>
        </div>
      )}
    </div>
  )
}
