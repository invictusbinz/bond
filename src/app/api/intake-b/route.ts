import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// The closing signal must match exactly — the UI checks for this string
// to know when Person B's intake is complete and transition to the complete phase.
// This is the same signal used for Person A, keeping the experience consistent.
const CLOSING_SIGNAL = "Thank you for sharing this. I have enough to work with."

type Message = { role: 'ai' | 'user'; text: string }

export async function POST(request: NextRequest) {
  try {
    const { messages, userMessageCount, partnerSummary, sessionId, token, forceClose } = await request.json()

    // Force-close path: user clicked "I've shared enough"
    // Skip AI generation entirely, save what we have, advance status.
    if (forceClose && sessionId && token) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
      const closingText = `${CLOSING_SIGNAL} I'm going to take some time to understand both sides and put together something for you both to read — together. You'll see it at the same time as they do.`
      const allMessages = [...(messages as Message[]), { role: 'ai', text: closingText }]

      const { data: existing } = await supabase
        .from('intake_responses').select('id')
        .eq('session_id', sessionId).eq('person', 'b').maybeSingle()

      if (existing) {
        await supabase.from('intake_responses')
          .update({ messages: allMessages, completed_at: new Date().toISOString() })
          .eq('id', existing.id)
      } else {
        await supabase.from('intake_responses')
          .insert({ session_id: sessionId, person: 'b', messages: allMessages, completed_at: new Date().toISOString() })
      }

      await supabase.from('sessions')
        .update({ status: 'synthesis_generating' })
        .eq('id', sessionId)
        .eq('person_b_token', token)

      return NextResponse.json({ text: closingText, isComplete: true })
    }

    // Hard cap: at 4 user messages, force-close regardless of AI behaviour.
    if (userMessageCount >= 4 && sessionId && token) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
      const closingText = `${CLOSING_SIGNAL} I'm going to take some time to understand both sides and put together something for you both to read — together. You'll see it at the same time as they do.`
      const allMessages = [...(messages as Message[]), { role: 'ai', text: closingText }]

      const { data: existing } = await supabase
        .from('intake_responses').select('id')
        .eq('session_id', sessionId).eq('person', 'b').maybeSingle()
      if (existing) {
        await supabase.from('intake_responses')
          .update({ messages: allMessages, completed_at: new Date().toISOString() })
          .eq('id', existing.id)
      } else {
        await supabase.from('intake_responses')
          .insert({ session_id: sessionId, person: 'b', messages: allMessages, completed_at: new Date().toISOString() })
      }
      await supabase.from('sessions')
        .update({ status: 'synthesis_generating' })
        .eq('id', sessionId).eq('person_b_token', token)

      return NextResponse.json({ text: closingText, isComplete: true })
    }

    const shouldClose = userMessageCount >= 3

    const closingInstruction = shouldClose
      ? `You've heard enough to understand them. This is your last question before closing. Ask ONE final question that gives them a chance to say the most important thing they haven't said yet — something like "Before we bring you both together, is there one thing you most need them to understand that you haven't quite said?" Keep it short and make it feel like a natural, warm ending to this part. After they answer, Bond will close.`
      : `After 2–3 exchanges, if you genuinely have enough context, ask ONE closing question that wraps things up naturally. Otherwise, ask one focused deepening question.`

    // Background context from Person A's side — for the AI's awareness only.
    // This helps the AI ask sharper, more relevant follow-up questions of Person B.
    // It must NEVER be surfaced or alluded to in the AI's responses.
    const partnerContext = partnerSummary
      ? `\n[BACKGROUND CONTEXT — FOR YOUR AWARENESS ONLY. Do not reference this, quote it, or hint at it in your responses. Use it only to guide the depth and direction of your questions.]\nPerson A's emotional state and core need: "${partnerSummary}"\n[END BACKGROUND CONTEXT]\n`
      : ''

    const systemPrompt = `You are Bond — a warm, emotionally intelligent AI that helps two people communicate better. You are doing private intake with Person B.
${partnerContext}
Person B has already read a neutral summary of what Person A is feeling — they are not coming in completely blind. But they have not seen Person A's raw words, and you must not add to what they know.

You opened the conversation by asking: "I've heard their side. Now I want to hear yours — not as a rebuttal, but your own experience of what's been going on. What's happening for you?"

Your job is to help Person B articulate their side fully and honestly. You are NOT offering advice, NOT resolving anything, NOT referencing what Person A said.

Rules:
- One question per message. Never two.
- Keep responses short: one brief observation (optional) + one question.
- Ask questions that go deeper, not broader — what they needed, what they're afraid to say, what the other person would most need to understand.
- Base your question on what they actually said. No generic prompts.
- Never reference or hint at the other person's perspective or what they might have shared.

${closingInstruction}`

    // Anthropic API requires messages to start with 'user' role.
    // Filter out the first AI message (the opening question shown in UI)
    // since it's already captured in the system prompt above.
    const filtered = (messages as Message[])[0]?.role === 'ai'
      ? (messages as Message[]).slice(1)
      : (messages as Message[])

    const anthropicMessages = filtered.map((m: Message) => ({
      role: m.role === 'ai' ? 'assistant' : 'user',
      content: m.text,
    }))

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
        messages: anthropicMessages,
      }),
    })

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text()
      console.error('Anthropic API error:', errorText)
      throw new Error(`Anthropic API error: ${apiResponse.status}`)
    }

    const result = await apiResponse.json()
    const aiText: string = result.content?.[0]?.text ?? ''
    const isComplete = aiText.includes(CLOSING_SIGNAL)

    // When intake is complete, save to Supabase and advance session status
    if (isComplete && sessionId && token) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )

      const allMessages = [...(messages as Message[]), { role: 'ai', text: aiText }]

      // Save intake — check if row already exists first (defensive pattern)
      const { data: existing } = await supabase
        .from('intake_responses')
        .select('id')
        .eq('session_id', sessionId)
        .eq('person', 'b')
        .maybeSingle()

      if (existing) {
        await supabase
          .from('intake_responses')
          .update({ messages: allMessages, completed_at: new Date().toISOString() })
          .eq('id', existing.id)
      } else {
        await supabase
          .from('intake_responses')
          .insert({ session_id: sessionId, person: 'b', messages: allMessages, completed_at: new Date().toISOString() })
      }

      // Advance session status to synthesis_generating.
      // The session page detects this and triggers /api/synthesize automatically.
      await supabase
        .from('sessions')
        .update({ status: 'synthesis_generating' })
        .eq('id', sessionId)
        .eq('person_b_token', token)
    }

    return NextResponse.json({ text: aiText, isComplete })
  } catch (error) {
    console.error('Intake B route error:', error)
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    )
  }
}
