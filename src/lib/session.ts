// ─── Bond Session Utilities ───────────────────────────────────────────────────
//
// Token-based identity (pre-auth prototype).
//
// Two UUID tokens exist per session — one for Person A, one for Person B.
// They are stored in localStorage under the key `bond_token_{sessionId}`.
// The app reads these to know who you are and which session you're in.
//
// When real auth is added, this entire file is replaced with JWT-based identity.
// Nothing else in the codebase changes — session data model stays the same.

export const SESSION_STORAGE_KEY = (sessionId: string) => `bond_token_${sessionId}`
export const CURRENT_SESSION_KEY = 'bond_current_session'

export type SessionRole = 'a' | 'b'

// ─── Save token to localStorage ───────────────────────────────────────────────

export function saveToken(sessionId: string, token: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(SESSION_STORAGE_KEY(sessionId), token)
  localStorage.setItem(CURRENT_SESSION_KEY, sessionId)
}

// ─── Read token from localStorage ─────────────────────────────────────────────

export function getToken(sessionId: string): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(SESSION_STORAGE_KEY(sessionId))
}

// ─── Get the most recent session this browser has been part of ─────────────────

export function getCurrentSessionId(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(CURRENT_SESSION_KEY)
}

// ─── Clear session data (used when starting fresh) ────────────────────────────

export function clearSession(sessionId: string): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(SESSION_STORAGE_KEY(sessionId))
  const current = getCurrentSessionId()
  if (current === sessionId) {
    localStorage.removeItem(CURRENT_SESSION_KEY)
  }
}

// ─── Generate a 6-character join code ─────────────────────────────────────────
// Used server-side when creating a session. Stored on the session record.
// Human-friendly: no 0/O/1/I confusion. Uppercase only.

export function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}
