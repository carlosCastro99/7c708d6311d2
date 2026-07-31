import { useState } from 'react'

interface TapCounterProps {
  value: number
  onChange: (next: number) => void
}

// Values outside this range are almost certainly a fat-finger typo (an
// extra digit, a stray minus sign) rather than a real physical count, so
// they get a confirm step instead of being silently accepted.
const SUSPICIOUS_MIN = 0
const SUSPICIOUS_MAX = 99999

export default function TapCounter({ value, onChange }: TapCounterProps) {
  const [pendingValue, setPendingValue] = useState<number | null>(null)

  return (
    <div className="form-row">
      <div className={`counter-value${value === 0 ? ' counter-value-zero' : ''}`}>{value}</div>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          type="button"
          className="secondary"
          style={{ flex: 1, minHeight: 64 }}
          onClick={() => onChange(value - 1)}
        >
          -1
        </button>
        <button
          type="button"
          style={{ flex: 2, minHeight: 64, fontSize: '1.5rem' }}
          onClick={() => onChange(value + 1)}
        >
          +1
        </button>
      </div>
      <label htmlFor="tap-counter-manual">Or enter quantity manually</label>
      <input
        id="tap-counter-manual"
        aria-label="quantity"
        type="number"
        defaultValue={value}
        key={value}
        onBlur={(e) => {
          const next = Number(e.target.value)
          if (Number.isNaN(next)) return
          if (next < SUSPICIOUS_MIN || next > SUSPICIOUS_MAX) {
            setPendingValue(next)
          } else {
            onChange(next)
          }
        }}
      />
      {pendingValue !== null && (
        <div role="alert" className="confirm-banner">
          <p>{pendingValue} looks unusual for a physical count — sure that's right?</p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => {
                onChange(pendingValue)
                setPendingValue(null)
              }}
            >
              Confirm {pendingValue}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setPendingValue(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
