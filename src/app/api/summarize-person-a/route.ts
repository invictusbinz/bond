import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Used when Person A's intake isn't in Supabase yet (early prototype / first load).
// Honest and non-committal — doesn't fabricate context.
const FALLBACK_SUMMARY =
  "They reached out to share something that's been weighing on them about your relationship. I heard their side privately — the fuller picture will come together once I hear from you too."

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('sessionId')

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Fetch session name fields if sessionId is present — used to personalise the summary
    let personAName: string | null = null
    let personBName: string | null = null
    let partnerNickname: string | null = null
    if (sessionId) {
      const { data: sessionData } = await supabase
        .from('sessions')
        .select('person_a_name, person_b_name, partner_nickname')
        .eq('id', sessionId)
        .maybeSingle()
      if (sessionData) {
        personAName = sessionData.person_a_name ?? null
        personBName = sessionData.person_b_name ?? null
        partnerNickname = sessionData.partner_nickname ?? null
      }
    }

    // Fetch Person A's intake for this specific session
    let query = supabase
      .from('intake_responses')
      .select('messages')
      .eq('person', 'a')

    if (sessionId) {
      query = query.eq('session_id', sessionId)
    } else {
      // Fallback for prototype testing without a session ID
      query = query.order('completed_at', { ascending: false }).limit(1)
    }

    const { data, error } = await query.maybeSingle()

    if (error || !data?.messages) {
      console.log('No Person A intake in Supabase — using fallback summary:', error?.message)
      return NextResponse.json({ summary: FALLBACK_SUMMARY, hasData: false })
    }

    // Pull only Person A's typed messages (not the AI's questions)
    // to build the transcript we send to Claude for summarizing
    const messages = data.messages as Array<{ role: 'ai' | 'user'; text: string }>
    const userLines = messages
      .filter((m) => m.role === 'user')
      .map((m) => `- ${m.text}`)
      .join('\n')

    if (!userLines.trim()) {
      return NextResponse.json({ summary: FALLBACK_SUMMARY, hasData: false })
    }

    // Build a light name context block for the system prompt
    const nameContext = (personAName || personBName || partnerNickname)
      ? `\n[NAME CONTEXT: ${personAName ? `Person A's name is ${personAName}.` : ''} ${personBName ? `Person B's name is ${personBName}. You may open the summary with their name once (e.g. "[Name],") to make it feel directly addressed.` : ''} ${partnerNickname && partnerNickname !== personBName ? `Person A refers to Person B as "${partnerNickname}".` : ''} Do not over-use names — once is enough.]\n`
      : ''

    const systemPrompt = `You are Bond — a neutral AI that helps two people communicate better.
${nameContext}
You have just read what ${personAName || 'Person A'} shared in their private intake session. Your task is to write a 2–3 sentence summary that will be shown to ${personBName || 'Person B'} before their intake begins, so they understand what they're walking into.

Your goal: give Person B enough real context to enter the conversation meaningfully — not so little that they're disoriented, not so much that they feel accused or defensive.

---

HOW TO STRUCTURE THE SUMMARY:

Sentence 1 — What happened or what triggered this:
Describe the actual situation or event that prompted this session, using neutral framing. Be specific enough that Person B knows what this is about. Do NOT be so vague that it's meaningless.

Good: "A conversation about money earlier this week didn't go the way they hoped."
Good: "Something was said during an argument recently that's been sitting with them."
Good: "They found out about something involving [topic] that caught them off guard."
Good: "Things have been strained around [topic] for a while and it came to a head recently."
Bad (too vague): "Something happened that left them feeling hurt." — this tells Person B nothing.
Bad (too accusatory): "They're upset because you did X." — never assign fault or use "you."

If Person A described a specific triggering event (an argument, a discovery, something said, a broken plan, a pattern they're naming), include the subject matter and timeframe. Do not quote them or describe it from their perspective — just state what the situation involves.

Sentence 2–3 — How they're feeling and what they need:
Describe their emotional state and the underlying need, empathetically and without blame.

---

HARD RULES:
- 2–3 sentences total. Plain prose. No headers, bullets, or quotation marks.
- Never quote Person A's words directly or closely paraphrase them
- Never assign fault, blame, or frame anything as what "you" (Person B) did
- Never use "you" to refer to Person B — only "they" and "them" for Person A
- Do not be so vague the summary is useless. Specific topics (money, communication, plans, intimacy, honesty, trust) are fine to name if A mentioned them.`

    const userContent = `Here is what ${personAName || 'Person A'} shared:\n\n${userLines}\n\nWrite the 2–3 sentence summary now.`

    const apiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.NEXT_PRIVATE_CLAUDE_API_KEY!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 350,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      }),
    })

    if (!apiResponse.ok) {
      const errText = await apiResponse.text()
      console.error('Anthropic error in summarize-person-a:', errText)
      throw new Error(`Anthropic API error: ${apiResponse.status}`)
    }

    const result = await apiResponse.json()
    const summary: string = result.content?.[0]?.text ?? FALLBACK_SUMMARY

    return NextResponse.json({ summary, hasData: true })
  } catch (error) {
    console.error('summarize-person-a error:', error)
    // Always return something — Person B's flow must not be blocked
    return NextResponse.json({ summary: FALLBACK_SUMMARY, hasData: false })
  }
}
