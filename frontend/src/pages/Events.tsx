import { Link } from 'react-router-dom'
import { useMode } from '../lib/mode'
import { term } from '../lib/terms'

// Shell only: layout and content come from the wireframes.
export default function Events() {
  const { mode } = useMode()
  if (!mode) return null

  return (
    <main className="mx-auto max-w-5xl p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{term('events', mode)}</h1>
        <Link to="/settings" className="text-sm text-neutral-600 hover:text-neutral-900">
          Settings
        </Link>
      </header>
    </main>
  )
}
