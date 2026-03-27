// POST /api/post-resolution
// Called by the session page when status = 'both_responded_resolution'.
// Both people have answered the resolution question privately.
// Bond closes the session warmly — status advances to 'closing_ready'.
//
// The individual commitments are NOT shared between people — they remain private.
// Bond simply acknowledges that both took this step and closes the loop.
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
    if (session.status !== 'both_responded_resolution') {
      return NextResponse.json({ ok: true, skipped: true, status: session.status })
    }

    // ── Advance to closing_ready ─────────────────────────────────────────────
    // Both people have committed to something. The session is ready to close.
    await supabase
      .from('sessions')
      .update({ status: 'closing_ready' })
      .eq('id', sessionId)

    return NextResponse.json({ ok: true, action: 'closing_ready' })
  } catch (error) {
    console.error('POST /api/post-resolution error:', error)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
