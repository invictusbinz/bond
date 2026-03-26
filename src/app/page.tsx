'use client'

// Person B's full journey lives here:
//   1. Availability Check-In — how are they feeling right now?
//   2. Intake — share their side of the situation (private, AI-guided)
//
// Person A's journey is at /intake.

import { useState } from 'react'
import AvailabilityCheckIn from '@/components/AvailabilityCheckIn'
import IntakePersonB from '@/components/IntakePersonB'

type Flow = 'availability' | 'intake'

export default function Home() {
  const [flow, setFlow] = useState<Flow>('availability')

  if (flow === 'intake') {
    return <IntakePersonB />
  }

  // Pass onReady so that when Person B confirms they're ready,
  // we transition them directly into their intake.
  return <AvailabilityCheckIn onReady={() => setFlow('intake')} />
}
