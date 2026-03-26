'use client'

// Person B's full journey lives here:
//
//   availability  →  Check-in: how are they feeling right now?
//   orientation   →  Intention-setting + neutral summary of what Person A shared
//   intake        →  Person B shares their own side (AI-guided, private)
//
// Person A's journey is at /intake.

import { useState } from 'react'
import AvailabilityCheckIn from '@/components/AvailabilityCheckIn'
import OrientationPersonB from '@/components/OrientationPersonB'
import IntakePersonB from '@/components/IntakePersonB'

type Flow = 'availability' | 'orientation' | 'intake'

export default function Home() {
  const [flow, setFlow] = useState<Flow>('availability')
  // The neutral summary of Person A's side, generated during orientation.
  // Passed to IntakePersonB so the AI can use it as background context.
  const [partnerSummary, setPartnerSummary] = useState('')

  if (flow === 'intake') {
    return <IntakePersonB partnerSummary={partnerSummary} />
  }

  if (flow === 'orientation') {
    return (
      <OrientationPersonB
        onReady={(summary) => {
          setPartnerSummary(summary)
          setFlow('intake')
        }}
      />
    )
  }

  return <AvailabilityCheckIn onReady={() => setFlow('orientation')} />
}
