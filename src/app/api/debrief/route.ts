// POST /api/debrief
// Called when a person taps "See your private reflection" on the ClosingScreen.
// Reads their intake, their synthesis view, and — depending on which path the session
// took — either their Phase 2 resolution exchange messages + Resolution Statement,
// or their Phase 1 private commitment. Then generates a per-person coaching reflection.
//
// Phase 2 (resolution exchange): includes what this person said in the exchange and
// the Resolution Statement. Partner messages are intentionally excluded — stays private.
// Phase 1 (old commitment step): includes their private "one thing I'll try" answer.
//
// Private: Bond generates a different debrief for each person.
// Nothing is shared with the partner.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function buildDebriefSystemPrompt(personName?: string | null): string {
  // Inject the person's name so the debrief can open or close with it naturally.
  // The partner's name is intentionally omitted — the debrief is fully private.
  const nameContext = personName
    ? `\n[NAME CONTEXT: You are writing to ${personName}. You may use their name once, naturally — at the start or somewhere it feels warm. Do not repeat it more than once.]\n`
    : ''

  return `You are Bond — a compassionate, perceptive presence trained in the principles of Emotionally Focused Therapy (EFT) and Nonviolent Communication (NVC).
${nameContext}
A two-person session has just closed. You are writing a private, personal debrief for one of the participants — addressed directly to them. They will be the only person who sees this. Their partner receives a completely separate, different debrief.

You have access to:
- What this person shared during their intake (their raw, private experience)
- The synthesis Bond wrote specifically for them during the session
- Depending on how far the session went, one of the following:
    a) What they said in the shared resolution exchange, and the Resolution Statement both people agreed to (if the session went through Phase 2 — a Bond-mediated conversation)
    b) The private commitment or intention they shared in their resolution step (if the session ended at Phase 1)

Your task is to write 3 short paragraphs of private coaching — not a summary, not a repeat of the synthesis. This is Bond reflecting back what it noticed about this person specifically: how they show up in hard conversations, what their patterns might be, what's worth carrying forward. If a resolution exchange happened, draw on how this person showed up in that conversation — what they chose to say, how they engaged, what they reached for.

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
}

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
      .select('status, person_a_token, person_b_token, mode, person_a_name, person_b_name')
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

    // Resolve this person's name for the debrief — never pass the partner's name
    const personName = person === 'a' ? (session.person_a_name ?? null) : (session.person_b_name ?? null)

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

    // ── Fetch their resolution commitment (Phase 1 path) ─────────────────────
    // Only populated for sessions that went through the old private commitment step.
    // For Phase 2 sessions (resolution exchange), this will be empty — handled below.
    const { data: resolutionData } = await supabase
      .from('session_responses')
      .select('response')
      .eq('session_id', sessionId)
      .eq('person', person)
      .eq('step', 'resolution')
      .maybeSingle()

    const resolutionText = resolutionData?.response?.commitment ?? ''

    // ── Fetch resolution exchange messages (Phase 2 path) ─────────────────────
    // Only present if the session went through the Bond-mediated resolution exchange.
    // We pull:
    //   - this person's own messages only (partner messages stay private)
    //   - the Resolution Statement (is_resolution_statement: true)
    const { data: resolutionMessages } = await supabase
      .from('resolution_messages')
      .select('person, content, is_resolution_statement')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })

    // This person's messages from the exchange (what they actually said)
    const myExchangeMessages = (resolutionMessages || [])
      .filter(m => m.person === person && !m.is_resolution_statement)
      .map(m => m.content)
      .join('\n\n')

    // The Resolution Statement both people agreed to
    const resolutionStatement = (resolutionMessages || [])
      .find(m => m.is_resolution_statement)?.content ?? ''

    // ── Build prompt ──────────────────────────────────────────────────────────
    const userContent = [
      `WHAT THIS PERSON SHARED DURING THEIR INTAKE:\n${intakeUserLines || '(No intake data available)'}`,
      myView ? `WHAT BOND SAW IN THEM (their synthesis view):\n${myView}` : '',
      // Phase 2: resolution exchange context (preferred — richer than Phase 1 commitment)
      myExchangeMessages
        ? `WHAT THIS PERSON SAID IN THE RESOLUTION EXCHANGE:\n${myExchangeMessages}`
        : '',
      resolutionStatement
        ? `THE RESOLUTION STATEMENT BOTH PEOPLE AGREED TO:\n${resolutionStatement}`
        : '',
      // Phase 1 fallback: private commitment (only if no exchange happened)
      (!myExchangeMessages && resolutionText)
        ? `WHAT THEY COMMITTED TO IN THE RESOLUTION STEP:\n${resolutionText}`
        : '',
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
        system: buildDebriefSystemPrompt(personName),
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
