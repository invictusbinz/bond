// POST /api/synthesize
// Called by the session page when it detects status = 'synthesis_generating'.
// Reads both people's intakes, generates a 4-section synthesis via Claude,
// saves it to synthesis_outputs, and advances session status to 'synthesis_ready'.
//
// Idempotent: if synthesis already exists for this session, skips generation
// and just ensures status is set to synthesis_ready.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SYNTHESIS_SYSTEM_PROMPT = `You are Bond — a compassionate, perceptive presence trained in the principles of Emotionally Focused Therapy (EFT) and Nonviolent Communication (NVC). You help two people see themselves and each other more clearly.

You have just read both people's intake conversations in full. Your job is to write two separate, personalized synthesis views — one for each person. Each view is addressed directly to that person in second person. Each opens by validating their own experience first, then gently introduces their partner's world, then names what both seem to need underneath it all, and where the friction is actually living.

CRITICAL RULES — follow every one:
- Write in warm, honest prose. No bullet points. No advice. No solutions.
- Second person ("you") when addressing the reader. "They" or "your partner" for the other person.
- Never quote what either person said word for word. Reflect the emotional truth, not the words.
- Do not minimize anyone's pain. Do not amplify fear or catastrophize.
- Do not take sides. Hold both people with equal care.
- Do not draw conclusions about anyone's character or intentions.
- Be specific to what they actually shared — not generic. Earn the recognition.
- Paragraphs flow naturally into each other — no section headers, no numbered lists.

STRUCTURE of each view (4 paragraphs, flowing):
1. Opening (2–3 sentences): What this person is carrying — their emotional experience, what feels true for them, what's been weighing on them.
2. Their need (1–2 sentences): What they seem to genuinely want or need underneath their position — name the feeling-need, not a demand.
3. Their partner's world (2–3 sentences): What their partner seems to be carrying, introduced with care. Acknowledge that two realities can exist at once.
4. Shared ground and friction (2–3 sentences): What both people seem to long for underneath it all. Then, where they keep not quite meeting — the gap, the pattern, the thing that gets in the way.

Target ~220 words per view. Paragraphs separated by \\n\\n inside the JSON string.

Return only valid JSON with exactly this structure — no preamble, no commentary:
{
  "a_view": "The full personalized synthesis for Person A, paragraphs separated by \\n\\n",
  "b_view": "The full personalized synthesis for Person B, paragraphs separated by \\n\\n"
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

    // ── Verify token belongs to this session ────────────────────────────────
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('id, status, person_a_token, person_b_token')
      .eq('id', sessionId)
      .single()

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found.' }, { status: 404 })
    }

    if (token !== session.person_a_token && token !== session.person_b_token) {
      return NextResponse.json({ error: 'Invalid token.' }, { status: 403 })
    }

    // ── Idempotency: if synthesis already exists, skip generation ───────────
    const { data: existing } = await supabase
      .from('synthesis_outputs')
      .select('id')
      .eq('session_id', sessionId)
      .eq('version', 1)
      .single()

    if (existing) {
      // Synthesis already generated — just make sure status is correct
      await supabase
        .from('sessions')
        .update({ status: 'synthesis_ready' })
        .eq('id', sessionId)
      return NextResponse.json({ ok: true, skipped: true })
    }

    // ── Fetch both intakes ──────────────────────────────────────────────────
    const { data: intakes, error: intakeError } = await supabase
      .from('intake_responses')
      .select('person, messages')
      .eq('session_id', sessionId)

    if (intakeError || !intakes || intakes.length < 2) {
      return NextResponse.json(
        { error: 'Both intakes must be complete before synthesis.' },
        { status: 422 }
      )
    }

    const intakeA = intakes.find(r => r.person === 'a')
    const intakeB = intakes.find(r => r.person === 'b')

    if (!intakeA || !intakeB) {
      return NextResponse.json(
        { error: 'Could not find intakes for both people.' },
        { status: 422 }
      )
    }

    // ── Format intake messages for the AI ──────────────────────────────────
    function formatIntake(messages: { role: string; text: string }[], label: string): string {
      const turns = messages
        .map(m => `${m.role === 'user' ? label : 'Bond'}: ${m.text}`)
        .join('\n\n')
      return turns
    }

    const intakeAText = formatIntake(intakeA.messages, 'Person A')
    const intakeBText = formatIntake(intakeB.messages, 'Person B')

    const userPrompt = `Here are both intake conversations:

─── PERSON A'S INTAKE ───
${intakeAText}

─── PERSON B'S INTAKE ───
${intakeBText}

Now write the synthesis. Return only valid JSON — no preamble, no commentary.`

    // ── Generate synthesis via Claude ───────────────────────────────────────
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
        system: SYNTHESIS_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text()
      console.error('Anthropic API error:', errorText)
      throw new Error(`Anthropic API error: ${apiResponse.status}`)
    }

    const result = await apiResponse.json()
    const rawText: string = result.content?.[0]?.text ?? ''

    // Parse the JSON — strip any markdown fences if present
    let synthesisContent: Record<string, string>
    try {
      const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      synthesisContent = JSON.parse(cleaned)
    } catch {
      console.error('Synthesis JSON parse error. Raw:', rawText)
      return NextResponse.json({ error: 'Synthesis generation failed — unexpected format.' }, { status: 500 })
    }

    // Validate both personalized views exist
    if (!synthesisContent.a_view || !synthesisContent.b_view) {
      console.error('Synthesis missing a_view or b_view. Keys found:', Object.keys(synthesisContent))
      return NextResponse.json({ error: 'Synthesis generation failed — missing personalized views.' }, { status: 500 })
    }

    // ── Save synthesis to Supabase ──────────────────────────────────────────
    const { error: saveError } = await supabase
      .from('synthesis_outputs')
      .insert({
        session_id: sessionId,
        version: 1,
        content: synthesisContent,
      })

    if (saveError) {
      console.error('Synthesis save error:', saveError)
      return NextResponse.json({ error: 'Could not save synthesis.' }, { status: 500 })
    }

    // ── Advance session status ──────────────────────────────────────────────
    await supabase
      .from('sessions')
      .update({ status: 'synthesis_ready' })
      .eq('id', sessionId)

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('POST /api/synthesize error:', error)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
