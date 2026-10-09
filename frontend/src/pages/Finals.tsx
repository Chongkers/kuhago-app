import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { loadFinals, scanFinals, useEvent, useFinals } from '../api/data'
import { Badge, NotFound, Notice, Page, Thumb } from '../components/ui'
import { backLink, btnSecondary, card, input, panel } from '../lib/styles'
import { useAction } from '../lib/useAction'

const SELECT_MIN_RATING = 3

// Pro only: which selects have an edited final, and which don't yet.
export default function Finals() {
  const { eventId } = useParams()
  const event = useEvent(Number(eventId))
  const finals = useFinals(Number(eventId))
  const { error, run } = useAction()
  const [folder, setFolder] = useState('')
  const [scanning, setScanning] = useState(false)
  const isPro = event?.mode === 'pro'

  // the last scan's result, if the engine has one
  useEffect(() => {
    if (isPro) loadFinals(Number(eventId)).catch(() => undefined)
  }, [eventId, isPro])

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!folder.trim() || !event) return
    setScanning(true)
    run(() => scanFinals(event.id, folder.trim()).finally(() => setScanning(false)))
  }

  if (!event || event.mode !== 'pro') return <NotFound />

  const stats = finals
    ? [
        { label: 'Selects', value: finals.selects },
        { label: 'Finals', value: finals.finals },
        { label: 'Matched', value: finals.matchedTotal },
        { label: 'Not yet edited', value: finals.unedited.length, strong: true },
      ]
    : []

  return (
    <Page pro right={event.name}>
      <Link to={`/events/${event.id}`} className={backLink}>
        ← Back to gig
      </Link>
      <div className="mt-1 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Selects vs finals</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Selects = RAWs rated {SELECT_MIN_RATING}★ or more
            {finals?.folder && (
              <>
                {' '}
                · finals folder <span className="font-mono">{finals.folder}</span>
              </>
            )}
          </p>
        </div>
        <form onSubmit={submit} className="w-full max-w-md">
          <div className="flex gap-2">
            <input
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              placeholder="X:\\Gigs\\Finals"
              aria-label="Finals folder"
              className={`${input} font-mono`}
            />
            <button type="submit" disabled={scanning} className={`${btnSecondary} shrink-0`}>
              {scanning ? 'Scanning…' : finals ? 'Re-scan finals' : 'Scan finals folder'}
            </button>
          </div>
          <Notice>{error}</Notice>
        </form>
      </div>

      {!finals ? (
        <p className={`${panel} mt-7 p-5 text-neutral-600`}>
          No finals scanned for this gig yet. Rate your selects in your editor, export your finals, then scan the
          folder.
        </p>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className={`rounded-2xl px-4 py-3 ${stat.strong ? 'bg-neutral-950 text-white' : 'bg-neutral-100'}`}
              >
                <p className={`text-xs font-medium uppercase tracking-wide ${stat.strong ? '' : 'text-neutral-600'}`}>
                  {stat.label}
                </p>
                <p className="font-display text-3xl font-bold">{stat.value}</p>
              </div>
            ))}
          </div>

          <h2 className="mt-8 text-xl font-bold">{finals.unedited.length} selects not yet edited</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {finals.unedited.map((item) => (
              <div key={item.file} className={`${card} overflow-hidden shadow-none`}>
                <Thumb thumb={item.thumb} className="aspect-[3/2] w-full" />
                <div className="p-3">
                  <p className="font-mono text-xs">{item.file}</p>
                  <p className="mt-0.5 text-xs text-neutral-600">
                    <span aria-label={`${item.rating} stars`}>{'★'.repeat(item.rating)}</span> · {item.moment}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {finals.unmatched.length > 0 && (
            <div className={`${panel} mt-6 space-y-3 p-4`}>
              {finals.unmatched.map((item, i) => (
                <div key={item.file} className="flex items-start gap-3">
                  <span className={i === 0 ? '' : 'invisible'}>
                    <Badge>{finals.unmatched.length} unmatched</Badge>
                  </span>
                  <div>
                    <p className="font-mono text-sm">{item.file}</p>
                    <p className="text-sm text-neutral-600">{item.note}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <h2 className="mt-8 text-xl font-bold">Matched</h2>
          <div className={`${card} mt-3 overflow-x-auto shadow-none`}>
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="bg-neutral-100 text-xs uppercase tracking-wide text-neutral-600">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Final</th>
                  <th className="px-4 py-2.5 font-medium">RAW</th>
                  <th className="px-4 py-2.5 font-medium">Shot</th>
                  <th className="px-4 py-2.5 text-right font-medium">Match</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {finals.matched.map((row) => (
                  <tr key={row.final}>
                    <td className="px-4 py-2.5 font-mono text-xs">{row.final}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{row.raw}</td>
                    <td className="px-4 py-2.5 text-neutral-600">{row.moment}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-neutral-600">{row.score.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-neutral-600">
            Showing {finals.matched.length} of {finals.matchedTotal} · matched by image, so renamed exports still pair
            up.
          </p>
        </>
      )}
    </Page>
  )
}
