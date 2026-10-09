import { Link } from 'react-router-dom'
import {
  addExamples,
  setSidecarMode,
  setStatus,
  STATUSES,
  useSidecarMode,
  writeXmp,
  type EventView,
  type SidecarMode,
} from '../api/data'
import { formatDate, peso } from '../lib/format'
import { backLink, btnPrimary, btnSecondary, card, panel } from '../lib/styles'
import { templateLabel } from '../lib/templates'
import { rollLabel, term } from '../lib/terms'
import { useAction } from '../lib/useAction'
import CoverageCard from './CoverageCard'
import OrganizeCard from './OrganizeCard'
import OwlCard from './OwlChat'
import { Badge, Notice, Thumb } from './ui'
import { Page } from './Shell'

export const SIDECAR_OPTIONS: { mode: SidecarMode; label: string; example: string }[] = [
  { mode: 'lightroom', label: 'Lightroom Classic', example: 'IMG_0001.xmp' },
  { mode: 'darktable', label: 'darktable', example: 'IMG_0001.CR3.xmp' },
  { mode: 'rapidraw', label: 'RapidRAW', example: 'XMP sync' },
]

function StagePills({ event }: { event: EventView }) {
  const current = STATUSES.indexOf(event.status ?? 'inquiry')
  return (
    <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Stage">
      {STATUSES.map((status, i) => {
        const look =
          i === current
            ? 'border-neutral-950 bg-neutral-950 text-white'
            : i < current
              ? 'border-neutral-400 bg-white'
              : 'border-dashed border-neutral-400 text-neutral-500'
        return (
          <button
            key={status}
            type="button"
            aria-pressed={i === current}
            onClick={() => setStatus(event.id, status)}
            className={`rounded-full border px-3 py-1 font-display text-sm font-medium capitalize ${look}`}
          >
            {status}
            {i < current && ' ✓'}
          </button>
        )
      })}
    </div>
  )
}

function XmpPanel({ event }: { event: EventView }) {
  const sidecarMode = useSidecarMode()
  const { error, run } = useAction()
  const sampleShot = event.moments.find((m) => m.count > 0)?.moment ?? event.moments[0]?.moment ?? 'Shot'

  return (
    <section className={`${panel} p-5`}>
      <h2 className="text-lg font-semibold">Write XMP keywords</h2>
      <fieldset className="mt-3">
        <legend className="text-xs text-neutral-600">Sidecar mode</legend>
        <div className="mt-2 space-y-1.5">
          {SIDECAR_OPTIONS.map((option) => (
            <label key={option.mode} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="sidecar"
                className="accent-neutral-950"
                checked={sidecarMode === option.mode}
                onChange={() => setSidecarMode(option.mode)}
              />
              <span className="font-display font-medium">{option.label}</span>
              <span className="font-mono text-xs text-neutral-600">{option.example}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <pre className="mt-3 overflow-x-auto rounded-lg border border-neutral-200 bg-white p-3 font-mono text-xs">
        {`Kuha|${templateLabel(event.eventType)}|${sampleShot}\nA-roll · B-roll`}
      </pre>
      <p className="mt-3 text-xs text-neutral-600">
        Existing sidecars are backed up to <span className="font-mono">.kuha_backup/</span> first. Only keywords are
        written.
      </p>
      <button
        type="button"
        disabled={event.photos === 0}
        onClick={() => run(() => writeXmp(event.id, sidecarMode))}
        className={`${btnPrimary} mt-3 w-full`}
      >
        Write to {event.photos.toLocaleString('en-US')} sidecars
      </button>
      <Notice>{error}</Notice>
    </section>
  )
}

export default function ProGig({ event }: { event: EventView }) {
  const refs = useAction()
  const facts = [
    { label: 'Client', value: event.client || '—' },
    { label: 'Date', value: formatDate(event.date, event.endDate) },
    { label: 'Venue', value: event.venue || '—' },
    { label: 'Fee', value: event.fee != null ? peso(event.fee) : '—', mono: true },
  ]

  return (
    <Page
      pro
      center={
        <p className="text-sm text-neutral-600">
          <Link to="/" className="hover:text-neutral-950">
            Gigs
          </Link>{' '}
          / {event.name}
        </p>
      }
      right={
        <>
          <Link to={`/events/${event.id}/finals`} className={btnSecondary}>
            Match finals
          </Link>
          <Link to={`/events/${event.id}/export`} className={btnPrimary}>
            {term('export', event.mode)}
          </Link>
        </>
      }
    >
      <Link to="/" className={backLink}>
        ← {term('eventsTitle', event.mode)}
      </Link>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">{event.name}</h1>

      <dl className={`${card} mt-5 grid grid-cols-2 divide-neutral-200 shadow-none sm:grid-cols-5 sm:divide-x`}>
        {facts.map((fact) => (
          <div key={fact.label} className="px-4 py-3">
            <dt className="text-xs uppercase tracking-wide text-neutral-600">{fact.label}</dt>
            <dd className={fact.mono ? 'font-mono text-sm' : 'font-display font-semibold'}>{fact.value}</dd>
          </div>
        ))}
        <div className="px-4 py-3">
          <dt className="text-xs uppercase tracking-wide text-neutral-600">Paid</dt>
          <dd>{event.paid ? <Badge variant="outline">Paid</Badge> : <Badge>Unpaid</Badge>}</dd>
        </div>
      </dl>

      <StagePills event={event} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-8">
          <OrganizeCard event={event} />

          <section>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-xl font-bold">Shot list &amp; references</h2>
              <span className="text-xs text-neutral-600">References teach KuhaGo your style per shot</span>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {event.moments.map((m) => (
                <div key={m.moment} className={`${card} p-3 shadow-none`}>
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="font-semibold">{m.moment}</h3>
                    <span className="text-xs text-neutral-600">{m.count} frames</span>
                  </div>
                  <div className="mt-2 grid grid-cols-4 gap-1.5">
                    {m.refs.map((thumb) => (
                      <Thumb key={thumb.id} thumb={thumb} className="aspect-square w-full rounded-md" />
                    ))}
                    <button
                      type="button"
                      onClick={() => refs.run(() => addExamples(event.id))}
                      className="aspect-square rounded-md border border-dashed border-neutral-400 text-xs text-neutral-600 hover:border-neutral-950"
                    >
                      + Ref
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <Notice>{refs.error}</Notice>
          </section>

          <section>
            <h2 className="text-xl font-bold">{term('clips', event.mode)}</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {(['A', 'B'] as const).map((roll) => (
                <div key={roll} className={`${card} overflow-hidden shadow-none`}>
                  <div className="flex items-baseline justify-between bg-neutral-100 px-4 py-2.5">
                    <h3 className="font-semibold">
                      {rollLabel(roll, event.mode)} · {event.clips[roll].count} clips
                    </h3>
                    <span className="text-xs text-neutral-600">{roll === 'A' ? 'speech' : 'scene'}</span>
                  </div>
                  <ul className="divide-y divide-neutral-200">
                    {event.clips[roll].items.map((clip) => (
                      <li key={clip.file} className="flex items-baseline justify-between gap-3 px-4 py-2.5">
                        <span className="font-mono text-xs">{clip.file}</span>
                        <span className="text-xs text-neutral-600">
                          {clip.moment} · {clip.duration}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <CoverageCard event={event} />
          <OwlCard event={event} />
          <XmpPanel event={event} />
        </aside>
      </div>
    </Page>
  )
}
