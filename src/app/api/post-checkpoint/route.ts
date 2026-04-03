// POST /api/post-checkpoint
// Called when status = 'both_responded_checkpoint'.
// Reads both checkpoint responses and routes to the right next state:
//
//   Both 'yes'      → resolution_ready    (both want to keep working)
//   Both 'not_yet'  → closed              (both felt heard and done)
//   One each        → checkpoint_split    (different places — session closes per-person)
//
// Idempotent — safe to call multiple times.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const { sessionId, token } = await request.json()

    if (!sessionId || !token) {
      return NextResponse.json({ error: 'sessionId and token are required.' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // ── Verify token ────────────────────────────────────────────────────────
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('status, person_a_token, person_b_token')
      .eq('id', sessionId)
      .single()

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found.' }, { status: 404 })
    }

    if (token !== session.person_a_token && token !== session.person_b_token) {
      return NextResponse.json({ error: 'Invalid token.' }, { status: 403 })
    }

    // Idempotency
    if (session.status !== 'both_responded_checkpoint') {
      return NextResponse.json({ ok: true, skipped: true, status: session.status })
    }

    // ── Read both checkpoint responses ──────────────────────────────────────
    const { data: responses } = await supabase
      .from('session_responses')
      .select('person, response')
      .eq('session_id', sessionId)
      .eq('step', 'checkpoint')

    const choiceA: string = responses?.find(r => r.person === 'a')?.response?.choice ?? 'not_yet'
    const choiceB: string = responses?.find(r => r.person === 'b')?.response?.choice ?? 'not_yet'

    // ── Route based on combined choices ─────────────────────────────────────
    let newStatus: string
    let action: string

    if (choiceA === 'yes' && choiceB === 'yes') {
      // Both want to keep working → move to resolution
      newStatus = 'resolution_ready'
      action = 'resolution'
    } else if (choiceA === 'not_yet' && choiceB === 'not_yet') {
      // Both felt heard and done → close cleanly
      newStatus = 'closed'
      action = 'closed'
    } else {
      // One wanted to continue, one was done → split case
      // Session closes. Each person sees per-person copy without learning the other's choice.
      newStatus = 'checkpoint_split'
      action = 'split'
    }

    await supabase
      .from('sessions')
      .update({ status: newStatus })
      .eq('id', sessionId)

    return NextResponse.json({ ok: true, action })
  } catch (error) {
    console.error('POST /api/post-checkpoint error:', error)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
