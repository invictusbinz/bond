// POST /api/notifications/send
//
// Sends a web push notification to one or both people in a session via OneSignal.
// Called server-side at key session moments.
//
// Supported events:
//   'b_joined'        — Person B checked in and is ready. Notifies Person A.
//   'synthesis_ready' — Synthesis is complete. Notifies both Person A and Person B.
//
// Body: { sessionId, event }
//
// Silent-fails gracefully: if no subscriptions exist (users never opted in),
// the route returns ok:true with sent:0 — no error thrown.
// This ensures notification logic never blocks or breaks the main session flow.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ─── Types ────────────────────────────────────────────────────────────────────

type Event = 'b_joined' | 'synthesis_ready'

// ─── Copy per event ───────────────────────────────────────────────────────────

function getNotificationCopy(
  event: Event,
  names: { personAName?: string | null; personBName?: string | null }
): { heading: string; body: string } {
  const bName = names.personBName || 'They'

  switch (event) {
    case 'b_joined':
      return {
        heading: 'Bond',
        body: `${bName} has checked in and is ready to share their side.`,
      }
    case 'synthesis_ready':
      return {
        heading: 'Bond',
        body: "Your synthesis is ready. Come back when you're ready to read it.",
      }
  }
}

// ─── OneSignal REST API call ──────────────────────────────────────────────────

async function sendPushToPlayerIds(
  playerIds: string[],
  heading: string,
  body: string
): Promise<void> {
  if (!playerIds.length) return

  const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID
  const restApiKey = process.env.ONESIGNAL_REST_API_KEY

  if (!appId || !restApiKey) {
    console.warn('OneSignal env vars not set — skipping push notification.')
    return
  }

  const payload = {
    app_id: appId,
    // New API uses include_subscription_ids (v16+ SDK stores subscription IDs, not legacy player IDs)
    include_subscription_ids: playerIds,
    headings: { en: heading },
    contents: { en: body },
    // Tapping the notification opens the Bond app.
    // Post-auth this should deep-link to the specific session.
    web_url: process.env.NEXT_PUBLIC_APP_URL || 'https://bond-lovat-xi.vercel.app',
  }

  // New OneSignal API (Nov 2024): endpoint and auth header format both changed.
  // Old: POST https://onesignal.com/api/v1/notifications + Authorization: Basic KEY
  // New: POST https://api.onesignal.com/notifications?c=push + Authorization: Key KEY
  const response = await fetch('https://api.onesignal.com/notifications?c=push', {
    method: 'POST',
    headers: {
      Authorization: `Key ${restApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('OneSignal REST API error:', response.status, errorText)
    // Non-throwing: notification failure should never crash the session flow
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const { sessionId, event } = await request.json()

    if (!sessionId || !event) {
      return NextResponse.json({ error: 'sessionId and event are required.' }, { status: 400 })
    }

    if (!['b_joined', 'synthesis_ready'].includes(event)) {
      return NextResponse.json({ error: 'Unknown event.' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // ── Fetch session names for notification copy ────────────────────────────
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('person_a_name, person_b_name')
      .eq('id', sessionId)
      .single()

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found.' }, { status: 404 })
    }

    // ── Decide who gets notified based on the event ──────────────────────────
    // b_joined: only Person A needs to know
    // synthesis_ready: both people should come back
    const peopleToNotify = event === 'b_joined' ? ['a'] : ['a', 'b']

    // ── Look up stored OneSignal player IDs ──────────────────────────────────
    const { data: subscriptions, error: subError } = await supabase
      .from('notification_subscriptions')
      .select('person, onesignal_player_id')
      .eq('session_id', sessionId)
      .in('person', peopleToNotify)

    if (subError) {
      console.error('Notification subscription lookup error:', subError)
    }

    if (!subscriptions || subscriptions.length === 0) {
      // Nobody opted in — silent success. This is expected if users skipped the prompt.
      return NextResponse.json({ ok: true, sent: 0 })
    }

    const playerIds = subscriptions.map(s => s.onesignal_player_id)
    const copy = getNotificationCopy(event as Event, {
      personAName: session.person_a_name,
      personBName: session.person_b_name,
    })

    await sendPushToPlayerIds(playerIds, copy.heading, copy.body)

    return NextResponse.json({ ok: true, sent: playerIds.length })
  } catch (error) {
    console.error('POST /api/notifications/send error:', error)
    // Non-blocking: notification failures should not surface as errors to users
    return NextResponse.json({ ok: true, sent: 0 })
  }
}
