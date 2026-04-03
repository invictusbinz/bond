// POST /api/resolution-exchange/revise
//
// Called when a person indicates the Resolution Statement is missing something.
// Takes their feedback, calls Bond to generate a revised statement, updates the
// statement in-place, resets any existing confirmations, and returns status to
// resolution_statement_proposed so both people re-confirm the new version.
//
// One revision max — enforced via a session_responses row with step: 'resolution_revised'.
// Only valid when status === 'resolution_statement_proposed' (neither has confirmed yet).
//
// Request body:
//   sessionId: string
//   token: string
//   feedback: string  — what the person says is missing or wrong

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const { sessionId, token, feedback } = await request.json()

    if (!sessionId || !token || !feedback?.trim()) {
      return NextResponse.json(
        { error: 'sessionId, token, and feedback are required.' },
        { status: 400 }
      )
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // ── Verify token + determine who is requesting revision ─────────────────
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select(
        'status, person_a_token, person_b_token, a_intake_summary, b_intake_summary, person_a_name, person_b_name, partner_nickname'
      )
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

    // ── Only valid when statement has been proposed, neither has confirmed ───
    if (session.status !== 'resolution_statement_proposed') {
      return NextResponse.json(
        { error: 'Revision is no longer available — someone has already confirmed.' },
        { status: 409 }
      )
    }

    // ── One revision max — check if already revised ──────────────────────────
    const { data: existingRevision } = await supabase
      .from('session_responses')
      .select('id')
      .eq('session_id', sessionId)
      .eq('step', 'resolution_revised')
      .maybeSingle()

    if (existingRevision) {
      return NextResponse.json(
        { error: 'This statement has already been revised once.' },
        { status: 409 }
      )
    }

    // ── Find the existing Resolution Statement ───────────────────────────────
    const { data: statementRow, error: stmtFetchError } = await supabase
      .from('resolution_messages')
      .select('id, content')
      .eq('session_id', sessionId)
      .eq('is_resolution_statement', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (stmtFetchError || !statementRow) {
      return NextResponse.json({ error: 'Resolution Statement not found.' }, { status: 404 })
    }

    // ── Load exchange history for Bond context ───────────────────────────────
    const { data: allMessages } = await supabase
      .from('resolution_messages')
      .select('person, content, is_resolution_statement')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })

    const aName = session.person_a_name || 'Person A'
    const bName = session.person_b_name || session.partner_nickname || 'Person B'

    const historyText = (allMessages || [])
      .filter(m => !m.is_resolution_statement) // exclude the statement card from history
      .map(m => {
        if (m.person === 'bond') return `Bond: ${m.content}`
        if (m.person === 'a') return `${aName}: ${m.content}`
        return `${bName}: ${m.content}`
      })
      .join('\n\n')

    const person = isPersonA ? 'a' : 'b'
    const personName = isPersonA ? aName : bName

    // ── Call Bond to revise the statement ────────────────────────────────────
    const systemPrompt = `You are Bond — a relational AI. You've mediated a shared conversation between two people and proposed a Resolution Statement. One person says something is missing or not quite right.

Your job: revise the Resolution Statement based on their feedback, while keeping it grounded in what actually emerged from the exchange.

The exchange between ${aName} and ${bName}:
${historyText}

What Bond learned about ${aName} (do NOT quote these words directly):
${session.a_intake_summary || 'Not available.'}

What Bond learned about ${bName} (do NOT quote these words directly):
${session.b_intake_summary || 'Not available.'}

The current Resolution Statement:
"${statementRow.content}"

${personName}'s feedback — what they say is missing or not right:
"${feedback.trim()}"

Write a revised Resolution Statement that:
- Incorporates their feedback while staying true to what both people actually shared
- Remains 2–3 sentences, forward-looking, not a verdict
- Is written in second person: "You both..." or "Between the two of you..."
- Captures shared ground — even if small
- Does not take this one person's side over the other's

Return valid JSON only — no extra text, no preamble:
{ "resolution_statement": "Revised statement here" }`

    const bondApiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.NEXT_PRIVATE_CLAUDE_API_KEY!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 300,
        system: systemPrompt,
        messages: [{ role: 'user', content: 'Please revise the Resolution Statement.' }],
      }),
    })

    if (!bondApiResponse.ok) {
      const errorText = await bondApiResponse.text()
      console.error('Anthropic API error (revise):', errorText)
      throw new Error(`Anthropic API error: ${bondApiResponse.status}`)
    }

    const bondApiData = await bondApiResponse.json()
    const rawText: string =
      bondApiData.content?.[0]?.type === 'text' ? bondApiData.content[0].text.trim() : ''

    let revisedStatement: string

    try {
      const clean = rawText.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim()
      const parsed = JSON.parse(clean)
      revisedStatement = parsed.resolution_statement
    } catch {
      console.error('Bond revision JSON parse failed — using raw text:', rawText)
      revisedStatement = rawText || statementRow.content // fallback to original
    }

    if (!revisedStatement?.trim()) {
      throw new Error('Bond returned an empty revised statement.')
    }

    // ── Update the existing statement in-place ───────────────────────────────
    const { error: updateError } = await supabase
      .from('resolution_messages')
      .update({ content: revisedStatement.trim() })
      .eq('id', statementRow.id)

    if (updateError) {
      console.error('resolution_messages update error:', updateError)
      throw new Error('Could not save revised statement.')
    }

    // ── Reset any existing confirmations — both must re-confirm ─────────────
    await supabase
      .from('session_responses')
      .delete()
      .eq('session_id', sessionId)
      .eq('step', 'resolution_confirm')

    // ── Record that a revision has happened (one revision max) ───────────────
    const { error: revisionRecordError } = await supabase
      .from('session_responses')
      .insert({
        session_id: sessionId,
        person,
        step: 'resolution_revised',
        response: { feedback: feedback.trim() },
      })

    if (revisionRecordError) {
      console.error('session_responses insert error (resolution_revised):', revisionRecordError)
      // Non-fatal — statement was already revised, just couldn't record it
    }

    // ── Status stays resolution_statement_proposed — both see the new statement
    // Status was already resolution_statement_proposed, no update needed.
    // But in case it drifted, explicitly set it.
    await supabase
      .from('sessions')
      .update({ status: 'resolution_statement_proposed' })
      .eq('id', sessionId)

    return NextResponse.json({ ok: true, action: 'resolution_statement_proposed', revisedStatement: revisedStatement.trim() })
  } catch (error) {
    console.error('POST /api/resolution-exchange/revise error:', error)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
