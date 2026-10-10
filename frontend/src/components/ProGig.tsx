import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  addExamples,
  removeExample,
  setSidecarMode,
  setStatus,
  STATUSES,
  useSidecarMode,
  writeXmp,
  type EventView,
  type SidecarMode,
} from '../api/data'
import { count, formatDate, mediaCount, peso } from '../lib/format'
import { useMode } from '../lib/mode'
import { backLink, btnPrimary, btnSecondary, card, panel } from '../lib/styles'
import { templateLabel } from '../lib/templates'
import { rollLabel, term } from '../lib/terms'
import { useAction } from '../lib/useAction'
import CoverageCard from './CoverageCard'
import { EditEventModal } from './EventForm'
import { Tile, useEventViewer } from './EventViewer'
import OrganizeCard from './OrganizeCard'
import OwlCard from './OwlChat'
import { Badge, ImagePicker, Notice, RemovableThumb } from './ui'
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
      {event.xmpWritten && <Notice>Keywords written. Re-read metadata in your editor to see them.</Notice>}
      <Notice>{error}</Notice>
    </section>
  )
}

export default function ProGig({ event }: { event: EventView }) {
  const refs = useAction()
  const viewer = useEventViewer(event)
  const { setMode } = useMode()
  const [editing, setEditing] = useState(false)
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
            {term('eventsTitle', event.mode)}
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
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
        <h1 className="text-3xl font-bold tracking-tight">{event.name}</h1>
        <button type="button" onClick={() => setEditing(true)} className="text-sm font-medium underline">
          Edit details
        </button>
      </div>
      {editing && <EditEventModal event={event} onClose={() => setEditing(false)} />}
      {viewer.element}

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

      {/* the gig's photos live in the Events window, at the same address */}
      <div className={`${panel} mt-5 flex flex-wrap items-center justify-between gap-3 px-4 py-3`}>
        <p className="text-sm">
          <span className="font-display font-semibold">Linked event:</span> {event.name} ·{' '}
          {count(event.photos, 'photo')} · {count(event.videos, 'video')}
        </p>
        <button type="button" onClick={() => setMode('personal')} className={btnSecondary}>
          View photos in {term('window', 'personal')}
        </button>
      </div>

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
                    <span className="shrink-0 text-xs text-neutral-600">{mediaCount(m.photos, m.videos, ' · ', ['frame', 'clip'])}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-2">
                    {m.refs.map((thumb) => (
                      <RemovableThumb
                        key={thumb.id}
                        thumb={thumb}
                        label="Remove this reference"
                        disabled={refs.busy}
                        onRemove={() => refs.run(() => removeExample(event.id, thumb))}
                      />
                    ))}
                    <ImagePicker
                      onFiles={(files) => refs.run(() => addExamples(event.id, m.shotItemId, files))}
                      className="grid aspect-square place-items-center rounded-md border border-dashed border-neutral-400 text-xs text-neutral-600 hover:border-neutral-950"
                    >
                      + Ref
                    </ImagePicker>
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
                      {rollLabel(roll, event.mode)} · {count(event.clips[roll].length, 'clip')}
                    </h3>
                    <span className="text-xs text-neutral-600">{roll === 'A' ? 'speech' : 'scene'}</span>
                  </div>
                  <ul className="divide-y divide-neutral-200">
                    {event.clips[roll].map((clip, i) => (
                      <li key={clip.id} className="flex items-center gap-3 px-4 py-2.5">
                        <div className="w-24 shrink-0">
                          <Tile thumbs={event.clips[roll]} index={i} open={viewer.open} className="aspect-video w-full" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-mono text-xs">{clip.name}</p>
                          <p className="text-xs text-neutral-600">{clip.moment}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <CoverageCard event={event} onOpen={viewer.open} />
          <OwlCard event={event} />
          <XmpPanel event={event} />
        </aside>
      </div>
    </Page>
  )
}
