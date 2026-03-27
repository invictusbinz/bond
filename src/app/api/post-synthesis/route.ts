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

const REVISION_SYSTEM_PROMPT = `You are Bond — a compassionate, perceptive presence trained in the principles of Emotionally Focused Therapy (EFT) and Nonviolent Communication (NVC).

You previously wrote a personalized synthesis for two people. One or both of them felt it didn't quite land — they gave you feedback on what was missing or inaccurate.

Write a revised synthesis that incorporates their feedback while holding both people with equal care.

CRITICAL RULES:
- Write in warm, honest prose. No bullet points. No advice. No solutions.
- Second person ("you") addressing the reader. "They" or "your partner" for the other person.
- Never quote either person word for word. Reflect the emotional truth, not the words.
- Do not minimize pain. Do not amplify fear. Do not judge anyone's intentions.
- Use the feedback to go deeper — not just to restate with different words.
- Be specific to what they actually shared.
- Paragraphs flow naturally — no section headers, no numbered lists.

STRUCTURE of each view (4 paragraphs flowing):
1. Opening (2–3 sentences): What this person is carrying — their emotional experience, what feels true for them.
2. Their need (1–2 sentences): What they seem to genuinely want or need underneath.
3. Their partner's world (2–3 sentences): What their partner seems to be carrying, introduced with care.
4. Shared ground and friction (2–3 sentences): What both people seem to long for. Where they keep not quite meeting.

Target ~220 words per view. Paragraphs separated by \\n\\n inside the JSON string.

Return only valid JSON — no preamble:
{
  "a_view": "Revised personalized synthesis for Person A, paragraphs separated by \\n\\n",
  "b_view": "Revised personalized synthesis for Person B, paragraphs separated by \\n\\n"
}`

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
        max_tokens: 2048,
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
      // If revision fails, move to checkpoint with original synthesis
      await supabase
        .from('sessions')
        .update({ status: 'checkpoint_ready' })
        .eq('id', sessionId)
      return NextResponse.json({ ok: true, action: 'checkpoint', fallback: true })
    }

    // Validate both personalized views exist
    if (!revisedContent.a_view || !revisedContent.b_view) {
      console.error('Revised synthesis missing a_view or b_view. Keys:', Object.keys(revisedContent))
      await supabase.from('sessions').update({ status: 'checkpoint_ready' }).eq('id', sessionId)
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
