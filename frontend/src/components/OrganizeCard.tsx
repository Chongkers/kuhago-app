import { useState, type FormEvent } from 'react'
import { pickFolder, startIngest, type EventView } from '../api/data'
import { btnPrimary, btnSecondary, card, input } from '../lib/styles'
import { useAction } from '../lib/useAction'
import { Notice, ProgressBar } from './ui'

export default function OrganizeCard({ event }: { event: EventView }) {
  const [folders, setFolders] = useState('')
  const { error, run } = useAction()
  const { ingest } = event

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
    if (list.length > 0) run(() => startIngest(event.id, list))
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
          <p className="mt-2 font-mono text-xs text-neutral-600">{ingest.folders.join(' · ')}</p>
        </div>
      )}
      <Notice>{error}</Notice>
    </form>
  )
}
