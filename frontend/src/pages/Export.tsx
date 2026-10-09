import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { ExportPlan } from '../api/client'
import { loadExportPlan, missedMoments, pickFolder, runExport, setStatus, useEvent, useFinals } from '../api/data'
import { Badge, Notice, ProgressBar } from '../components/ui'
import { NotFound, Page } from '../components/Shell'
import { planRows } from '../lib/exportPlan'
import { count, listOf } from '../lib/format'
import { backLink, btnPrimary, btnSecondary, card, input, panel } from '../lib/styles'
import { term } from '../lib/terms'
import { useAction } from '../lib/useAction'

export default function Export() {
  const { eventId } = useParams()
  const id = Number(eventId)
  const event = useEvent(id)
  const finals = useFinals(id)
  const [dest, setDest] = useState('')
  const [plan, setPlan] = useState<ExportPlan | null>(null)
  const [planError, setPlanError] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [copying, setCopying] = useState(false)
  const [markDelivered, setMarkDelivered] = useState(true)
  const picker = useAction()
  const copier = useAction()
  const mediaCount = event ? event.photos + event.videos : 0

  // the backend's dry run; refetched when organizing adds media
  useEffect(() => {
    loadExportPlan(id).then(setPlan, (e: Error) => setPlanError(e.message))
  }, [id, mediaCount])

  if (!event) return <NotFound />

  const pro = event.mode === 'pro'
  const total = plan?.copies.length ?? 0
  const missed = missedMoments(event)
  const eventPath = `/events/${event.id}`

  function start() {
    if (!event) return
    setProgress({ done: 0, total })
    setCopying(true)
    copier.run(() =>
      runExport(event.id, dest.trim(), (done, total) => setProgress({ done, total }))
        .then(() => {
          if (pro && markDelivered) setStatus(event.id, 'delivered')
        })
        .finally(() => setCopying(false)),
    )
  }

  return (
    <Page pro={pro} width="max-w-5xl" right={event.name}>
      <Link to={eventPath} className={backLink}>
        ← {pro ? 'Back to gig' : 'Back to moments'}
      </Link>
      <h1 className="mt-1 text-4xl font-bold tracking-tight">{term('export', event.mode)}</h1>
      <p className="mt-2 max-w-2xl text-neutral-600">
        {pro
          ? "Copies RAWs, selects, finals and video into your studio's folder structure. Originals and cards are never moved or changed."
          : 'KuhaGo copies everything into clean folders. Your originals are never moved or changed.'}
      </p>

      <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div>
          <label htmlFor="dest" className="font-display font-semibold">
            {pro ? 'Archive to' : 'Save to'}
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id="dest"
              value={dest}
              onChange={(e) => setDest(e.target.value)}
              placeholder={pro ? 'X:\\Archive\\2026' : 'D:\\Photos\\Family'}
              className={`${input} font-mono`}
            />
            <button type="button" className={`${btnSecondary} shrink-0`} onClick={() => picker.run(pickFolder)}>
              Choose folder
            </button>
          </div>
          <Notice>{picker.error}</Notice>

          <section className={`${panel} mt-4 p-5`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">{pro ? 'Folder plan (dry run)' : "What you'll get"}</h2>
              <span className="text-sm text-neutral-600">
                {count(total, 'file')}
              </span>
            </div>
            <div className="mt-3 overflow-x-auto rounded-xl border border-neutral-200 bg-white p-4 font-mono text-sm leading-relaxed">
              {!plan && <p className="text-neutral-600">{planError ?? 'Working out the folders…'}</p>}
              {plan && <p className="whitespace-nowrap">{plan.root}/</p>}
              {plan && planRows(plan).map((row, i) => (
                <p key={i} className="flex gap-4 whitespace-nowrap" style={{ paddingLeft: `${row.depth}rem` }}>
                  <span className="min-w-56 flex-1">{row.name}</span>
                  <span className="w-24 text-neutral-600">{row.count}</span>
                </p>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <section className={`${card} p-4`}>
            <h2 className="text-lg font-semibold">{pro ? 'Before you archive' : 'Before you copy'}</h2>
            {pro ? (
              <div className="mt-3 space-y-3 text-sm text-neutral-600">
                {finals && finals.unedited.length > 0 && (
                  <p className="flex items-start gap-2">
                    <Badge>{finals.unedited.length} selects</Badge>
                    <span>not yet edited — they'll go to 02_SELECTS without a final.</span>
                  </p>
                )}
                <p className="flex items-start gap-2">
                  <Badge variant="outline">{event.xmpWritten ? 'XMP written' : 'XMP not written'}</Badge>
                  <span>Sidecars travel with their RAWs.</span>
                </p>
                <Link to={`${eventPath}/finals`} className="inline-block font-display font-semibold text-neutral-950 underline">
                  Review selects vs finals
                </Link>
              </div>
            ) : (
              <div className="mt-3 space-y-3 text-sm text-neutral-600">
                {missed.length > 0 ? (
                  <p className="flex items-start gap-2">
                    <Badge>{missed.length} missed</Badge>
                    <span>
                      {listOf(missed.map((m) => m.moment))} still {missed.length === 1 ? 'has' : 'have'} no photos. You
                      can export now and add them later.
                    </span>
                  </p>
                ) : (
                  <p className="flex items-start gap-2">
                    <Badge variant="outline">All covered</Badge>
                    <span>Every moment on your checklist has photos.</span>
                  </p>
                )}
                <Link to={eventPath} className="inline-block font-display font-semibold text-neutral-950 underline">
                  Review missed moments
                </Link>
              </div>
            )}
          </section>

          {progress && (
            <section className={`${card} p-4`}>
              <div className="flex items-baseline justify-between">
                <h2 className="text-lg font-semibold">{copying ? 'Copying…' : copier.error ? 'Stopped' : 'Copied'}</h2>
                <span className="font-mono text-sm text-neutral-600">
                  {progress.done.toLocaleString('en-US')} / {progress.total.toLocaleString('en-US')}
                </span>
              </div>
              <div className="mt-2">
                <ProgressBar done={progress.done} total={progress.total} />
              </div>
              <p className="mt-2 text-sm text-neutral-600">Nothing leaves your laptop. You can keep browsing.</p>
            </section>
          )}
          <Notice>{copier.error}</Notice>

          {pro && (
            <label className="flex items-center gap-2 px-1">
              <input
                type="checkbox"
                className="h-4 w-4 accent-neutral-950"
                checked={markDelivered}
                onChange={(e) => setMarkDelivered(e.target.checked)}
              />
              Mark gig as Delivered when done
            </label>
          )}

          <button
            type="button"
            disabled={total === 0 || !dest.trim() || copying}
            onClick={start}
            className={`${btnPrimary} w-full py-3.5 text-base`}
          >
            {pro
              ? `Copy ${count(total, 'file')} to archive`
              : `Copy ${count(event.photos, 'photo')} and ${count(event.videos, 'video')}`}
          </button>
        </aside>
      </div>
    </Page>
  )
}
