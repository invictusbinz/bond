// GET  /api/sessions/[id]   — fetch session data (status, mode, tokens, names)
// PATCH /api/sessions/[id]  — update session status or name fields

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type Params = { params: Promise<{ id: string }> }

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { data, error } = await supabase
      .from('sessions')
      .select(
        'id, mode, status, person_a_token, person_b_token, join_code, created_at, ' +
        'a_intake_summary, b_intake_summary, ' +
        'person_a_name, partner_nickname, partner_relationship, person_b_name'
      )
      .eq('id', id)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Session not found.' }, { status: 404 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('GET /api/sessions/[id] error:', error)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}

// ─── PATCH ────────────────────────────────────────────────────────────────────

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const body = await request.json()
    const { status, token, person_b_name } = body

    // Must provide at least one updatable field
    if (!status && !person_b_name) {
      return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Verify the caller has a valid token for this session
    const { data: session, error: fetchError } = await supabase
      .from('sessions')
      .select('person_a_token, person_b_token')
      .eq('id', id)
      .single()

    if (fetchError || !session) {
      return NextResponse.json({ error: 'Session not found.' }, { status: 404 })
    }

    if (token && token !== session.person_a_token && token !== session.person_b_token) {
      return NextResponse.json({ error: 'Invalid token.' }, { status: 403 })
    }

    // Build update payload — only include fields that are provided
    const updatePayload: Record<string, unknown> = {}
    if (status) updatePayload.status = status
    if (person_b_name) updatePayload.person_b_name = person_b_name

    const { error: updateError } = await supabase
      .from('sessions')
      .update(updatePayload)
      .eq('id', id)

    if (updateError) {
      console.error('Session update error:', updateError)
      return NextResponse.json({ error: 'Could not update session.' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('PATCH /api/sessions/[id] error:', error)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
