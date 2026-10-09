import { useState } from 'react'

// Runs an async action and keeps its failure message for display next to the control.
export function useAction() {
  const [error, setError] = useState<string | null>(null)

  function run(action: () => Promise<unknown>) {
    setError(null)
    action().catch((e: Error) => setError(e.message))
  }

  return { error, run }
}
