import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateIntakeSummary } from '@/lib/generateIntakeSummary'

const CLOSING_SIGNAL = "Thank you for sharing this. I have enough to work with."

type Message = { role: 'ai' | 'user'; text: string }

export async function POST(request: NextRequest) {
  try {
    const { messages, mode, userMessageCount, sessionId, token, forceClose, personAName, partnerNickname, partnerRelationship } = await request.json()

    // Build personalised partner reference — used in opening question + system prompt
    const partnerRef = partnerNickname || 'them'
    const partnerIsInvited = partnerNickname ? `${partnerNickname} is` : 'they are'

    const openingQuestion =
      mode === 'heard'
        ? `Before I invite ${partnerRef} in, I want to understand what's on your mind. What happened, and how are you feeling about it?`
        : `Before I bring ${partnerRef} in, tell me what's going on. What's the situation, and what feels unresolved for you?`

    const modeContext =
      mode === 'heard'
        ? `They chose "I need to be heard" — ${partnerIsInvited} being invited in, but the focus right now is on Person A. Help them feel understood, not advised. Focus: what happened, how they feel, what they needed that they didn't get.`
        : `They chose "We need to figure something out" — ${partnerIsInvited} being invited in to work through a real situation together. Focus: what's unresolved, what a good outcome looks like, what they're worried about.`

    // Name context — helps Bond address Person A naturally and reference their partner precisely.
    // Never surfaced verbatim; used only to guide tone and word choice.
    const nameContext = (personAName || partnerNickname)
      ? `\n[NAME CONTEXT: ${personAName ? `You are speaking with ${personAName}.` : ''} ${partnerNickname ? `Their ${partnerRelationship || 'partner'} is ${partnerNickname}.` : ''} Use their names naturally when it feels warm and appropriate — never robotically. Never address Person A by name more than once or twice in the whole conversation.]\n`
      : ''

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

      await generateIntakeSummary(messages as Message[], sessionId, 'a', supabase)

      return NextResponse.json({ text: closingText, isComplete: true })
    }

    // Safety net: at 5 user messages, force-close regardless of AI behaviour.
    // Normal flow ends at count 4 via AI. This fires only if the AI fails to close.
    if (userMessageCount >= 5 && sessionId && token) {
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

      await generateIntakeSummary(messages as Message[], sessionId, 'a', supabase)

      return NextResponse.json({ text: closingText, isComplete: true })
    }

    const shouldClose = userMessageCount >= 3
    const isExtensionTurn = userMessageCount === 4

    const closingInstruction = isExtensionTurn
      ? `The person just sent their 4th message. Read it carefully. If they asked a question — it ends with a question mark, or it's clearly asking for clarification — answer it briefly in plain language (one sentence, no mirroring, no em-dashes). Then say something like "Anything else you want me to know before I get started?" Do NOT include the closing signal in this response. If their message is not a question, acknowledge what they said and close now with the exact closing signal.`
      : shouldClose
      ? `You've heard enough to understand them. This is your last question before closing. Ask ONE final question that gives them a chance to say the most important thing they haven't said yet — something like "Before we bring ${partnerRef} in, is there one thing you most need ${partnerRef === 'them' ? 'them' : partnerRef} to understand that you haven't quite said?" Keep it short and warm. After they answer, Bond will close.`
      : `After 2–3 exchanges, if you genuinely have enough context, ask ONE closing question that wraps things up naturally. Otherwise, ask one focused deepening question.`

    const systemPrompt = `You are Bond — a thoughtful, caring presence. Not a professional, not a system. You ask real questions and actually listen. Your job is to help this person say what's on their mind.
${nameContext}
${modeContext}

You opened the conversation by asking: "${openingQuestion}"

Now you are in the follow-up phase. Help them say what's really going on.

RULES — follow every one:
- One question per message. Never two.
- Keep responses short: one brief observation (1 sentence, optional) + one question.
- Ask questions that go deeper, not broader — what they felt, what they needed, what they're afraid to say, what the other person would most need to understand.
- Base your question entirely on what they just said. No generic or predictable prompts.
- Write like a real person talking, not a professional being careful. Short sentences. Plain words.
- Never use em-dashes.
- Never start a response with "It sounds like," "I hear that," "That must be," or similar mirroring openers.
- Never use these phrases: "that's a lot to carry," "sit with," "hold space," "feel seen," "unpack."
- Ask questions that invite a full answer — not something answerable in 3 words.
- Light reflective quoting is fine — if referencing something specific they said helps you ask a better question ("when you said X, what did you mean by that?"), do it. What you must never do: quote sensitive statements back as conclusions, quote in a way that escalates fear, or reflect their exact words without going deeper. Reflect the emotional truth; use their words sparingly and only to deepen the conversation.
- NEVER offer advice, predict what will happen, or suggest what they should do.
- NEVER amplify fear or catastrophize. Stay curious, not alarmed.
- When someone states a conclusion about the other person ("they don't care", "they never listen"), gently redirect to the feeling underneath — what does that feel like for you?
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

      await generateIntakeSummary(messages as Message[], sessionId, 'a', supabase)
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
