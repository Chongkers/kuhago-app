import { createContext, useContext, type ReactNode } from 'react'
import { useProfiles } from './profile'
import type { Mode } from './terms'

type ModeContextValue = {
  // null until a profile is active
  mode: Mode | null
  setMode: (mode: Mode) => void
}

const ModeContext = createContext<ModeContextValue | null>(null)

// The mode belongs to the active profile (chosen when it was created, switchable any time).
export function ModeProvider({ children }: { children: ReactNode }) {
  const { active, update } = useProfiles()
  return (
    <ModeContext.Provider value={{ mode: active?.mode ?? null, setMode: (mode) => update({ mode }) }}>
      {children}
    </ModeContext.Provider>
  )
}

export function useMode(): ModeContextValue {
  const ctx = useContext(ModeContext)
  if (!ctx) throw new Error('useMode must be used inside ModeProvider')
  return ctx
}
