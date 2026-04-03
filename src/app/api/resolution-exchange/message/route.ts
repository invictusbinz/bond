// POST /api/resolution-exchange/message
//
// Called when a person sends a message in the resolution exchange.
// Saves their message to resolution_messages, then calls Bond to generate a response.
// Bond's response is saved. Session status advances to the next person's turn,
// or to resolution_statement_proposed if Bond decides it's time to close.
//
// Request body:
//   sessionId: string
//   token: string
//   content: string  — the person's message text

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const { sessionId, token, content } = await request.json()

    if (!sessionId || !token || !content?.trim()) {
      return NextResponse.json({ error: 'sessionId, token, and content are required.' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // ── Verify token + determine who is sending ─────────────────────────────
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('status, person_a_token, person_b_token, a_intake_summary, b_intake_summary, person_a_name, partner_nickname, person_b_name')
      .eq('id', sessionId)
      .single()

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found.' }, { status: 404 })
    }

    const isPersonA = token === session.person_a_token
    const isPersonB = token === session.person_b_token

    if (!isPersonA && !isPersonB) {
      return NextResponse.json({ error: 'Invalid token.' }, { status: 403 })
    }

    const sender = isPersonA ? 'a' : 'b'

    // ── Validate it's actually this person's turn ───────────────────────────
    const expectedStatus = sender === 'a'
      ? 'resolution_exchange_a_turn'
      : 'resolution_exchange_b_turn'

    if (session.status !== expectedStatus) {
      return NextResponse.json({
        error: "It's not your turn.",
        currentStatus: session.status,
      }, { status: 409 })
    }

    // ── Save this person's message ──────────────────────────────────────────
    const { error: msgError } = await supabase
      .from('resolution_messages')
      .insert({
        session_id: sessionId,
        person: sender,
        content: content.trim(),
        is_resolution_statement: false,
      })

    if (msgError) {
      console.error('resolution_messages insert error (person message):', msgError)
      throw new Error('Could not save your message.')
    }

    // ── Mark Bond as responding ─────────────────────────────────────────────
    await supabase
      .from('sessions')
      .update({ status: 'resolution_exchange_bond_turn' })
      .eq('id', sessionId)

    // ── Load full exchange history ──────────────────────────────────────────
    const { data: allMessages } = await supabase
      .from('resolution_messages')
      .select('person, content, is_resolution_statement, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })

    // Calculate round count: number of complete A+B message pairs (excluding Bond's messages and opening)
    const personMessages = (allMessages || []).filter(m => m.person === 'a' || m.person === 'b')
    // After saving this message, count how many of each person we have
    const aCount = personMessages.filter(m => m.person === 'a').length
    const bCount = personMessages.filter(m => m.person === 'b').length
    // A round is complete when both A and B have sent at least that many messages
    const roundCount = Math.min(aCount, bCount)

    // Build the exchange history as a readable string for Bond
    const aName = session.person_a_name || 'Person A'
    const bName = session.person_b_name || session.partner_nickname || 'Person B'

    const historyText = (allMessages || [])
      .map(m => {
        if (m.person === 'bond') return `Bond: ${m.content}`
        if (m.person === 'a') return `${aName}: ${m.content}`
        return `${bName}: ${m.content}`
      })
      .join('\n\n')

    // ── Build Bond's response prompt ────────────────────────────────────────
    const systemPrompt = `You are Bond — a relational AI mediating a conversation between two people. You've guided them through private intakes, written a synthesis, and now you're present in a shared mediated exchange. Both people can see each other's messages and yours.

Person A's name: ${aName}
Person B's name: ${bName}
Current round: ${roundCount} (number of complete back-and-forth pairs so far)

What Bond learned about ${aName} (their emotional experience — do NOT quote these words directly):
${session.a_intake_summary || 'Not available.'}

What Bond learned about ${bName} (their emotional experience — do NOT quote these words directly):
${session.b_intake_summary || 'Not available.'}

The exchange so far:
${historyText}

WHAT BOND DOES IN ITS TURNS:
1. Acknowledge what was just said — briefly. Don't repeat it back. Just signal you heard it.
2. Do one of the following (read the room):
   - Reframe: something was said in a way that might close the other person down. Offer a softer version.
   - Surface a pattern: something from the intakes is showing up now. Name it without attribution.
   - Ask a question: open, not leading. Directed at one or both people.
   - Offer a bridge: both people are reaching for the same thing differently. Name that.
   - Hold space: sometimes a short acknowledgment and permission to sit with it is right.
3. When to propose the Resolution Statement:
   - After round 3 or later: if there's been acknowledgment, softening, or convergence — propose it.
   - At round 6 or later: always propose, regardless of where things stand.
   - If things feel stuck or escalating: name it and propose.

WHAT BOND DOES NOT DO:
- Does not take sides or assign blame.
- Does not quote either person's intake words. Ever.
- Does not diagnose or use therapy-speak clichés.
- Does not rush toward the Resolution Statement before real exchange has happened.

If proposing a Resolution Statement, the statement must be:
- 2–3 sentences. Forward-looking. Not a verdict.
- Written in second person: "You both..." or "Between the two of you..."
- Captures the shared ground that emerged — even if small.
- After stating it, ask both people if this feels right.

OUTPUT FORMAT — return valid JSON only, no extra text:
{
  "response": "Bond's message text here",
  "should_propose": false,
  "resolution_statement": null
}

OR if proposing a Resolution Statement:
{
  "response": "Bond's bridging message before presenting the statement",
  "should_propose": true,
  "resolution_statement": "2–3 sentence Resolution Statement here"
}

Tone: Present, warm, direct. Never preachy. Never clinical. Bond knows these two people.`

    const bondApiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.NEXT_PRIVATE_CLAUDE_API_KEY!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 700,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: 'Please respond to the latest message in the exchange.',
          },
        ],
      }),
    })

    if (!bondApiResponse.ok) {
      const errorText = await bondApiResponse.text()
      console.error('Anthropic API error (message):', errorText)
      throw new Error(`Anthropic API error: ${bondApiResponse.status}`)
    }

    const bondApiData = await bondApiResponse.json()
    const rawText: string =
      bondApiData.content?.[0]?.type === 'text' ? bondApiData.content[0].text.trim() : ''

    // ── Parse Bond's JSON response ──────────────────────────────────────────
    let parsed: {
      response: string
      should_propose: boolean
      resolution_statement: string | null
    }

    try {
      // Strip markdown code fences if present
      const clean = rawText.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim()
      parsed = JSON.parse(clean)
    } catch {
      // If JSON parse fails, treat the whole thing as Bond's message text, no proposal
      console.error('Bond JSON parse failed — falling back to plain text:', rawText)
      parsed = {
        response: rawText || "Bond is processing what was shared.",
        should_propose: false,
        resolution_statement: null,
      }
    }

    // ── Save Bond's response ────────────────────────────────────────────────
    const { error: bondMsgError } = await supabase
      .from('resolution_messages')
      .insert({
        session_id: sessionId,
        person: 'bond',
        content: parsed.response,
        is_resolution_statement: false,
      })

    if (bondMsgError) {
      console.error('resolution_messages insert error (bond response):', bondMsgError)
      throw new Error('Could not save Bond response.')
    }

    // ── If Bond is proposing a Resolution Statement ─────────────────────────
    if (parsed.should_propose && parsed.resolution_statement) {
      // Save the Resolution Statement as a special Bond message
      const { error: stmtError } = await supabase
        .from('resolution_messages')
        .insert({
          session_id: sessionId,
          person: 'bond',
          content: parsed.resolution_statement,
          is_resolution_statement: true,
        })

      if (stmtError) {
        console.error('resolution_messages insert error (resolution statement):', stmtError)
        throw new Error('Could not save Resolution Statement.')
      }

      // Advance to statement proposed — both people will see it and confirm
      await supabase
        .from('sessions')
        .update({ status: 'resolution_statement_proposed' })
        .eq('id', sessionId)

      return NextResponse.json({ ok: true, action: 'resolution_statement_proposed' })
    }

    // ── Normal turn: advance to the other person's turn ─────────────────────
    // After A sends → Bond responds → it's B's turn. After B sends → it's A's turn.
    const nextTurn = sender === 'a'
      ? 'resolution_exchange_b_turn'
      : 'resolution_exchange_a_turn'

    await supabase
      .from('sessions')
      .update({ status: nextTurn })
      .eq('id', sessionId)

    return NextResponse.json({ ok: true, action: nextTurn })
  } catch (error) {
    console.error('POST /api/resolution-exchange/message error:', error)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
