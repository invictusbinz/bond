// POST /api/debrief
// Called when a person taps "See your private reflection" on the ClosingScreen.
// Reads their intake, their synthesis view, and their resolution commitment,
// then generates a private per-person coaching reflection via Claude.
//
// Private: Bond generates a different debrief for each person.
// Nothing is shared with the partner.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const DEBRIEF_SYSTEM_PROMPT = `You are Bond — a compassionate, perceptive presence trained in the principles of Emotionally Focused Therapy (EFT) and Nonviolent Communication (NVC).

A two-person session has just closed. You are writing a private, personal debrief for one of the participants — addressed directly to them. They will be the only person who sees this. Their partner receives a completely separate, different debrief.

You have access to:
- What this person shared during their intake (their raw, private experience)
- The synthesis Bond wrote specifically for them during the session
- The commitment or intention they shared in their resolution step

Your task is to write 3 short paragraphs of private coaching — not a summary, not a repeat of the synthesis. This is Bond reflecting back what it noticed about this person specifically: how they show up in hard conversations, what their patterns might be, what's worth carrying forward.

STRUCTURE (3 paragraphs):

Paragraph 1 — What Bond noticed:
What did you observe about how this person communicates under stress? What patterns showed up — in how they describe their experience, what they reach for, what they protect? Be specific and compassionate, not clinical. You're reflecting, not diagnosing.

Paragraph 2 — What's worth carrying:
What insight, shift, or moment from this session is genuinely worth holding onto? What did this person seem to touch that was real and true — something that might serve them beyond this conversation?

Paragraph 3 — One thing to try:
One concrete, practical thing to stay aware of or try differently — in how they communicate, how they listen, how they show up. Ground it in something specific they actually shared, not generic advice. Keep it small and doable, not overwhelming.

RULES:
- Written in second person, warm and direct: "You tend to...", "What showed up for you was...", "Something worth carrying..."
- ~60–80 words per paragraph. 3 paragraphs total.
- No headers, no bullet points, no numbered lists.
- Never mention the other person by name or describe what they shared — this is fully private.
- Never repeat lines verbatim from the synthesis. This should feel like a different kind of reflection — more personal, more forward-looking.
- Do not be generic. Every sentence should feel specific to this person and what they actually shared.
- End on something true and warm — not falsely optimistic, not heavy.`

export async function POST(request: NextRequest) {
  try {
    const { sessionId, token } = await request.json()

    if (!sessionId || !token) {
      return NextResponse.json({ error: 'Missing sessionId or token' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // ── Identify person from token ────────────────────────────────────────────
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('status, person_a_token, person_b_token, mode')
      .eq('id', sessionId)
      .single()

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const person = token === session.person_a_token ? 'a'
                 : token === session.person_b_token ? 'b'
                 : null

    if (!person) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 403 })
    }

    // ── Fetch this person's intake ────────────────────────────────────────────
    const { data: intakeData } = await supabase
      .from('intake_responses')
      .select('messages')
      .eq('session_id', sessionId)
      .eq('person', person)
      .maybeSingle()

    const intakeMessages = (intakeData?.messages ?? []) as Array<{ role: 'ai' | 'user'; text: string }>
    const intakeUserLines = intakeMessages
      .filter(m => m.role === 'user')
      .map(m => m.text)
      .join('\n\n')

    // ── Fetch synthesis (their personalized view) ─────────────────────────────
    const { data: synthesisData } = await supabase
      .from('synthesis_outputs')
      .select('content')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const synthesisContent = synthesisData?.content as Record<string, string> | null
    const myView = synthesisContent
      ? (person === 'a' ? synthesisContent.a_view : synthesisContent.b_view) ?? ''
      : ''

    // ── Fetch their resolution commitment ─────────────────────────────────────
    const { data: resolutionData } = await supabase
      .from('session_responses')
      .select('response')
      .eq('session_id', sessionId)
      .eq('person', person)
      .eq('step', 'resolution')
      .maybeSingle()

    const resolutionText = resolutionData?.response ?? ''

    // ── Build prompt ──────────────────────────────────────────────────────────
    const userContent = [
      `WHAT THIS PERSON SHARED DURING THEIR INTAKE:\n${intakeUserLines || '(No intake data available)'}`,
      myView ? `WHAT BOND SAW IN THEM (their synthesis view):\n${myView}` : '',
      resolutionText ? `WHAT THEY COMMITTED TO IN THE RESOLUTION STEP:\n${resolutionText}` : '',
      `Write their private debrief now.`,
    ].filter(Boolean).join('\n\n---\n\n')

    // ── Call Claude ───────────────────────────────────────────────────────────
    const apiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.NEXT_PRIVATE_CLAUDE_API_KEY!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        system: DEBRIEF_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userContent }],
      }),
    })

    if (!apiResponse.ok) {
      const errText = await apiResponse.text()
      console.error('Anthropic error in debrief:', errText)
      return NextResponse.json({ error: 'Generation failed' }, { status: 500 })
    }

    const result = await apiResponse.json()
    const debrief: string = result.content?.[0]?.text ?? ''

    if (!debrief) {
      return NextResponse.json({ error: 'Empty debrief returned' }, { status: 500 })
    }

    return NextResponse.json({ debrief })

  } catch (error) {
    console.error('Debrief route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
