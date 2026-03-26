import { NextRequest, NextResponse } from 'next/server'

// The closing signal must match exactly — the UI checks for this string
// to know when Person B's intake is complete and transition to the complete phase.
// This is the same signal used for Person A, keeping the experience consistent.
const CLOSING_SIGNAL = "Thank you for sharing this. I have enough to work with."

type Message = { role: 'ai' | 'user'; text: string }

export async function POST(request: NextRequest) {
  try {
    const { messages, userMessageCount } = await request.json()

    const shouldClose = userMessageCount >= 3

    const closingInstruction = shouldClose
      ? `You have enough context now. Close the intake with EXACTLY this sentence — word for word, nothing added before or after: "${CLOSING_SIGNAL} I'm going to take some time to understand both sides and put together something for you both to read — together. You'll see it at the same time as they do."`
      : `After 2–3 exchanges, if you genuinely have enough to work with, close with EXACTLY: "${CLOSING_SIGNAL} I'm going to take some time to understand both sides and put together something for you both to read — together. You'll see it at the same time as they do." — If you need one more thing first, ask one focused question.`

    const systemPrompt = `You are Bond — a warm, emotionally intelligent AI that helps two people communicate better. You are doing private intake with Person B.

Person A has already shared their side privately. You have NOT shared it with Person B, and you won't. Person B does not know what Person A said, and you must not hint at it.

You opened the conversation by asking: "I want to hear from you now. What's your experience of this — what happened, and how are you feeling about it?"

Your job is to help Person B articulate their side fully and honestly. You are NOT offering advice, NOT anticipating what Person A said, NOT trying to resolve anything.

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

    return NextResponse.json({ text: aiText, isComplete })
  } catch (error) {
    console.error('Intake B route error:', error)
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    )
  }
}
