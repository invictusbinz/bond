// POST /api/post-synthesis
// Called by the session page when status = 'both_responded_synthesis'.
// Reads both people's synthesis accuracy responses, then decides:
//   - Both said 'yes'           → status: 'checkpoint_ready'
//   - One or both said partial/no → generate revised synthesis (version 2),
//                                   status: 'synthesis_revised', then 'checkpoint_ready'
//
// Max one revision — after the revised synthesis, we always move to checkpoint
// regardless of what people say. This prevents infinite loops.
//
// Idempotent: safe to call multiple times — checks current status before acting.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const REVISION_SYSTEM_PROMPT = `You are Bond — a thoughtful, neutral presence that helps two people understand each other more clearly.

You previously wrote a synthesis for two people after reading their intakes. One or both of them felt it didn't quite land — they gave you feedback on what was missing or inaccurate.

Your job now is to write a revised synthesis that incorporates their feedback while staying neutral and fair to both people.

Same structure as before — four sections. Return valid JSON only:

{
  "carrying_a": "2-3 sentences. What Person A seems to be carrying.",
  "carrying_b": "2-3 sentences. What Person B seems to be carrying.",
  "underneath": "2-3 sentences. What both seem to want, underneath it all.",
  "friction": "2-3 sentences. Where the friction is actually living."
}

Write with warmth and precision. Use the feedback to go deeper, not just to restate. Return only valid JSON — no preamble.`

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

    // ── Verify token ────────────────────────────────────────────────────────
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('status, person_a_token, person_b_token')
      .eq('id', sessionId)
      .single()

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found.' }, { status: 404 })
    }

    if (token !== session.person_a_token && token !== session.person_b_token) {
      return NextResponse.json({ error: 'Invalid token.' }, { status: 403 })
    }

    // ── Idempotency: only act from both_responded_synthesis ─────────────────
    if (session.status !== 'both_responded_synthesis') {
      return NextResponse.json({ ok: true, skipped: true, status: session.status })
    }

    // ── Read both synthesis accuracy responses ──────────────────────────────
    const { data: responses } = await supabase
      .from('session_responses')
      .select('person, response')
      .eq('session_id', sessionId)
      .eq('step', 'synthesis_accuracy')

    const responseA = responses?.find(r => r.person === 'a')?.response
    const responseB = responses?.find(r => r.person === 'b')?.response

    const choiceA: string = responseA?.choice ?? 'yes'
    const choiceB: string = responseB?.choice ?? 'yes'
    const needsRevision = choiceA !== 'yes' || choiceB !== 'yes'

    // ── Both said yes — skip straight to checkpoint ─────────────────────────
    if (!needsRevision) {
      await supabase
        .from('sessions')
        .update({ status: 'checkpoint_ready' })
        .eq('id', sessionId)

      return NextResponse.json({ ok: true, action: 'checkpoint' })
    }

    // ── One or both need revision ───────────────────────────────────────────
    // Set to synthesis_revising so both people see the revising screen
    await supabase
      .from('sessions')
      .update({ status: 'synthesis_revising' })
      .eq('id', sessionId)

    // Fetch original synthesis
    const { data: originalSynthesis } = await supabase
      .from('synthesis_outputs')
      .select('content')
      .eq('session_id', sessionId)
      .eq('version', 1)
      .single()

    // Fetch original intakes for context
    const { data: intakes } = await supabase
      .from('intake_responses')
      .select('person, messages')
      .eq('session_id', sessionId)

    const intakeA = intakes?.find(r => r.person === 'a')
    const intakeB = intakes?.find(r => r.person === 'b')

    function formatIntake(messages: { role: string; text: string }[], label: string): string {
      return messages
        .map(m => `${m.role === 'user' ? label : 'Bond'}: ${m.text}`)
        .join('\n\n')
    }

    // Build feedback summary
    const feedbackLines: string[] = []
    if (choiceA !== 'yes') {
      feedbackLines.push(`Person A said "${choiceA}"${responseA?.context ? `: "${responseA.context}"` : '.'}`)
    }
    if (choiceB !== 'yes') {
      feedbackLines.push(`Person B said "${choiceB}"${responseB?.context ? `: "${responseB.context}"` : '.'}`)
    }

    const userPrompt = `Here is the original synthesis you wrote:
${JSON.stringify(originalSynthesis?.content, null, 2)}

Feedback from the people:
${feedbackLines.join('\n')}

Here are the original intake conversations for reference:

─── PERSON A'S INTAKE ───
${intakeA ? formatIntake(intakeA.messages, 'Person A') : '(not available)'}

─── PERSON B'S INTAKE ───
${intakeB ? formatIntake(intakeB.messages, 'Person B') : '(not available)'}

Now write the revised synthesis incorporating their feedback. Return only valid JSON.`

    // ── Generate revised synthesis ──────────────────────────────────────────
    const apiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.NEXT_PRIVATE_CLAUDE_API_KEY!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: REVISION_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    if (!apiResponse.ok) {
      throw new Error(`Anthropic API error: ${apiResponse.status}`)
    }

    const result = await apiResponse.json()
    const rawText: string = result.content?.[0]?.text ?? ''

    let revisedContent: Record<string, string>
    try {
      const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      revisedContent = JSON.parse(cleaned)
    } catch {
      console.error('Revised synthesis parse error. Raw:', rawText)
      // If revision fails, just move to checkpoint with original synthesis
      await supabase
        .from('sessions')
        .update({ status: 'checkpoint_ready' })
        .eq('id', sessionId)
      return NextResponse.json({ ok: true, action: 'checkpoint', fallback: true })
    }

    // ── Save revised synthesis as version 2 ─────────────────────────────────
    await supabase
      .from('synthesis_outputs')
      .insert({
        session_id: sessionId,
        version: 2,
        content: revisedContent,
      })

    // ── Set status to synthesis_revised ────────────────────────────────────
    // Both people will see the revised synthesis and respond once more.
    // After both respond again → status goes straight to checkpoint_ready
    // (handled in /api/session-response — after both respond to synthesis_accuracy_v2).
    await supabase
      .from('sessions')
      .update({ status: 'synthesis_revised' })
      .eq('id', sessionId)

    return NextResponse.json({ ok: true, action: 'revised' })
  } catch (error) {
    console.error('POST /api/post-synthesis error:', error)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
