'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function AvailabilityCheckIn() {
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async (available: boolean) => {
    setLoading(true)
    try {
      const { error } = await supabase.from('availability_check_ins').insert({
        available,
        checked_in_at: new Date(),
      })

      if (error) throw error

      setIsAvailable(available)
      setSubmitted(true)
    } catch (error) {
      console.error('Error:', error)
      alert('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="text-center text-white">
          <h1 className="text-3xl font-bold mb-4">
            {isAvailable ? '✓ Thanks for letting us know!' : '✗ No problem!'}
          </h1>
          <p className="text-lg text-slate-300">
            {isAvailable
              ? "We'll be in touch soon for your session."
              : 'Feel free to check back anytime.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
      <div className="bg-slate-800 p-8 rounded-lg shadow-2xl max-w-md w-full">
        <h1 className="text-2xl font-bold text-white mb-2">Bond Session</h1>
        <p className="text-slate-300 mb-6">Are you available for a session right now?</p>

        <div className="flex gap-4">
          <button
            onClick={() => handleSubmit(true)}
            disabled={loading}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-lg disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Yes'}
          </button>
          <button
            onClick={() => handleSubmit(false)}
            disabled={loading}
            className="flex-1 bg-slate-600 hover:bg-slate-700 text-white font-semibold py-3 rounded-lg disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'No'}
          </button>
        </div>
      </div>
    </div>
  )
}