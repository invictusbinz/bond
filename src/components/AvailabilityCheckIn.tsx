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
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#faf8f4' }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital@0;1&family=DM+Sans:wght@300;400;500&display=swap');
          body { font-family: 'DM Sans', sans-serif; }
        `}</style>
        <div className="max-w-md text-center px-6">
          <div className="mb-6" style={{ fontSize: '48px' }}>
            {isAvailable ? '✓' : '—'}
          </div>
          <h1
            className="mb-3"
            style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: '32px',
              fontWeight: 400,
              color: '#1a1714',
              lineHeight: 1.2,
            }}
          >
            {isAvailable ? 'Thanks for letting us know.' : 'No problem.'}
          </h1>
          <p
            style={{
              color: '#4a4540',
              fontSize: '15px',
              lineHeight: 1.7,
            }}
          >
            {isAvailable
              ? "We're glad you're here and ready. Your session is waiting."
              : 'Feel free to check back whenever you're ready.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: '#faf8f4' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital@0;1&family=DM+Sans:wght@300;400;500&family=DM+Mono@0;1&display=swap');
        body { font-family: 'DM Sans', sans-serif; }
      `}</style>

      <div
        className="w-full max-w-md p-10"
        style={{
          backgroundColor: 'white',
          border: '1px solid #e0d8cc',
          borderRadius: '8px',
        }}
      >
        {/* Eyebrow label */}
        <div
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: '10px',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: '#c4622d',
            marginBottom: '20px',
          }}
        >
          Availability Check-In
        </div>

        {/* Title */}
        <h1
          style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: '28px',
            fontWeight: 400,
            color: '#1a1714',
            marginBottom: '12px',
            lineHeight: 1.2,
          }}
        >
          How are you showing up right now?
        </h1>

        {/* Subtitle */}
        <p
          style={{
            fontSize: '15px',
            color: '#4a4540',
            lineHeight: 1.7,
            marginBottom: '32px',
          }}
        >
          Before we begin, let's check in. Are you emotionally available for this conversation?
        </p>

        {/* Button container */}
        <div className="space-y-3">
          <button
            onClick={() => handleSubmit(true)}
            disabled={loading}
            className="w-full py-3 px-4 rounded-lg transition-all"
            style={{
              backgroundColor: loading ? '#c4622d' : '#c4622d',
              color: 'white',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '14px',
              fontWeight: 500,
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
            onMouseEnter={(e) => {
              if (!loading) e.currentTarget.style.backgroundColor = '#a0481f'
            }}
            onMouseLeave={(e) => {
              if (!loading) e.currentTarget.style.backgroundColor = '#c4622d'
            }}
          >
            {loading ? 'Saving...' : 'Yes, I'm ready'}
          </button>

          <button
            onClick={() => handleSubmit(false)}
            disabled={loading}
            className="w-full py-3 px-4 rounded-lg transition-all"
            style={{
              backgroundColor: 'transparent',
              color: '#4a4540',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '14px',
              fontWeight: 500,
              border: '1px solid #e0d8cc',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.borderColor = '#c4622d'
                e.currentTarget.style.color = '#c4622d'
              }
            }}
            onMouseLeave={(e) => {
              if (!loading) {
                e.currentTarget.style.borderColor = '#e0d8cc'
                e.currentTarget.style.color = '#4a4540'
              }
            }}
          >
            {loading ? 'Saving...' : 'Not right now'}
          </button>
        </div>

        {/* Helper text */}
        <p
          style={{
            fontSize: '12px',
            color: '#8a8480',
            lineHeight: 1.6,
            marginTop: '24px',
            paddingTop: '20px',
            borderTop: '1px solid #e0d8cc',
          }}
        >
          This check-in helps us understand your readiness. If you're depleted or defensive, that's okay—just let us know.
        </p>
      </div>
    </div>
  )
}