import type { EventView } from '../api/data'
import { count } from '../lib/format'
import { card } from '../lib/styles'
import { term } from '../lib/terms'
import { Badge } from './ui'

// The missed-moment check: missed items first, then everything that is covered.
export default function CoverageCard({ event }: { event: EventView }) {
  const { mode } = event
  const pro = mode === 'pro'
  const missed = event.moments.filter((m) => m.count === 0)
  const covered = event.moments.filter((m) => m.count > 0)
  const total = event.moments.length

  const summary = pro
    ? `${missed.length} of ${total} shots on the list have no frames.`
    : `${missed.length} of ${total} moments have no photos yet.`
  const fallbackHint = pro ? 'No frames matched' : 'Nobody got this one yet.'

  return (
    <section className={`${card} p-5`}>
      <h2 className="text-xl font-bold">{term('coverage', mode)}</h2>
      <p className="mt-1 text-xs text-neutral-600">{missed.length === 0 ? 'Everything on the list is covered.' : summary}</p>
      <ul className="mt-3 divide-y divide-neutral-200">
        {missed.map((m) => (
          <li key={m.moment} className="flex items-center justify-between gap-3 py-3">
            <div>
              <p className="font-display font-semibold">{m.moment}</p>
              <p className="text-xs text-neutral-600">{m.hint ?? fallbackHint}</p>
            </div>
            <Badge>Missed</Badge>
          </li>
        ))}
        {covered.map((m) => (
          <li key={m.moment} className="flex items-center justify-between gap-3 py-3">
            <p className="font-display font-semibold">{m.moment}</p>
            <Badge variant="outline">{pro ? m.count : count(m.count, 'photo')}</Badge>
          </li>
        ))}
      </ul>
    </section>
  )
}
