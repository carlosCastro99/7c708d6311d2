interface ThirdPassPickerPageProps {
  mismatches: Array<{ zoneId: string; materialId: string }>
  onPairChosen: (zoneId: string, materialId: string) => void
}

export default function ThirdPassPickerPage({ mismatches, onPairChosen }: ThirdPassPickerPageProps) {
  return (
    <div className="screen">
      <h1>Third Pass — Recount Mismatches</h1>
      <ul>
        {mismatches.map((m) => (
          <li key={`${m.zoneId}-${m.materialId}`}>
            <button
              className="secondary"
              style={{ width: '100%' }}
              onClick={() => onPairChosen(m.zoneId, m.materialId)}
            >
              Zone {m.zoneId} / Material {m.materialId}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
