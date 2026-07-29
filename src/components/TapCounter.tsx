interface TapCounterProps {
  value: number
  onChange: (next: number) => void
}

export default function TapCounter({ value, onChange }: TapCounterProps) {
  return (
    <div className="form-row">
      <div style={{ fontSize: '2.5rem', textAlign: 'center' }}>{value}</div>
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
          if (!Number.isNaN(next)) onChange(next)
        }}
      />
    </div>
  )
}
