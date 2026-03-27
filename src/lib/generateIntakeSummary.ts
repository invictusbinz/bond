// generateIntakeSummary — called when intake closes.
//
// Takes the person's conversation messages, calls Claude to write a 2-3 sentence
// first-person summary of what they shared, and saves it to sessions table.
// Runs synchronously but swallows errors silently — summary is non-blocking.
// If it fails, SynthesisView simply won't show the strip. Not a hard failure.

import { SupabaseClient } from '@supabase/supabase-js'

type Message = { role: 'ai' | 'user'; text: string }

const SUMMARY_PROMPT = `You are Bond. A person just finished sharing their side of a relationship situation in a private intake session.

Write a 2–3 sentence summary of what they shared, written in first person as if they're recalling it to themselves — like a quiet internal note. Use "I" language: "I was feeling...", "I said...", "What I needed was...", "I felt like..."

This will be shown back to them while they read Bond's synthesis — so it should feel like a grounded reminder of what they brought into this, not a transcript.

RULES:
- 2–3 sentences maximum. No more.
- First person throughout.
- Capture the emotional core and the key situation — not every detail.
- Plain prose. No headers, bullets, or quotation marks.
- If the content is sparse, write what you can — don't pad it.`

export async function generateIntakeSummary(
  messages: Message[],
  sessionId: string,
  person: 'a' | 'b',
  supabase: SupabaseClient
): Promise<void> {
  try {
    // Extract only what the person typed — skip AI questions
    const userLines = messages
      .filter(m => m.role === 'user')
      .map(m => `- ${m.text}`)
      .join('\n')

    if (!userLines.trim()) return

    const apiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.NEXT_PRIVATE_CLAUDE_API_KEY!,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        system: SUMMARY_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Here is what they shared:\n\n${userLines}\n\nWrite the 2–3 sentence first-person summary now.`,
          },
        ],
      }),
    })

    if (!apiResponse.ok) return

    const result = await apiResponse.json()
    const summary: string = result.content?.[0]?.text?.trim()
    if (!summary) return

    const column = person === 'a' ? 'a_intake_summary' : 'b_intake_summary'
    await supabase
      .from('sessions')
      .update({ [column]: summary })
      .eq('id', sessionId)
  } catch {
    // Silent — summary is a nice-to-have. Never block intake close.
  }
}
