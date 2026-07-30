import { closePass, startNextPass, closeInventory } from '../../db/repositories/inventoryRepository'

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
  return (
    <div className="screen">
      <h1>Pass 1 Complete</h1>
      <p>Choose how to proceed:</p>
      <button
        type="button"
        onClick={async () => {
          await closePass(passId, userId)
          await closeInventory(inventoryId, 'closed_single_pass')
          onFinishedSinglePass()
        }}
      >
        Finish with one pass
      </button>
      <button
        type="button"
        className="secondary"
        onClick={async () => {
          await closePass(passId, userId)
          const pass = await startNextPass(inventoryId, 2)
          onSecondPassStarted(pass.id)
        }}
      >
        Start second pass
      </button>
    </div>
  )
}
