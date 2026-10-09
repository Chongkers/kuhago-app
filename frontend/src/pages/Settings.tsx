import { Link } from 'react-router-dom'
import { useMode } from '../lib/mode'
import type { Mode } from '../lib/terms'

const MODES: { mode: Mode; label: string }[] = [
  { mode: 'personal', label: 'My own photos' },
  { mode: 'pro', label: 'I shoot for clients' },
]

// Shell only: layout and content come from the wireframes. Mode switching works.
export default function Settings() {
  const { mode, setMode } = useMode()

  return (
    <main className="mx-auto max-w-5xl p-6">
      <Link to="/" className="text-sm text-neutral-600 hover:text-neutral-900">
        ← Back
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">Settings</h1>
      <fieldset className="mt-6">
        <legend className="font-medium">Mode</legend>
        <div className="mt-2 flex gap-4">
          {MODES.map((option) => (
            <label key={option.mode} className="flex items-center gap-2">
              <input
                type="radio"
                name="mode"
                checked={mode === option.mode}
                onChange={() => setMode(option.mode)}
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>
    </main>
  )
}
