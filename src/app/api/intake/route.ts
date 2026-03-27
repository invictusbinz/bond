import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const CLOSING_SIGNAL = "Thank you for sharing this. I have enough to work with."

type Message = { role: 'ai' | 'user'; text: string }

export async function POST(request: NextRequest) {
  try {
    const { messages, mode, userMessageCount, sessionId, token } = await request.json()

    const openingQuestion =
      mode === 'heard'
        ? "Before I invite them in, I want to understand what's on your mind. Take as much space as you need — what happened, and how are you feeling about it?"
        : "Before I bring them in, tell me what's going on. What's the situation, and what feels unresolved for you?"

    const modeContext =
      mode === 'heard'
        ? `They chose "I need to be heard" — they want to feel understood, not solve anything. Your focus: what happened, how they feel, what they needed that they didn't get.`
        : `They chose "We need to figure something out" — they want to work through a real situation. Your focus: what's unresolved, what a good outcome looks like, what they're worried about.`

    const shouldClose = userMessageCount >= 3

    const closingInstruction = shouldClose
      ? `You have enough context now. Close the intake with EXACTLY this sentence — word for word, nothing added before or after: "${CLOSING_SIGNAL} I'm going to take some time to understand both sides and put together something for you both to read — together. You'll see it at the same time as they do."`
      : `After 2–3 exchanges, if you genuinely have enough to work with, close with EXACTLY: "${CLOSING_SIGNAL} I'm going to take some time to understand both sides and put together something for you both to read — together. You'll see it at the same time as they do." — If you need one more thing first, ask one focused question.`

    const systemPrompt = `You are Bond — a warm, emotionally intelligent AI that helps two people communicate better. You are doing private intake with Person A.

${modeContext}

You opened the conversation by asking: "${openingQuestion}"

Now you are in the follow-up phase. Your job is to help them articulate their side fully and honestly. You are NOT offering advice, NOT anticipating the other person's perspective, NOT trying to resolve anything.

Rules:
- One question per message. Never two.
- Keep responses short: one brief observation (optional) + one question.
- Ask questions that go deeper, not broader — what they needed, what they're afraid to say, what the other person would most need to understand.
- Base your question on what they actually said. No generic prompts.

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

      // Save intake (upsert in case of retry)
      await supabase.from('intake_responses').upsert(
        { session_id: sessionId, person: 'a', messages: allMessages, completed_at: new Date().toISOString() },
        { onConflict: 'session_id,person' }
      )

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
