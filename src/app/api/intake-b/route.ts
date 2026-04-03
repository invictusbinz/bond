import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateIntakeSummary } from '@/lib/generateIntakeSummary'

// The closing signal must match exactly — the UI checks for this string
// to know when Person B's intake is complete and transition to the complete phase.
// This is the same signal used for Person A, keeping the experience consistent.
const CLOSING_SIGNAL = "Thank you for sharing this. I have enough to work with."

type Message = { role: 'ai' | 'user'; text: string }

export async function POST(request: NextRequest) {
  try {
    const { messages, userMessageCount, partnerSummary, sessionId, token, availabilityState, forceClose, personBName, personAName } = await request.json()

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

      await generateIntakeSummary(messages as Message[], sessionId, 'b', supabase)

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

      await generateIntakeSummary(messages as Message[], sessionId, 'b', supabase)

      return NextResponse.json({ text: closingText, isComplete: true })
    }

    const shouldClose = userMessageCount >= 3
    const isExtensionTurn = userMessageCount === 4

    const closingInstruction = isExtensionTurn
      ? `The person just sent their 4th message. Read it carefully. If they asked a question — it ends with a question mark, or it's clearly asking for clarification — answer it briefly in plain language (one sentence, no mirroring, no em-dashes). Then say something like "Anything else you want me to know before I get started?" Do NOT include the closing signal in this response. If their message is not a question, acknowledge what they said and close now with the exact closing signal.`
      : shouldClose
      ? `You've heard enough to understand them. This is your last question before closing. Ask ONE final question that gives them a chance to say the most important thing they haven't said yet — something like "Before we bring you both together, is there one thing you most need them to understand that you haven't quite said?" Keep it short and warm. After they answer, Bond will close.`
      : `After 2–3 exchanges, if you genuinely have enough context, ask ONE closing question that wraps things up naturally. Otherwise, ask one focused deepening question.`

    // Background context from Person A's side — for the AI's awareness only.
    // This helps the AI ask sharper, more relevant follow-up questions of Person B.
    // It must NEVER be surfaced or alluded to in the AI's responses.
    const partnerContext = partnerSummary
      ? `\n[BACKGROUND CONTEXT — FOR YOUR AWARENESS ONLY. Do not reference this, quote it, or hint at it in your responses. Use it only to guide the depth and direction of your questions.]\nPerson A's emotional state and core need: "${partnerSummary}"\n[END BACKGROUND CONTEXT]\n`
      : ''

    // Availability state context — adjusts tone for stressed users
    const isStressed = availabilityState === 'stressed'
    const availabilityContext = isStressed
      ? `\n[AVAILABILITY NOTE: Person B indicated they are carrying some stress right now. Open with extra warmth and patience. Keep your questions shorter. Check in gently about pacing if they seem overwhelmed. Don't rush.]\n`
      : ''

    // Name context — helps Bond address Person B naturally and reference their partner.
    // Use names sparingly — once or twice at most. Never robotically.
    const nameContext = (personBName || personAName)
      ? `\n[NAME CONTEXT: ${personBName ? `You are speaking with ${personBName}.` : ''} ${personAName ? `Their partner (Person A) is ${personAName}.` : ''} Use names naturally when it feels warm — never more than once or twice. Never address Person B by name more than once in the whole conversation.]\n`
      : ''

    const systemPrompt = `You are Bond — a thoughtful, caring presence. Not a professional, not a system. You ask real questions and actually listen. Your job is to help this person say what's on their mind.
${nameContext}${partnerContext}${availabilityContext}
Person B has already read a neutral summary of what Person A is feeling — they are not coming in completely blind. But they have not seen Person A's raw words. Do not add to what they know about Person A's side.

You opened the conversation by asking: "I've heard their side. Now I want to hear yours — not as a rebuttal, but your own experience. What's your side of this?"

Help Person B say what's really going on for them.

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
- NEVER reference or hint at what Person A may have shared, even subtly.
- You are NOT here to fix anything, compare perspectives, or take sides.

${closingInstruction}`

    // Set b_active on Person B's first message so Person A's WaitingScreen
    // updates from "awaiting_b" to "b_active" — lets them know B is in.
    // Only updates if session is still at awaiting_b (safe to call on every
    // first message — won't overwrite later statuses).
    if (userMessageCount === 1 && sessionId && token) {
      const supabaseStatus = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
      supabaseStatus
        .from('sessions')
        .update({ status: 'b_active' })
        .eq('id', sessionId)
        .eq('person_b_token', token)
        .eq('status', 'awaiting_b')
        .then(() => {}) // fire-and-forget — don't block the AI response
    }

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

      await generateIntakeSummary(messages as Message[], sessionId, 'b', supabase)
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
