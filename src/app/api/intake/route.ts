import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const CLOSING_SIGNAL = "Thank you for sharing this. I have enough to work with."

type Message = { role: 'ai' | 'user'; text: string }

export async function POST(request: NextRequest) {
  try {
    const { messages, mode, userMessageCount, sessionId, token, forceClose } = await request.json()

    const openingQuestion =
      mode === 'heard'
        ? "Before I invite them in, I want to understand what's on your mind. Take as much space as you need — what happened, and how are you feeling about it?"
        : "Before I bring them in, tell me what's going on. What's the situation, and what feels unresolved for you?"

    const modeContext =
      mode === 'heard'
        ? `They chose "I need to be heard" — they want to feel understood, not solve anything. Your focus: what happened, how they feel, what they needed that they didn't get.`
        : `They chose "We need to figure something out" — they want to work through a real situation. Your focus: what's unresolved, what a good outcome looks like, what they're worried about.`

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
        .eq('session_id', sessionId).eq('person', 'a').maybeSingle()

      if (existing) {
        await supabase.from('intake_responses')
          .update({ messages: allMessages, completed_at: new Date().toISOString() })
          .eq('id', existing.id)
      } else {
        await supabase.from('intake_responses')
          .insert({ session_id: sessionId, person: 'a', messages: allMessages, completed_at: new Date().toISOString() })
      }

      await supabase.from('sessions')
        .update({ status: 'awaiting_b' })
        .eq('id', sessionId)
        .eq('person_a_token', token)

      return NextResponse.json({ text: closingText, isComplete: true })
    }

    // Hard cap: at 4 user messages, force-close regardless of AI behaviour.
    // AI compliance with the closing instruction is unreliable — server enforces the cap.
    if (userMessageCount >= 4 && sessionId && token) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
      const closingText = `${CLOSING_SIGNAL} I'm going to take some time to understand both sides and put together something for you both to read — together. You'll see it at the same time as they do.`
      const allMessages = [...(messages as Message[]), { role: 'ai', text: closingText }]

      const { data: existing } = await supabase
        .from('intake_responses').select('id')
        .eq('session_id', sessionId).eq('person', 'a').maybeSingle()
      if (existing) {
        await supabase.from('intake_responses')
          .update({ messages: allMessages, completed_at: new Date().toISOString() })
          .eq('id', existing.id)
      } else {
        await supabase.from('intake_responses')
          .insert({ session_id: sessionId, person: 'a', messages: allMessages, completed_at: new Date().toISOString() })
      }
      await supabase.from('sessions')
        .update({ status: 'awaiting_b' })
        .eq('id', sessionId).eq('person_a_token', token)

      return NextResponse.json({ text: closingText, isComplete: true })
    }

    const shouldClose = userMessageCount >= 3

    const closingInstruction = shouldClose
      ? `You've heard enough to understand them. This is your last question before closing. Ask ONE final question that gives them a chance to say the most important thing they haven't said yet — something like "Before we bring them in, is there one thing you most need them to understand that you haven't quite said?" or "What do you most want to get out of this?" Keep it short and make it feel like a natural, warm ending to this part. After they answer, Bond will close.`
      : `After 2–3 exchanges, if you genuinely have enough context, ask ONE closing question that wraps things up naturally. Otherwise, ask one focused deepening question.`

    const systemPrompt = `You are Bond — a warm, emotionally intelligent presence grounded in Emotionally Focused Therapy (EFT) and Nonviolent Communication (NVC). You are doing private intake with Person A.

${modeContext}

You opened the conversation by asking: "${openingQuestion}"

Now you are in the follow-up phase. Help them articulate their side fully and honestly.

RULES — follow every one:
- One question per message. Never two.
- Keep responses short: one brief empathic observation (1 sentence, optional) + one question.
- Ask questions that go deeper, not broader — what they felt, what they needed, what they're afraid to say, what the other person would most need to understand.
- Base your question entirely on what they just said. No generic or predictable prompts.
- NEVER quote their words back to them verbatim. Reflect the emotional truth, not the exact words.
- NEVER offer advice, predict what will happen, or suggest what they should do.
- NEVER amplify fear or catastrophize. Stay curious, not alarmed.
- When someone states a conclusion about the other person ("they don't care", "they never listen"), gently redirect to the feeling underneath — what does it feel like for you when that happens?
- NEVER judge the other person's character or draw conclusions about their intentions.
- You are NOT here to fix anything or anticipate the other person's perspective.

${closingInstruction}`

    // Anthropic API requires messages to start with 'user' role.
    // Filter out the first AI message (the opening question shown in UI) since it's captured in the system prompt above.
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
        .eq('person', 'a')
        .maybeSingle()

      if (existing) {
        await supabase
          .from('intake_responses')
          .update({ messages: allMessages, completed_at: new Date().toISOString() })
          .eq('id', existing.id)
      } else {
        await supabase
          .from('intake_responses')
          .insert({ session_id: sessionId, person: 'a', messages: allMessages, completed_at: new Date().toISOString() })
      }

      // Advance session status to awaiting_b
      await supabase
        .from('sessions')
        .update({ status: 'awaiting_b' })
        .eq('id', sessionId)
        .eq('person_a_token', token)
    }

    return NextResponse.json({ text: aiText, isComplete })
  } catch (error) {
    console.error('Intake route error:', error)
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    )
  }
}
