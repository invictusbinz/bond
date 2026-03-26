# Bond

A private space for two people to communicate better.

Bond is an AI-native relational platform. It receives each person's side privately, synthesizes a neutral shared view, and helps both people feel heard — without either person ever seeing what the other wrote.

## Stack

- **Next.js** — frontend + backend logic (App Router)
- **Supabase** — database + auth
- **Claude API** — AI synthesis, intake, debrief
- **Vercel** — hosting (auto-deploys from main branch)

## Running locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

Two places — both must match:

- **Local:** `.env.local` in project root
- **Production:** Vercel → Settings → Environment Variables

Required vars:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PRIVATE_CLAUDE_API_KEY=
```

## What's built

| Screen | Route | Status |
|---|---|---|
| Availability Check-In | `/` | ✅ Live |
| Session Initiation + Intake (Person A) | `/intake` | ✅ Live |

## Project docs

Full context, decisions log, and build brief live in the Bond docs folder (separate from this codebase).
