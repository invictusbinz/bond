// POST /api/session-response
// Saves a person's response to a specific session step (synthesis_accuracy,
// checkpoint, resolution) and advances the session status.
//
// The 'newStatus' the caller provides is used directly — it's the caller's
// responsibility to send the right status for their role.
// e.g. Person A submitting synthesis → newStatus: 'a_responded_synthesis'
//      Person B submitting synthesis → newStatus: 'b_responded_synthesis'
//
// Special case: if BOTH people have now responded to the same step,
// the status is advanced to 'both_responded_[step]' instead.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const STEP_BOTH_STATUS: Record<string, string> = {
  synthesis_accuracy: 'both_responded_synthesis',
  checkpoint: 'both_responded_checkpoint',
  resolution: 'both_responded_resolution',
}

export async function POST(request: NextRequest) {
  try {
    const { sessionId, token, person, step, response, newStatus } = await request.json()

    if (!sessionId || !token || !person || !step || !response || !newStatus) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // ── Verify token ────────────────────────────────────────────────────────
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('person_a_token, person_b_token')
      .eq('id', sessionId)
      .single()

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found.' }, { status: 404 })
    }

    if (token !== session.person_a_token && token !== session.person_b_token) {
      return NextResponse.json({ error: 'Invalid token.' }, { status: 403 })
    }

    // ── Save this person's response ─────────────────────────────────────────
    const { error: insertError } = await supabase
      .from('session_responses')
      .insert({ session_id: sessionId, person, step, response })

    if (insertError) {
      console.error('session_response insert error:', insertError)
      return NextResponse.json({ error: 'Could not save response.' }, { status: 500 })
    }

    // ── Check if the other person has already responded to this step ────────
    const otherPerson = person === 'a' ? 'b' : 'a'
    const { data: partnerResponse } = await supabase
      .from('session_responses')
      .select('id')
      .eq('session_id', sessionId)
      .eq('person', otherPerson)
      .eq('step', step)
      .single()

    const bothResponded = !!partnerResponse
    const finalStatus = bothResponded ? (STEP_BOTH_STATUS[step] ?? newStatus) : newStatus

    // ── Update session status ───────────────────────────────────────────────
    await supabase
      .from('sessions')
      .update({ status: finalStatus })
      .eq('id', sessionId)

    return NextResponse.json({ ok: true, bothResponded, status: finalStatus })
  } catch (error) {
    console.error('POST /api/session-response error:', error)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
