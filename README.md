# Bond

A private space for two people to communicate better.

Bond is an AI-native tool for working through conflict. Each person shares their side privately with the AI — in their own time, on their own device. The AI synthesises a personalised view for each person: first validating their own experience, then introducing their partner's perspective with care. Neither person ever sees what the other wrote. Only the synthesis is shared.

**Live:** [bond-lovat-xi.vercel.app](https://bond-lovat-xi.vercel.app)

---

## Stack

| Layer | Tool |
|---|---|
| Frontend + backend | Next.js 15 (App Router) |
| Database | Supabase (Postgres + JSONB) |
| AI | Claude API (Sonnet for synthesis/intake/debrief, Haiku for summaries) |
| Hosting | Vercel (auto-deploys from `main`) |

---

## Running locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Environment variables

Required in `.env.local` (local) and Vercel → Settings → Environment Variables (production):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PRIVATE_CLAUDE_API_KEY=
```

---

## How a session works

1. **Person A starts a session** — enters their name, partner's name, relationship type, and a short description of what happened. Selects a mode: *I need to be heard* or *We need to figure something out.*
2. **Person A does their intake** — AI-guided conversation, up to 5 turns. Therapeutic rules: no mirroring openers, no fear amplification, redirect conclusions about the other person back to the speaker's own feelings.
3. **Person A shares a join link** — a unique join code links Person B into the session.
4. **Person B checks in** — availability check (ready / stressed but here / not a good time). If not ready, they can quietly come back or notify Person A. If stressed, the AI adjusts pacing.
5. **Person B does their intake** — same AI-guided format, with Person A's emotional context available as background (never surfaced in responses).
6. **AI synthesises** — generates two separate views using EFT + NVC principles. Each view opens by validating that person's experience, then introduces the other person's perspective with care. Stored as `a_view` / `b_view` in `synthesis_outputs`.
7. **Accuracy check** — each person privately rates whether their view felt accurate. If either says partial or no, one revised synthesis is generated. One revision maximum.
8. **Checkpoint** — each person privately answers whether they want to work through it together.
9. **Resolution** — ⚠️ *Currently placeholder. Deprecated and being redesigned. See below.*
10. **Debrief** — after closing, each person can access a private coaching reflection generated from their own intake, synthesis view, and resolution answer only.

---

## What's built

### Session flow — fully built

| Component | File | Notes |
|---|---|---|
| Homepage | `/app/page.tsx` | Thin wrapper → SessionStart |
| SessionStart | `SessionStart.tsx` | 3-phase typeform: name → partner name + relationship → mode. Join code entry at bottom. |
| AvailabilityCheckIn | `AvailabilityCheckIn.tsx` | Name entry → context reveal → 3-option check-in → not-ready sub-flow with explicit notification choice |
| OrientationPersonB | `OrientationPersonB.tsx` | AI-generated 2–3 sentence summary of Person A's emotional state + escape hatch |
| IntakePersonA | `IntakePersonA.tsx` | AI chat, hard stop at 5 turns, 3.5s reveal delay before continue button, forceClose escape hatch, localStorage persistence |
| IntakePersonB | `IntakePersonB.tsx` | Same structure + collapsible context strip ("What they're carrying") |
| WaitingScreen | `WaitingScreen.tsx` | All status variants, personalised with partner's name |
| SynthesisView | `SynthesisView.tsx` | Renders `a_view` / `b_view`. Fallback for legacy 4-section format. Inline checkpoint on revised path. |
| CheckpointView | `CheckpointView.tsx` | Used on the v1 (non-revised) path |
| ResolutionView | `ResolutionView.tsx` | ⚠️ Placeholder — private commitment question. Being replaced. |
| ClosingView | `ClosingView.tsx` | "You both showed up for this." + debrief CTA |
| ClosedScreen | Inline in session page | For sessions that ended at checkpoint ("not yet") |
| Session page | `/session/[id]/page.tsx` | Universal router. Identifies person by token, routes by status. Fast poll (4s) / slow poll (10s). |

### API routes

| Route | Purpose |
|---|---|
| `POST /api/sessions` | Creates session with 3 name fields + join code + tokens |
| `GET/PATCH /api/sessions/[id]` | Reads session or updates status / person_b_name |
| `POST /api/intake` | Person A intake AI (Sonnet, max 300 tokens) |
| `POST /api/intake-b` | Person B intake AI (Sonnet, max 300 tokens). Sets `b_active` on first message. |
| `POST /api/synthesize` | Generates `a_view` + `b_view` (Sonnet, max 2048 tokens). Idempotent. |
| `GET /api/synthesis` | Returns latest synthesis for session |
| `GET /api/summarize-person-a` | Generates 2–3 sentence neutral summary for Person B orientation (Sonnet, max 350 tokens) |
| `POST /api/post-synthesis` | Reads accuracy responses → `checkpoint_ready` or revision (v2) |
| `POST /api/post-checkpoint` | Reads checkpoint responses → `resolution_ready` or `closed` |
| `POST /api/post-resolution` | Advances to `closing_ready` |
| `POST /api/debrief` | Generates per-person private coaching reflection (Sonnet, max 800 tokens) |
| `POST /api/session-response` | Saves a step response. Checks if partner responded. Sets `both_responded_[step]` when both are in. |
| `GET /api/join` | Looks up session by join code. Returns sessionId + personBToken. |

### Database

Supabase Postgres. Key tables: `sessions`, `intake_responses`, `synthesis_outputs`, `session_responses`.

Sessions table has: `id`, `mode`, `status`, `person_a_token`, `person_b_token`, `join_code`, `created_at`, `a_intake_summary`, `b_intake_summary`, `person_a_name`, `partner_nickname`, `partner_relationship`, `person_b_name`.

Unique constraints: `intake_responses (session_id, person)` and `session_responses (session_id, person, step)`.

---

## Status machine

The reachable statuses in order:

```
a_intake → awaiting_b → b_active → synthesis_generating → synthesis_ready
→ both_responded_synthesis → [checkpoint_ready | synthesis_revising]
→ synthesis_revised → both_responded_checkpoint
→ [resolution_ready | closed]
→ both_responded_resolution → closing_ready
```

Ghost statuses (defined in routing, never set by any route): `closing_generating`, `both_complete`, `not_ready`, `checkpoint_split`.

---

## What's in progress / next

### Resolution redesign (priority)

The current resolution step (`ResolutionView` → private commitment → close) is deprecated. It's cosmetic — both people answer a private question and the session closes without any shared output or facilitated exchange. The redesign will build real Bond-mediated exchange between both people, producing shared output both can hold. The mechanics are being spec'd before any code is written.

The entire post-synthesis flow (checkpoint onward) should be treated as placeholder until the redesign ships.

### Not yet started

| Feature | Notes |
|---|---|
| Notifications | `console.log` placeholder. OneSignal (web push) planned. Deferred for prototype. |
| Dispatches | Solo processing within a Bond. Post-prototype. |
| The Foundation | Shared agreements document. AI references during sessions. Post-prototype. |
| The Archive | Shared + private memory. Post-prototype. |
| The Thread | Longitudinal cross-session memory. Post-prototype. |
| Auth / user accounts | Token-based identity in localStorage is sufficient for two-person prototype. |

---

## Project docs

Full context, decisions log, audit, copy principles, and build brief live in the `Bond` docs folder (separate from this codebase). The code is the source of truth — docs are reference.

---

## AI prompts

Extracted to `Bond/_prompts/`: `intake-a.md`, `intake-b.md`, `synthesis.md`, `revision.md`, `debrief.md`, `summarize-person-a.md`. Reference these when adjusting AI behaviour — do not edit prompts directly in route files without updating the docs.
