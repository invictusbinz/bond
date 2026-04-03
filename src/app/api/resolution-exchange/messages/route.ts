// GET /api/resolution-exchange/messages?sessionId=...&token=...
//
// Returns all messages in the resolution exchange for this session, in chronological order.
// Used by ResolutionExchange.tsx to fetch and display the full thread.
//
// Response:
//   messages: Array<{ id, person, content, is_resolution_statement, created_at }>

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('sessionId')
    const token = searchParams.get('token')

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
      .select('person_a_token, person_b_token')
      .eq('id', sessionId)
      .single()

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found.' }, { status: 404 })
    }

    if (token !== session.person_a_token && token !== session.person_b_token) {
      return NextResponse.json({ error: 'Invalid token.' }, { status: 403 })
    }

    // ── Fetch messages ──────────────────────────────────────────────────────
    const { data: messages, error: messagesError } = await supabase
      .from('resolution_messages')
      .select('id, person, content, is_resolution_statement, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })

    if (messagesError) {
      console.error('resolution_messages fetch error:', messagesError)
      throw new Error('Could not load messages.')
    }

    return NextResponse.json({ messages: messages || [] })
  } catch (error) {
    console.error('GET /api/resolution-exchange/messages error:', error)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
