// Bond homepage.
//
// Person A lands here → picks a mode → session is created → redirected to /session/[id]
// Person B lands here via invite URL → redirected to /session/[id]?join=[token]
//
// The homepage itself is just the session creation screen.
// All session routing logic lives in /session/[id].

import SessionStart from '@/components/SessionStart'

export default function Home() {
  return <SessionStart />
}
