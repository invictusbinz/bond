// POST /api/sessions
// Creates a new session. Returns the session ID, Person A's token, and the invite URL for Person B.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateJoinCode } from '@/lib/session'

export async function POST(request: NextRequest) {
  try {
    const { mode, person_a_name, partner_nickname, partner_relationship } = await request.json()

    if (!mode || !['heard', 'figure_it_out'].includes(mode)) {
      return NextResponse.json(
        { error: 'Invalid mode. Must be "heard" or "figure_it_out".' },
        { status: 400 }
      )
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Generate a unique join code (retry once on collision — extremely rare)
    let joinCode = generateJoinCode()
    const { data: existing } = await supabase
      .from('sessions')
      .select('id')
      .eq('join_code', joinCode)
      .maybeSingle()
    if (existing) joinCode = generateJoinCode()

    const { data, error } = await supabase
      .from('sessions')
      .insert({
        mode,
        join_code: joinCode,
        person_a_name: person_a_name || null,
        partner_nickname: partner_nickname || null,
        partner_relationship: partner_relationship || null,
      })
      .select('id, person_a_token, person_b_token, join_code')
      .single()

    if (error || !data) {
      console.error('Session creation error:', error)
      return NextResponse.json(
        { error: 'Could not create session. Please try again.' },
        { status: 500 }
      )
    }

    // Build the invite URL for Person B
    const origin = request.headers.get('origin') || ''
    const inviteUrl = `${origin}/session/${data.id}?join=${data.person_b_token}`

    return NextResponse.json({
      sessionId: data.id,
      personAToken: data.person_a_token,
      personBToken: data.person_b_token,
      joinCode: data.join_code,
      inviteUrl,
    })
  } catch (error) {
    console.error('POST /api/sessions error:', error)
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    )
  }
}
