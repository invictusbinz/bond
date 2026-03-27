// GET /api/join?code=XXXXXX
//
// Looks up a session by its 6-character join code.
// Returns the session ID and Person B's token so the homepage can
// redirect to /session/[id]?join=[token], which is the same flow
// as clicking Person A's invite link.
//
// The join code is not secret — it's the same thing Person A shares.
// The token is what actually grants access; it gets saved to localStorage
// by the session page when B arrives.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get('code')

    if (!code || code.trim().length === 0) {
      return NextResponse.json(
        { error: 'A join code is required.' },
        { status: 400 }
      )
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Join codes are stored uppercase — normalise before querying
    const { data, error } = await supabase
      .from('sessions')
      .select('id, person_b_token, status')
      .eq('join_code', code.trim().toUpperCase())
      .maybeSingle()

    if (error) {
      console.error('Join code lookup error:', error)
      return NextResponse.json(
        { error: 'Something went wrong. Please try again.' },
        { status: 500 }
      )
    }

    if (!data) {
      return NextResponse.json(
        { error: 'That code doesn\'t match any session. Double-check it and try again.' },
        { status: 404 }
      )
    }

    // Prevent joining a session that's already past the point where B can enter.
    // If the session is already at synthesis or beyond, B's slot is taken.
    const closedStatuses = [
      'synthesis_generating', 'synthesis_ready',
      'a_responded_synthesis', 'b_responded_synthesis', 'both_responded_synthesis',
      'synthesis_revising', 'synthesis_revised',
      'checkpoint_ready', 'a_responded_checkpoint', 'b_responded_checkpoint', 'both_responded_checkpoint',
      'resolution_ready', 'a_responded_resolution', 'b_responded_resolution', 'both_responded_resolution',
      'closing_generating', 'closing_ready', 'closed',
    ]

    if (closedStatuses.includes(data.status)) {
      return NextResponse.json(
        { error: 'This session has already moved past the joining stage.' },
        { status: 409 }
      )
    }

    return NextResponse.json({
      sessionId: data.id,
      personBToken: data.person_b_token,
    })
  } catch (err) {
    console.error('GET /api/join error:', err)
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    )
  }
}
