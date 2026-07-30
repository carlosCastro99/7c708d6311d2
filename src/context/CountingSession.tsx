import { createContext, useContext, useState, type ReactNode } from 'react'

const STORAGE_KEY = 'mx-inventory-counting-session'

export interface CountingSessionValue {
  userId: string
  inventoryId: string
  passId: string
  zoneId?: string
  materialId?: string
}

interface CountingSessionContextValue {
  session: CountingSessionValue | null
  setSession: (session: CountingSessionValue | null) => void
}

const CountingSessionContext = createContext<CountingSessionContextValue | undefined>(undefined)

function readInitialSession(): CountingSessionValue | null {
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as CountingSessionValue
  } catch {
    return null
  }
}

export function CountingSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<CountingSessionValue | null>(readInitialSession)

  const setSession = (next: CountingSessionValue | null) => {
    setSessionState(next)
    if (next) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } else {
      window.localStorage.removeItem(STORAGE_KEY)
    }
  }

  return (
    <CountingSessionContext.Provider value={{ session, setSession }}>
      {children}
    </CountingSessionContext.Provider>
  )
}

export function useCountingSession(): CountingSessionContextValue {
  const ctx = useContext(CountingSessionContext)
  if (!ctx) throw new Error('useCountingSession must be used within a CountingSessionProvider')
  return ctx
}
