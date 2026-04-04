// onesignal.ts — client-side helper for OneSignal web push.
//
// Uses the OneSignal CDN SDK directly — no npm package required.
// Only call these functions from client components (never from server components or API routes).
// For server-side notification triggers, call /api/notifications/send instead.
//
// Usage:
//   const playerId = await subscribeToNotifications()
//   if (playerId) {
//     await saveSubscription({ sessionId, person: 'a', playerId, token })
//   }

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── Types ────────────────────────────────────────────────────────────────────

declare global {
  interface Window {
    // OneSignal v16 deferred queue — SDK consumes this array once it loads.
    OneSignalDeferred?: ((oss: any) => void | Promise<void>)[]
    // The live SDK instance, available after init.
    OneSignal?: any
  }
}

// ─── State ────────────────────────────────────────────────────────────────────

// Singleton promise: init runs at most once per page load.
let _initPromise: Promise<any> | null = null

// ─── Script injection ─────────────────────────────────────────────────────────

function injectScript(): void {
  if (typeof document === 'undefined') return
  if (document.getElementById('onesignal-sdk')) return // already injected
  const s = document.createElement('script')
  s.id = 'onesignal-sdk'
  s.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js'
  s.defer = true
  document.head.appendChild(s)
}

// ─── Init ─────────────────────────────────────────────────────────────────────

// Loads the OneSignal SDK from CDN and initialises it with the Bond app ID.
// Returns the OneSignal instance once ready, or null if unavailable.
// Safe to call multiple times — only initialises once.
export function initOneSignal(): Promise<any> {
  if (typeof window === 'undefined') return Promise.resolve(null)

  const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID
  if (!appId) {
    console.warn('OneSignal: NEXT_PUBLIC_ONESIGNAL_APP_ID is not set — notifications disabled.')
    return Promise.resolve(null)
  }

  if (_initPromise) return _initPromise

  _initPromise = new Promise((resolve) => {
    injectScript()

    // 8-second timeout fallback in case the CDN is blocked
    const timeout = setTimeout(() => {
      console.warn('OneSignal init timed out. CDN might be blocked.')
      resolve(null)
    }, 8000)

    window.OneSignalDeferred = window.OneSignalDeferred || []
    window.OneSignalDeferred.push(async (oss: any) => {
      clearTimeout(timeout)
      try {
        await oss.init({
          appId,
          // Treat localhost as a secure origin so we can test locally over HTTP.
          // Has no effect on production (HTTPS is always secure).
          allowLocalhostAsSecureOrigin: true,
          // We manage our own opt-in UI — disable the built-in bell widget.
          notifyButton: { enable: false },
        })
        resolve(oss)
      } catch (err) {
        console.error('OneSignal init error:', err)
        resolve(null) // non-throwing — notification failure never blocks the session
      }
    })
  })

  return _initPromise
}

// ─── Support check ────────────────────────────────────────────────────────────

// Returns true if this browser supports web push notifications.
// Some browsers (iOS Safari pre-16.4, certain in-app browsers) do not.
export function isNotificationsSupported(): boolean {
  if (typeof window === 'undefined') return false
  return 'Notification' in window && 'serviceWorker' in navigator
}

// ─── Subscribe ────────────────────────────────────────────────────────────────

// Requests notification permission from the browser and returns the OneSignal
// subscription/player ID. Returns null if:
//   - user declines the browser permission dialog
//   - browser doesn't support push
//   - OneSignal isn't configured (env var missing)
//   - anything else goes wrong
//
// The returned ID is what you pass to saveSubscription() to store it server-side.
export async function subscribeToNotifications(): Promise<string | null> {
  if (!isNotificationsSupported()) return null

  try {
    const oss = await initOneSignal()
    if (!oss) return null

    // Triggers the browser's native permission dialog
    const accepted = await oss.Notifications.requestPermission()
    if (!accepted) return null

    // The subscription ID may take a short moment to register after permission is granted.
    // Poll for up to 5 seconds before giving up.
    for (let i = 0; i < 10; i++) {
      const id: string | undefined = oss.User?.PushSubscription?.id
      if (id) return id
      await new Promise(r => setTimeout(r, 500))
    }

    return null
  } catch (err) {
    console.error('OneSignal subscription error:', err)
    return null
  }
}

// ─── Save subscription ────────────────────────────────────────────────────────

// Sends the player ID to Bond's backend to store in notification_subscriptions.
// person: 'a' or 'b' — which person in this session is subscribing
// token: the caller's session auth token (verified server-side)
export async function saveSubscription(opts: {
  sessionId: string
  person: 'a' | 'b'
  playerId: string
  token: string
}): Promise<void> {
  try {
    await fetch('/api/notifications/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts),
    })
  } catch (err) {
    console.error('OneSignal save subscription error:', err)
  }
}
