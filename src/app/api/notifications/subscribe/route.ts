// POST /api/notifications/subscribe
//
// Saves a OneSignal subscription/player ID for a specific person in a session.
// Called after the user grants browser notification permission on the client.
//
// Body: { sessionId, person, playerId, token }
//   person  — 'a' or 'b'
//   playerId — the OneSignal subscription ID from the browser
//   token   — caller's session auth token (verified server-side)
//
// Upserts: if the same person subscribes again (new browser, cleared cookies),
// the player ID is updated rather than creating a duplicate row.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const { sessionId, person, playerId, token } = await request.json()

    // ── Validate input ─────────────────────────────────────────────────────────
    if (!sessionId || !person || !playerId || !token) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 })
    }

    if (!['a', 'b'].includes(person)) {
      return NextResponse.json({ error: 'Person must be "a" or "b".' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // ── Verify token belongs to this session ────────────────────────────────
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

    // ── Upsert subscription ─────────────────────────────────────────────────
    // UNIQUE constraint on (session_id, person) — onConflict updates the player ID.
    const { error: upsertError } = await supabase
      .from('notification_subscriptions')
      .upsert(
        {
          session_id: sessionId,
          person,
          onesignal_player_id: playerId,
        },
        { onConflict: 'session_id,person' }
      )

    if (upsertError) {
      console.error('Notification subscription save error:', upsertError)
      return NextResponse.json({ error: 'Could not save subscription.' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('POST /api/notifications/subscribe error:', error)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
