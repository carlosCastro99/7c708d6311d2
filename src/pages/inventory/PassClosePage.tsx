import { closePass, startNextPass, closeInventory } from '../../db/repositories/inventoryRepository'
import { useAsyncAction } from '../../hooks/useAsyncAction'
import ErrorBanner from '../../components/ErrorBanner'

interface PassClosePageProps {
  passId: string
  inventoryId: string
  userId: string
  onFinishedSinglePass: () => void
  onSecondPassStarted: (passId: string) => void
}

export default function PassClosePage({
  passId, inventoryId, userId, onFinishedSinglePass, onSecondPassStarted,
}: PassClosePageProps) {
  const [finishSinglePass, finishState] = useAsyncAction(async () => {
    await closePass(passId, userId)
    await closeInventory(inventoryId, 'closed_single_pass')
    onFinishedSinglePass()
  })

  const [startSecondPass, secondPassState] = useAsyncAction(async () => {
    await closePass(passId, userId)
    const pass = await startNextPass(inventoryId, 2)
    onSecondPassStarted(pass.id)
  })

  const error = finishState.error ?? secondPassState.error

  return (
    <div className="screen">
      <h1>Pass 1 Complete</h1>
      {error && <ErrorBanner message={error.message} />}
      <p>Choose how to proceed:</p>
      <button type="button" disabled={finishState.pending} onClick={() => finishSinglePass()}>
        Finish with one pass
      </button>
      <button type="button" className="secondary" disabled={secondPassState.pending} onClick={() => startSecondPass()}>
        Start second pass
      </button>
    </div>
  )
}
