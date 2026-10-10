import { useState } from 'react'

// Runs an async action and keeps its failure message for display next to the control.
export function useAction() {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function run(action: () => Promise<unknown>) {
    setError(null)
    setBusy(true)
    action()
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false))
  }

  return { error, busy, run }
}
