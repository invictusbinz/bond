// POST /api/resolution-exchange/confirm
//
// Called when a person confirms the Resolution Statement that Bond proposed.
// Records their confirmation in session_responses (step: 'resolution_confirm').
// When both have confirmed, advances session to closing_ready.
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

    // ── Verify token + check status ─────────────────────────────────────────
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('status, person_a_token, person_b_token')
      .eq('id', sessionId)
      .single()

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found.' }, { status: 404 })
    }

    const isPersonA = token === session.person_a_token
    const isPersonB = token === session.person_b_token

    if (!isPersonA && !isPersonB) {
      return NextResponse.json({ error: 'Invalid token.' }, { status: 403 })
    }

    // Only valid when statement is proposed or one person has already confirmed
    const validStatuses = [
      'resolution_statement_proposed',
      'a_confirmed_statement',
      'b_confirmed_statement',
    ]

    if (!validStatuses.includes(session.status)) {
      return NextResponse.json({ ok: true, skipped: true, status: session.status })
    }

    const person = isPersonA ? 'a' : 'b'

    // ── Save this person's confirmation (if not already saved) ─────────────
    // Check first to avoid duplicate rows (no unique constraint on session_responses yet).
    const { data: existing } = await supabase
      .from('session_responses')
      .select('id')
      .eq('session_id', sessionId)
      .eq('person', person)
      .eq('step', 'resolution_confirm')
      .single()

    if (!existing) {
      const { error: insertError } = await supabase
        .from('session_responses')
        .insert({
          session_id: sessionId,
          person,
          step: 'resolution_confirm',
          response: { confirmed: true },
        })

      if (insertError) {
        console.error('session_responses insert error (resolution_confirm):', insertError)
        throw new Error('Could not save confirmation.')
      }
    }

    // ── Check if both have confirmed ────────────────────────────────────────
    const { data: confirmations } = await supabase
      .from('session_responses')
      .select('person')
      .eq('session_id', sessionId)
      .eq('step', 'resolution_confirm')

    const confirmedPersons = new Set((confirmations || []).map(r => r.person))
    const bothConfirmed = confirmedPersons.has('a') && confirmedPersons.has('b')

    if (bothConfirmed) {
      await supabase
        .from('sessions')
        .update({ status: 'closing_ready' })
        .eq('id', sessionId)

      return NextResponse.json({ ok: true, action: 'closing_ready' })
    }

    // ── Only one person confirmed so far ────────────────────────────────────
    const intermediateStatus = isPersonA ? 'a_confirmed_statement' : 'b_confirmed_statement'

    await supabase
      .from('sessions')
      .update({ status: intermediateStatus })
      .eq('id', sessionId)

    return NextResponse.json({ ok: true, action: intermediateStatus })
  } catch (error) {
    console.error('POST /api/resolution-exchange/confirm error:', error)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
