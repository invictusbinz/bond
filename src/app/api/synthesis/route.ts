// GET /api/synthesis?sessionId=[id]
// Returns the latest synthesis content for a session.
// Used by the session page to load synthesis into SynthesisView.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('sessionId')

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required.' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Get the latest synthesis — order by version desc in case of revision
    const { data, error } = await supabase
      .from('synthesis_outputs')
      .select('content, version, created_at')
      .eq('session_id', sessionId)
      .order('version', { ascending: false })
      .limit(1)
      .single()

    if (error || !data) {
      return NextResponse.json({ content: null })
    }

    return NextResponse.json({ content: data.content, version: data.version })
  } catch (error) {
    console.error('GET /api/synthesis error:', error)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
