import { useState, type FormEvent } from 'react'
import { pickFolder, startIngest, stopIngest, type EventView } from '../api/data'
import { btnPrimary, btnSecondary, card, input } from '../lib/styles'
import { useAction } from '../lib/useAction'
import { Notice, ProgressBar } from './ui'

// The engine's steps in plain words. Up to and including the videos nothing has been saved, so the job can
// still be stopped; after that it is seconds from done.
const STEPS: Record<string, { label: string; stoppable: boolean }> = {
  previews: { label: 'Reading photos', stoppable: true },
  embedding: { label: 'Looking at photos', stoppable: true },
  videos: { label: 'Reading videos', stoppable: true },
  classifying: { label: 'Sorting', stoppable: false },
  highlights: { label: 'Picking highlights', stoppable: false },
}

export default function OrganizeCard({ event }: { event: EventView }) {
  const [folders, setFolders] = useState('')
  const { error, run } = useAction()
  const stop = useAction()
  // asked to stop: the job ends at its next step, a moment later
  const [stopping, setStopping] = useState(false)
  // what the last run left out, or that it was stopped
  const [notes, setNotes] = useState<string[]>([])
  const { ingest } = event
  const step = ingest ? STEPS[ingest.stage] : undefined

  // adds to what is typed, so several folders can be picked one after another
  function browse() {
    run(async () => {
      const path = await pickFolder()
      if (path) setFolders((typed) => [typed.trim().replace(/;$/, ''), path].filter(Boolean).join('; '))
    })
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    const list = folders.split(';').map((f) => f.trim()).filter(Boolean)
    if (list.length === 0) return
    setNotes([])
    setStopping(false)
    run(async () => setNotes(await startIngest(event.id, list)))
  }

  function stopNow() {
    setStopping(true)
    stop.run(() =>
      stopIngest(event.id).catch((e: Error) => {
        setStopping(false)
        throw e
      }),
    )
  }

  return (
    <form onSubmit={submit} className={`${card} p-5`}>
      <h2 className="text-lg font-semibold">
        {event.photos + event.videos > 0 ? 'Add more photos' : 'Add your photos and videos'}
      </h2>
      <p className="mt-1 text-sm text-neutral-600">
        Pick or paste the folder everyone's photos are in. Several folders? Separate them with a semicolon.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          value={folders}
          onChange={(e) => setFolders(e.target.value)}
          placeholder="D:\Photos\Lola 80th"
          className={`${input} min-w-56 flex-1 font-mono`}
        />
        <button type="button" onClick={browse} className={btnSecondary}>
          Browse…
        </button>
        <button type="submit" disabled={!!ingest} className={btnPrimary}>
          {ingest ? 'Organizing…' : 'Organize'}
        </button>
      </div>
      {ingest && (
        <div className="mt-3">
          <ProgressBar done={ingest.done} total={ingest.total} />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-neutral-600" role="status">
              {step ? `${step.label} · ${ingest.done.toLocaleString('en-US')} of ${ingest.total.toLocaleString('en-US')}` : 'Starting…'}
            </p>
            {(!step || step.stoppable) && (
              <button type="button" disabled={stopping} onClick={stopNow} className={`${btnSecondary} py-1.5`}>
                {stopping ? 'Stopping…' : 'Stop'}
              </button>
            )}
          </div>
          <p className="mt-2 font-mono text-xs text-neutral-600">{ingest.folders.join(' · ')}</p>
        </div>
      )}
      {notes.map((note) => (
        <Notice key={note}>{note}</Notice>
      ))}
      <Notice>{error ?? stop.error}</Notice>
    </form>
  )
}
