import { useEffect, useState } from 'react'
import { useCountingSession } from '../../context/CountingSession'
import { getOrOpenZoneCount, getPassLines } from '../../db/repositories/inventoryRepository'
import { getExpectedQuantity } from '../../db/repositories/expectedQuantityRepository'
import { comparePasses } from '../../domain/reconciliation'
import { db } from '../../db/schema'
import ZonePickerPage from './ZonePickerPage'
import MaterialPickerPage from './MaterialPickerPage'
import CountingScreen from './CountingScreen'
import ZoneSummaryPage from './ZoneSummaryPage'
import PassClosePage from './PassClosePage'
import VarianceReportPage from './VarianceReportPage'
import ThirdPassPickerPage from './ThirdPassPickerPage'
import ManualResolutionPage from './ManualResolutionPage'

type Step = 'zone-picker' | 'material-picker' | 'counting' | 'zone-summary' | 'pass-close' | 'third-pass-picker'

export default function CountingWizard() {
  const { session, setSession } = useCountingSession()
  const [step, setStep] = useState<Step>('zone-picker')
  const [zoneCountId, setZoneCountId] = useState<string | null>(null)
  const [initialQuantity, setInitialQuantity] = useState(0)
  const [expectedQuantity, setExpectedQuantity] = useState<number | undefined>(undefined)
  // pass1Id is captured once, when the wizard first mounts with a valid session
  // (always true in real usage -- StartInventoryRoute / InventoriesListPage
  // write the session before navigating here). It stays fixed across the
  // pass1 -> pass2 -> pass3 transitions that happen within this same mount.
  const [pass1Id] = useState<string | null>(() => session?.passId ?? null)
  const [pass2Id, setPass2Id] = useState<string | null>(null)
  const [pass3Id, setPass3Id] = useState<string | null>(null)
  const [mismatchedPairs, setMismatchedPairs] = useState<Array<{ zoneId: string; materialId: string }>>([])

  // Compute the scoped third-pass mismatch list once pass 3 starts -- this is
  // what ThirdPassPickerPage's `mismatches` prop needs, and nothing else in
  // this component populates it otherwise.
  useEffect(() => {
    if (!pass1Id || !pass2Id || !pass3Id) return
    ;(async () => {
      const pass1Lines = await getPassLines(pass1Id)
      const pass2Lines = await getPassLines(pass2Id)
      const { mismatched } = comparePasses(pass1Lines, pass2Lines)
      setMismatchedPairs(mismatched.map((m) => ({ zoneId: m.zoneId, materialId: m.materialId })))
    })()
  }, [pass1Id, pass2Id, pass3Id])

  if (!session) return <div className="screen">No active session — go to Inventories to resume.</div>

  const { userId, inventoryId } = session
  const passId = session.passId
  const onThirdPass = passId === pass3Id

  if (step === 'zone-picker') {
    return (
      <div>
        <div className="screen" style={{ paddingBottom: 0 }}>
          <button
            type="button"
            className="secondary"
            onClick={() => setStep(onThirdPass ? 'third-pass-picker' : 'pass-close')}
          >
            {onThirdPass ? 'Back to mismatch list' : 'Finish this pass'}
          </button>
        </div>
        <ZonePickerPage
          onZoneChosen={async (zoneId) => {
            setSession({ ...session, zoneId })
            await getOrOpenZoneCount(passId, zoneId, userId)
            setStep('material-picker')
          }}
        />
      </div>
    )
  }

  if (step === 'material-picker') {
    return (
      <MaterialPickerPage
        onMaterialChosen={async (materialId) => {
          const zoneId = session.zoneId!
          setSession({ ...session, materialId })
          const zc = await getOrOpenZoneCount(passId, zoneId, userId)
          setZoneCountId(zc.id)
          const existingLine = await db.countLines.where({ zoneCountId: zc.id, materialId }).first()
          setInitialQuantity(existingLine?.quantity ?? 0)
          setExpectedQuantity(await getExpectedQuantity(zoneId, materialId))
          setStep('counting')
        }}
      />
    )
  }

  if (step === 'counting') {
    return (
      <CountingScreen
        zoneCountId={zoneCountId!}
        materialId={session.materialId!}
        userId={userId}
        expectedQuantity={expectedQuantity}
        initialQuantity={initialQuantity}
        onSaved={() => setStep('zone-summary')}
      />
    )
  }

  if (step === 'zone-summary') {
    return (
      <ZoneSummaryPage
        zoneCountId={zoneCountId!}
        userId={userId}
        onClosed={() => setStep(onThirdPass ? 'third-pass-picker' : 'zone-picker')}
      />
    )
  }

  if (step === 'third-pass-picker') {
    return (
      <ThirdPassPickerPage
        mismatches={mismatchedPairs}
        onPairChosen={async (zoneId, materialId) => {
          setSession({ ...session, zoneId, materialId })
          const zc = await getOrOpenZoneCount(passId, zoneId, userId)
          setZoneCountId(zc.id)
          setInitialQuantity(0)
          setExpectedQuantity(await getExpectedQuantity(zoneId, materialId))
          setStep('counting')
        }}
      />
    )
  }

  // step === 'pass-close': which component renders depends on which pass is
  // currently active, since PassClosePage/VarianceReportPage/ManualResolutionPage
  // each own a different transition (pass1->pass2 or pass1->done, pass2 compare,
  // pass3 resolve).
  if (passId === pass2Id) {
    return (
      <VarianceReportPage
        inventoryId={inventoryId}
        pass1Id={pass1Id!}
        pass2Id={pass2Id}
        onResolved={(outcome, newPass3Id) => {
          if (outcome === 'successful') {
            setSession(null)
          } else if (newPass3Id) {
            setPass3Id(newPass3Id)
            setSession({ ...session, passId: newPass3Id, zoneId: undefined, materialId: undefined })
            setStep('third-pass-picker')
          }
        }}
      />
    )
  }

  if (onThirdPass) {
    return (
      <ManualResolutionPage
        inventoryId={inventoryId}
        pass1Id={pass1Id!}
        pass2Id={pass2Id!}
        pass3Id={pass3Id!}
        userId={userId}
        onResolved={() => setSession(null)}
      />
    )
  }

  return (
    <PassClosePage
      passId={passId}
      inventoryId={inventoryId}
      userId={userId}
      onFinishedSinglePass={() => setSession(null)}
      onSecondPassStarted={(newPass2Id) => {
        setPass2Id(newPass2Id)
        setSession({ ...session, passId: newPass2Id, zoneId: undefined, materialId: undefined })
        setStep('zone-picker')
      }}
    />
  )
}
