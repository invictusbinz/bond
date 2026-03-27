// GET  /api/sessions/[id]   — fetch session data (status, mode, tokens for verification)
// PATCH /api/sessions/[id]  — update session status

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type Params = { params: { id: string } }

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { data, error } = await supabase
      .from('sessions')
      .select('id, mode, status, person_a_token, person_b_token, join_code, created_at')
      .eq('id', params.id)
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
    const { status, token } = await request.json()

    if (!status) {
      return NextResponse.json({ error: 'status is required.' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Verify the caller has a valid token for this session before allowing status update
    const { data: session, error: fetchError } = await supabase
      .from('sessions')
      .select('person_a_token, person_b_token')
      .eq('id', params.id)
      .single()

    if (fetchError || !session) {
      return NextResponse.json({ error: 'Session not found.' }, { status: 404 })
    }

    if (token !== session.person_a_token && token !== session.person_b_token) {
      return NextResponse.json({ error: 'Invalid token.' }, { status: 403 })
    }

    const { error: updateError } = await supabase
      .from('sessions')
      .update({ status })
      .eq('id', params.id)

    if (updateError) {
      console.error('Session status update error:', updateError)
      return NextResponse.json({ error: 'Could not update session.' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('PATCH /api/sessions/[id] error:', error)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
