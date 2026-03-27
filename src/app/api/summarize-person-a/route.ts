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

    const systemPrompt = `You are Bond — a neutral AI that helps two people communicate better.

You have just read what Person A shared in their private intake session. Your task is to write a 2–3 sentence summary that will be shown to Person B on their orientation screen — so they understand what they're entering before they share their own side.

Person B needs enough context to walk in with some orientation, but not so much that they feel accused or defensive. Strike that balance carefully.

Structure your summary as follows:
1. One sentence describing the general nature of what's been going on or what happened — without specifics, without saying who did what. Use neutral language: "something happened that left them feeling...", "there's been tension around...", "a situation came up that...", "things have been strained around..."
2. One or two sentences on how they're feeling and what they seem to need underneath that.

Requirements:
- 2–3 sentences total. Plain prose. No headers, bullets, or quotation marks.
- Never quote Person A's words, even paraphrased closely
- Never frame anything as an accusation or assign fault
- Never name the other person or use "you" — only "they" and "them"
- Written in third person, empathetically: "They're feeling...", "What they seem to need...", "It sounds like..."`

    const userContent = `Here is what Person A shared:\n\n${userLines}\n\nWrite the 2–3 sentence summary now.`

    const apiResponse = await fetch('https://api.anthropic.com/v1/messages', {
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
