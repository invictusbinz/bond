// POST /api/synthesize
// Called by the session page when it detects status = 'synthesis_generating'.
// Reads both people's intakes, generates a 4-section synthesis via Claude,
// saves it to synthesis_outputs, and advances session status to 'synthesis_ready'.
//
// Idempotent: if synthesis already exists for this session, skips generation
// and just ensures status is set to synthesis_ready.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const SYNTHESIS_SYSTEM_PROMPT = `You are Bond — a thoughtful, neutral presence that helps two people understand each other more clearly.

You have just read both people's intake conversations in full. Your job now is to write a synthesis: a warm, honest mirror that reflects back what you see in each person, what they share underneath the surface, and where the friction is actually living.

Write in second person — address them directly. Be specific to what they actually said, not generic. Do not offer advice or solutions. Do not take sides. Do not minimize pain. Do not over-explain.

The synthesis has exactly four sections. Return your response as valid JSON with this exact structure:

{
  "carrying_a": "2-3 sentences. What Person A seems to be carrying — their emotional experience, what feels true for them, what matters most to them about this.",
  "carrying_b": "2-3 sentences. What Person B seems to be carrying — same lens, different person.",
  "underneath": "2-3 sentences. What both people seem to want underneath all of it — the shared need or longing that neither may have named directly.",
  "friction": "2-3 sentences. Where the friction is actually living — the gap, the pattern, the place they keep not quite meeting each other."
}

Write with warmth and precision. Each section should feel like something true being said out loud for the first time — not a summary, but a recognition.`

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
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    })

    const completion = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: SYNTHESIS_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const rawText = completion.content[0].type === 'text' ? completion.content[0].text : ''

    // Parse the JSON — strip any markdown fences if present
    let synthesisContent: Record<string, string>
    try {
      const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      synthesisContent = JSON.parse(cleaned)
    } catch {
      console.error('Synthesis JSON parse error. Raw:', rawText)
      return NextResponse.json({ error: 'Synthesis generation failed — unexpected format.' }, { status: 500 })
    }

    // Validate all four sections exist
    const required = ['carrying_a', 'carrying_b', 'underneath', 'friction']
    for (const key of required) {
      if (!synthesisContent[key]) {
        return NextResponse.json({ error: `Synthesis missing section: ${key}` }, { status: 500 })
      }
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
