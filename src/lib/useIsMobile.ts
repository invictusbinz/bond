// useIsMobile — returns true when viewport width is below 640px.
//
// Defaults to false on the server (and on first render before mount)
// so there's no hydration mismatch. The snap to mobile happens immediately
// after mount on small screens, which is fast enough to be imperceptible.
//
// Usage:
//   const m = useIsMobile()
//   style={{ padding: m ? '16px' : '24px' }}

import { useEffect, useState } from 'react'

const MOBILE_BREAKPOINT = 640

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  return isMobile
}
