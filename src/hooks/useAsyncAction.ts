import { useCallback, useState } from 'react'

interface AsyncActionState {
  pending: boolean
  error: Error | null
}

export function useAsyncAction<Args extends unknown[]>(
  fn: (...args: Args) => Promise<void>,
): [(...args: Args) => void, AsyncActionState] {
  const [state, setState] = useState<AsyncActionState>({ pending: false, error: null })

  const run = useCallback(
    (...args: Args) => {
      setState({ pending: true, error: null })
      fn(...args)
        .then(() => setState({ pending: false, error: null }))
        .catch((err: unknown) => {
          setState({ pending: false, error: err instanceof Error ? err : new Error(String(err)) })
        })
    },
    [fn],
  )

  return [run, state]
}
