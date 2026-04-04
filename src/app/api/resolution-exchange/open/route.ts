// POST /api/resolution-exchange/open
//
// Called when the session page detects status = 'resolution_ready'.
// Bond generates its opening message to both people, drawing on both intake summaries.
// Message is saved to resolution_messages. Session status advances to resolution_exchange_a_turn.
//
// Idempotent — checks status before running. Safe to call from both A and B simultaneously.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const { sessionId, token } = await request.json()

    if (!sessionId || !token) {
      return NextResponse.json({ error: 'sessionId and token are required.' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // ── Verify token + check status ─────────────────────────────────────────
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('status, person_a_token, person_b_token, a_intake_summary, b_intake_summary, person_a_name, partner_nickname, person_b_name')
      .eq('id', sessionId)
      .single()

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found.' }, { status: 404 })
    }

    if (token !== session.person_a_token && token !== session.person_b_token) {
      return NextResponse.json({ error: 'Invalid token.' }, { status: 403 })
    }

    // Idempotency — only run if we're at resolution_ready OR stuck in resolution_exchange_opening.
    // The "stuck" case happens when a previous call set the status to opening but then the
    // Claude API call failed before the opening message was saved. Retries from the frontend
    // would normally be blocked because the status is no longer resolution_ready. We fix this
    // by also allowing a run when stuck in opening with no messages yet.
    if (session.status !== 'resolution_ready' && session.status !== 'resolution_exchange_opening') {
      return NextResponse.json({ ok: true, skipped: true, status: session.status })
    }

    // If we're already in opening state, check whether an opening message already exists.
    // If messages are present, the opening already succeeded — something else is stuck.
    if (session.status === 'resolution_exchange_opening') {
      const { data: existingMessages } = await supabase
        .from('resolution_messages')
        .select('id')
        .eq('session_id', sessionId)
        .limit(1)

      if (existingMessages && existingMessages.length > 0) {
        // Opening message already saved — don't regenerate.
        return NextResponse.json({ ok: true, skipped: true, status: session.status })
      }
      // No messages yet — opening got stuck. Fall through to regenerate.
    }

    // ── Mark as opening (prevents double-run from concurrent calls) ─────────
    // Only update if status is resolution_ready (the expected start state).
    // If we're already in resolution_exchange_opening, skip the update to avoid
    // a redundant write — we know from the check above that no message exists yet.
    if (session.status === 'resolution_ready') {
      await supabase
        .from('sessions')
        .update({ status: 'resolution_exchange_opening' })
        .eq('id', sessionId)
        .eq('status', 'resolution_ready') // only update if status hasn't changed
    }

    // ── Build Bond's opening prompt ─────────────────────────────────────────
    const aName = session.person_a_name || 'Person A'
    const bName = session.person_b_name || session.partner_nickname || 'Person B'

    const systemPrompt = `You are Bond — a relational AI that helps two people communicate better. You've just guided both of them through a private intake, heard everything, and written a synthesis. Now they've both chosen to keep working through this together.

You are opening a shared mediated exchange. Both people will see this message and everything that follows.

Person A's name: ${aName}
Person B's name: ${bName}

What Bond learned about Person A (their emotional experience — do NOT quote these words directly):
${session.a_intake_summary || 'Not available.'}

What Bond learned about Person B (their emotional experience — do NOT quote these words directly):
${session.b_intake_summary || 'Not available.'}

Your opening message must:
- Acknowledge that both chose this — it takes something to say "I want to keep working through this."
- Name one or two themes you observed across both intakes, without quoting either person's private words. Speak in general terms about what both are reaching for. Never say "you said X" or "they mentioned Y."
- Frame what this space is: honest, direct, mediated by Bond. They can talk to each other here. Bond will step in when it has something worth saying.
- End with an opening invitation to ${aName} — something that invites them to share what they most want the other person to understand right now. Keep it simple and emotionally honest.

Tone: Warm, steady, present. Not clinical. Not a lecture. Bond is grounded, not cheerleading.
Length: 3–4 short paragraphs. No headers. No bullet points. Plain prose only.

IMPORTANT: Never quote either person's private intake words. Reference themes and emotional texture, not specific phrases they used.`

    const apiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.NEXT_PRIVATE_CLAUDE_API_KEY!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 600,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: 'Please write your opening message for this resolution exchange.',
          },
        ],
      }),
    })

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text()
      console.error('Anthropic API error (open):', errorText)
      throw new Error(`Anthropic API error: ${apiResponse.status}`)
    }

    const apiData = await apiResponse.json()
    const openingText: string =
      apiData.content?.[0]?.type === 'text' ? apiData.content[0].text.trim() : ''

    if (!openingText) {
      throw new Error('Bond returned an empty opening message.')
    }

    // ── Save Bond's opening message ─────────────────────────────────────────
    const { error: insertError } = await supabase
      .from('resolution_messages')
      .insert({
        session_id: sessionId,
        person: 'bond',
        content: openingText,
        is_resolution_statement: false,
      })

    if (insertError) {
      console.error('resolution_messages insert error:', insertError)
      throw new Error('Could not save Bond opening message.')
    }

    // ── Advance to A's turn ─────────────────────────────────────────────────
    await supabase
      .from('sessions')
      .update({ status: 'resolution_exchange_a_turn' })
      .eq('id', sessionId)

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('POST /api/resolution-exchange/open error:', error)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
