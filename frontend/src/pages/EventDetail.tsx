import { Link, useParams } from 'react-router-dom'
import { useMode } from '../lib/mode'
import { term } from '../lib/terms'

// Shell only: layout and content come from the wireframes.
export default function EventDetail() {
  const { eventId } = useParams()
  const { mode } = useMode()
  if (!mode) return null

  return (
    <main className="mx-auto max-w-5xl p-6">
      <Link to="/" className="text-sm text-neutral-600 hover:text-neutral-900">
        ← {term('events', mode)}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">
        {term('event', mode)} #{eventId}
      </h1>
    </main>
  )
}
