'use client'

// WaitingScreen — shown to either person when they've completed their part
// and are waiting for the other person or for Bond to finish processing.

const C = {
  ink: '#1a1714',
  paper: '#faf8f4',
  white: '#ffffff',
  accent: '#c4622d',
  rule: '#e0d8cc',
  muted: '#6b6560',
  greenSoft: '#d4e8dc',
  green: '#3d6b4f',
}

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital@0;1&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400&display=swap');`

type Props = {
  message: string       // headline, e.g. "Your side is in."
  subMessage: string    // explanation of what happens next
  sessionId?: string    // unused now, reserved for future status polling
  token?: string        // unused now, reserved for future status polling
}

export default function WaitingScreen({ message, subMessage }: Props) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: C.paper,
        padding: '24px',
      }}
    >
      <style>{`
        ${FONTS}
        body { font-family: 'DM Sans', sans-serif; }
        @keyframes breathe {
          0%, 100% { opacity: 0.4; transform: scale(0.95); }
          50%       { opacity: 1;   transform: scale(1.05); }
        }
      `}</style>

      <div style={{ width: '100%', maxWidth: '440px', textAlign: 'center' }}>

        {/* Animated circle — gentle, not urgent */}
        <div
          style={{
            width: '52px',
            height: '52px',
            borderRadius: '50%',
            backgroundColor: C.greenSoft,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 28px',
            animation: 'breathe 3s ease-in-out infinite',
          }}
        >
          <div
            style={{
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              backgroundColor: C.green,
              opacity: 0.7,
            }}
          />
        </div>

        <h2
          style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: '26px',
            fontWeight: 400,
            color: C.ink,
            marginBottom: '14px',
            lineHeight: 1.3,
          }}
        >
          {message}
        </h2>

        <p
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '15px',
            color: C.muted,
            lineHeight: 1.75,
          }}
        >
          {subMessage}
        </p>

      </div>
    </div>
  )
}
