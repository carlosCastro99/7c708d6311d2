import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
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
  const [pass1Id, setPass1Id] = useState<string | null>(null)
  const [pass2Id, setPass2Id] = useState<string | null>(null)
  const [pass3Id, setPass3Id] = useState<string | null>(null)
  const [passesLoaded, setPassesLoaded] = useState(false)
  const [mismatchedPairs, setMismatchedPairs] = useState<Array<{ zoneId: string; materialId: string }>>([])
  // Set once a completion path fires, alongside clearing the session -- if we
  // relied on `!session` alone to detect "done," the completion message would
  // never actually be visible: clearing the session and the child page's own
  // "done" render happen in the same tick, and the `!session` early return
  // below would win, replacing the message with the generic "no active
  // session" fallback before the user ever saw it.
  const [finished, setFinished] = useState<'closed_single_pass' | 'successful' | 'resolved' | null>(null)

  // Reconstruct which of this inventory's real InventoryPass rows is 1/2/3
  // from Dexie on mount, rather than trusting transient component state. The
  // wizard can mount fresh at any pass -- e.g. via "Resume" from the
  // Inventories list, which points the session at whichever pass is
  // currently furthest along -- so there is no guarantee session.passId is
  // pass 1. Same-mount transitions (starting pass 2 or pass 3 while this
  // component stays mounted) still update this state directly below.
  useEffect(() => {
    if (!session) return
    ;(async () => {
      const passes = await db.passes.where('inventoryId').equals(session.inventoryId).toArray()
      setPass1Id(passes.find((p) => p.passNumber === 1)?.id ?? null)
      setPass2Id(passes.find((p) => p.passNumber === 2)?.id ?? null)
      setPass3Id(passes.find((p) => p.passNumber === 3)?.id ?? null)
      setPassesLoaded(true)
    })()
  }, [session?.inventoryId])

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

  if (finished) {
    const { heading, message } = {
      closed_single_pass: { heading: 'Inventory Complete', message: 'Inventory finished with a single pass.' },
      successful: { heading: 'Inventory Successful', message: 'Both passes matched on every zone and material.' },
      resolved: { heading: 'Inventory Complete', message: 'All mismatches have been resolved.' },
    }[finished]
    return (
      <div className="screen">
        <div className="status-banner status-success">
          <span className="status-icon" aria-hidden="true">✓</span>
          <div>
            <h1>{heading}</h1>
            <p>{message}</p>
          </div>
        </div>
        <Link to="/inventories" className="link-button">Back to Inventories</Link>
      </div>
    )
  }

  if (!session) return <div className="screen">No active session — go to Inventories to resume.</div>
  if (!passesLoaded) return <div className="screen">Loading…</div>

  const { userId, inventoryId } = session
  const passId = session.passId
  const onThirdPass = passId === pass3Id

  if (step === 'zone-picker') {
    return (
      <div className="stacked-screens">
        <div className="screen screen-compact">
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
            const zc = await getOrOpenZoneCount(passId, zoneId, userId)
            setZoneCountId(zc.id)
            setStep('material-picker')
          }}
        />
      </div>
    )
  }

  if (step === 'material-picker') {
    return (
      <MaterialPickerPage
        zoneCountId={zoneCountId!}
        onMaterialChosen={async (materialId) => {
          const zoneId = session.zoneId!
          setSession({ ...session, materialId })
          const existingLine = await db.countLines.where({ zoneCountId: zoneCountId!, materialId }).first()
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
        onBack={() => setStep(onThirdPass ? 'third-pass-picker' : 'material-picker')}
      />
    )
  }

  if (step === 'zone-summary') {
    return (
      <ZoneSummaryPage
        zoneCountId={zoneCountId!}
        userId={userId}
        onClosed={() => setStep(onThirdPass ? 'third-pass-picker' : 'zone-picker')}
        onCountAnother={onThirdPass ? undefined : () => setStep('material-picker')}
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
        userId={userId}
        onResolved={(outcome, newPass3Id) => {
          if (outcome === 'successful') {
            setFinished('successful')
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
        onResolved={() => {
          setFinished('resolved')
          setSession(null)
        }}
      />
    )
  }

  return (
    <PassClosePage
      passId={passId}
      inventoryId={inventoryId}
      userId={userId}
      onFinishedSinglePass={() => {
        setFinished('closed_single_pass')
        setSession(null)
      }}
      onSecondPassStarted={(newPass2Id) => {
        setPass2Id(newPass2Id)
        setSession({ ...session, passId: newPass2Id, zoneId: undefined, materialId: undefined })
        setStep('zone-picker')
      }}
    />
  )
}
