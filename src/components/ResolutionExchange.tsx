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
// UX notes (Session 24):
//   - Confirmation is "This is where we landed" — not a contract, a landing.
//   - "Something's missing" path: one revision max, only before anyone confirms.
//   - Message input has a richness nudge — subtle copy signals this is a limited space.
//   - After confirming, copy is warm: "You said yes. Give [partner] a moment with this."

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

  // "Something's missing" revision state
  const [hasRevised, setHasRevised] = useState(false)   // true after one revision — hides the button
  const [reviseOpen, setReviseOpen] = useState(false)   // whether the revision textarea is showing
  const [reviseInput, setReviseInput] = useState('')
  const [revising, setRevising] = useState(false)
  const [reviseError, setReviseError] = useState<string | null>(null)

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
    // Update hasRevised from the server — persists across refreshes
    if (data.wasRevised) setHasRevised(true)
    setLoadedOnce(true)
  }

  // ── Trigger Bond's opening message ───────────────────────────────────────

  async function triggerOpening() {
    if (openingTriggeredRef.current) return
    openingTriggeredRef.current = true
    try {
      const res = await fetch('/api/resolution-exchange/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, token }),
      })
      // Reset ref on API-level errors (4xx/5xx) so the next poll can retry.
      // fetch() only throws on network errors — explicit status check needed.
      if (!res.ok) {
        console.error('Opening trigger API error:', res.status)
        openingTriggeredRef.current = false
      }
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
      await fetchMessages()

      // If we're in the opening state and no messages have arrived yet,
      // retry triggerOpening() — it may have failed on the first attempt.
      // The openingTriggeredRef guard prevents duplicate in-flight calls.
      if ((status === 'resolution_ready' || status === 'resolution_exchange_opening') && messages.length === 0) {
    openingTriggeredRef.current = false // Reset the guard so it actually retries
        triggerOpening()
      }

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
        setMessages(prev => prev.filter(msg => msg.id !== optimisticMessage.id))
        setInput(optimisticMessage.content)
        const data = await res.json()
        setError(data.error || 'Something went wrong. Try again.')
      } else {
        const data = await res.json()
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

  // ── Submit revision ("Something's missing") ──────────────────────────────

  async function handleRevise() {
    if (!reviseInput.trim() || revising) return
    setRevising(true)
    setReviseError(null)

    try {
      const res = await fetch('/api/resolution-exchange/revise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, token, feedback: reviseInput.trim() }),
      })

      const data = await res.json()
      if (!res.ok) {
        setReviseError(data.error || 'Something went wrong. Try again.')
      } else {
        // Revision succeeded — close the textarea, mark as revised, refresh messages
        setReviseOpen(false)
        setReviseInput('')
        setHasRevised(true)
        await fetchMessages()
        onStatusChange(data.action || 'resolution_statement_proposed')
      }
    } catch (err) {
      console.error('Revise error:', err)
      setReviseError('Bond had trouble revising. Try again.')
    } finally {
      setRevising(false)
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
    // After I confirmed, waiting for partner
    if (isWaitingForPartnerConfirm) return `${partnerName} is sitting with this\u2026`
    // Partner confirmed first, now my turn
    if (partnerHasConfirmedFirst) return `${partnerName} said yes. Take a moment.`
    return `Waiting for ${partnerName}\u2026`
  }

  // ── Render a single message ──────────────────────────────────────────────

  function renderMessage(msg: Message) {
    const isMine = msg.person === myRole
    const isBond = msg.person === 'bond'
    const isStatement = msg.is_resolution_statement

    // Resolution Statement — special full-width card
    if (isStatement) {
      // Can only revise before anyone has confirmed (status still proposed) and only once
      const canRevise = isStatementProposed && !hasConfirmed && !hasRevised

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
          {/* Label */}
          <p style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '11px',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: C.accent,
            marginBottom: '14px',
          }}>
            {hasRevised ? "Bond's revised proposal" : "Bond's proposal"}
          </p>

          {/* Statement text */}
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

          {/* Settling line — shown before confirm button, not after */}
          {(isStatementProposed || partnerHasConfirmedFirst) && !hasConfirmed && (
            <p style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '13px',
              color: C.dimmed,
              marginBottom: '20px',
              fontStyle: 'italic',
            }}>
              Sit with this for a moment. Confirm when it feels right.
            </p>
          )}

          {/* Confirm button — shown unless already confirmed */}
          {(isStatementProposed || partnerHasConfirmedFirst) && !hasConfirmed && (
            <div style={{ display: 'flex', flexDirection: m ? 'column' : 'row', gap: '10px', alignItems: m ? 'stretch' : 'center', flexWrap: 'wrap' }}>
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
                {confirming ? 'Confirming\u2026' : 'This is where we landed'}
              </button>

              {/* "Something's missing" — only before anyone confirms, only once */}
              {canRevise && !reviseOpen && (
                <button
                  onClick={() => setReviseOpen(true)}
                  style={{
                    padding: '12px 20px',
                    borderRadius: '6px',
                    border: `1px solid ${C.rule}`,
                    backgroundColor: 'transparent',
                    color: C.muted,
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: '14px',
                    cursor: 'pointer',
                    transition: 'color 0.15s, border-color 0.15s',
                    width: m ? '100%' : 'auto',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.color = C.ink
                    e.currentTarget.style.borderColor = C.muted
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.color = C.muted
                    e.currentTarget.style.borderColor = C.rule
                  }}
                >
                  Something&apos;s missing
                </button>
              )}
            </div>
          )}

          {/* Revision textarea — shown when "Something's missing" is tapped */}
          {reviseOpen && canRevise && (
            <div style={{ marginTop: '20px' }}>
              <p style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '13px',
                color: C.muted,
                marginBottom: '10px',
                lineHeight: 1.6,
              }}>
                Tell Bond what&apos;s not captured here. Be specific — Bond will revise the statement once.
              </p>
              <textarea
                value={reviseInput}
                onChange={e => setReviseInput(e.target.value)}
                placeholder="What's missing or not quite right\u2026"
                rows={3}
                disabled={revising}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '6px',
                  border: `1.5px solid ${C.rule}`,
                  backgroundColor: C.paper,
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '14px',
                  color: C.ink,
                  lineHeight: 1.65,
                  resize: 'vertical',
                  marginBottom: '10px',
                }}
              />
              {reviseError && (
                <p style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '13px',
                  color: '#b94040',
                  marginBottom: '10px',
                }}>
                  {reviseError}
                </p>
              )}
              <div style={{ display: 'flex', gap: '10px', flexDirection: m ? 'column' : 'row' }}>
                <button
                  onClick={handleRevise}
                  disabled={!reviseInput.trim() || revising}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: reviseInput.trim() && !revising ? C.accent : C.rule,
                    color: reviseInput.trim() && !revising ? C.white : '#a09890',
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: reviseInput.trim() && !revising ? 'pointer' : 'not-allowed',
                    transition: 'background-color 0.15s',
                    width: m ? '100%' : 'auto',
                  }}
                  onMouseEnter={e => {
                    if (reviseInput.trim() && !revising) e.currentTarget.style.backgroundColor = C.accentHover
                  }}
                  onMouseLeave={e => {
                    if (reviseInput.trim() && !revising) e.currentTarget.style.backgroundColor = C.accent
                  }}
                >
                  {revising ? 'Bond is revising\u2026' : 'Share with Bond'}
                </button>
                <button
                  onClick={() => { setReviseOpen(false); setReviseInput(''); setReviseError(null) }}
                  disabled={revising}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '6px',
                    border: `1px solid ${C.rule}`,
                    backgroundColor: 'transparent',
                    color: C.dimmed,
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: '13px',
                    cursor: revising ? 'not-allowed' : 'pointer',
                    width: m ? '100%' : 'auto',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* After confirming */}
          {hasConfirmed && (
            <p style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '14px',
              color: C.muted,
              fontStyle: 'italic',
            }}>
              {`You said yes. Give ${partnerName} a moment with this.`}
            </p>
          )}

          {/* Partner confirmed first, I haven't yet (this is the waiting copy shown above the button) */}
          {/* The partnerHasConfirmedFirst confirm prompt is handled above via the button logic */}
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
              {"Loading\u2026"}
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
              {/* Note: use JS string {"\u2026"} not JSX text \u2026 — JSX text doesn't interpret unicode escapes */}
              {"Bond is opening the exchange\u2026"}
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
              placeholder={`Say what you most need ${partnerName} to understand\u2026`}
              rows={m ? 4 : 5}
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
                marginBottom: '10px',
              }}
            />
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexDirection: m ? 'column' : 'row',
              gap: m ? '10px' : '0',
            }}>
              {/* Richness nudge — subtle, in place of the keyboard hint on desktop */}
              <span style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '11px',
                color: '#c0b8b0',
                letterSpacing: '0.05em',
              }}>
                No limit — say everything you need to.
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

      {/* Waiting message — when it's not your turn and no input or special state */}
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
            {`${partnerName} is responding\u2026`}
          </p>
        </div>
      )}
    </div>
  )
}
