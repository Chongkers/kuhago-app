import { createContext, useContext, useState, type ReactNode } from 'react'
import type { Mode } from './terms'

const STORAGE_KEY = 'kuha.mode'

function readStoredMode(): Mode | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'personal' || value === 'pro' ? value : null
  } catch {
    return null
  }
}

type ModeContextValue = {
  // null until the user picks a mode on first launch
  mode: Mode | null
  setMode: (mode: Mode) => void
}

const ModeContext = createContext<ModeContextValue | null>(null)

export function ModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode | null>(readStoredMode)

  function setMode(next: Mode) {
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // storage unavailable: mode still applies for this session
    }
    setModeState(next)
  }

  return <ModeContext.Provider value={{ mode, setMode }}>{children}</ModeContext.Provider>
}

export function useMode(): ModeContextValue {
  const ctx = useContext(ModeContext)
  if (!ctx) throw new Error('useMode must be used inside ModeProvider')
  return ctx
}
