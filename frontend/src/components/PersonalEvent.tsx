import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { addExamples, searchMedia, type EventView, type Thumb as ThumbData } from '../api/data'
import { count, formatDate } from '../lib/format'
import { backLink, btnPrimary, btnSecondary, card, input, panel } from '../lib/styles'
import { templateLabel } from '../lib/templates'
import { rollLabel, term } from '../lib/terms'
import { useAction } from '../lib/useAction'
import CoverageCard from './CoverageCard'
import OrganizeCard from './OrganizeCard'
import { Notice, Owl, Page, Thumb } from './ui'

type Tab = 'moments' | 'highlights' | 'clips' | 'unsorted'

function Moments({ event }: { event: EventView }) {
  return (
    <div className="space-y-7">
      {event.moments
        .filter((m) => m.count > 0)
        .map((m) => (
          <section key={m.moment}>
            <div className="flex items-baseline justify-between">
              <h3 className="font-semibold">{m.moment}</h3>
              <span className="text-xs text-neutral-600">{count(m.count, 'photo')}</span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {m.thumbs.map((thumb) => (
                <Thumb key={thumb.id} thumb={thumb} className="aspect-square w-full rounded-lg" />
              ))}
            </div>
          </section>
        ))}
    </div>
  )
}

function Highlights({ event }: { event: EventView }) {
  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold">Highlights</h2>
        <span className="text-xs text-neutral-600">Best 5 per moment · blurry and repeat shots hidden</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {event.highlights.map((h) => (
          <div key={h.moment} className="relative">
            <Thumb thumb={h.thumb} className="aspect-[4/3] w-full rounded-lg" />
            <span className="absolute bottom-2 left-2 rounded bg-neutral-800/80 px-1.5 py-0.5 text-xs text-white">
              {h.moment}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

const CLIP_BLURB = { A: 'Messages, speeches, greetings', B: 'The venue, the table, the dancing' }

function Clips({ event }: { event: EventView }) {
  return (
    <section>
      <h2 className="text-xl font-bold">{term('clips', event.mode)}</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {(['A', 'B'] as const).map((roll) => (
          <div key={roll} className={`${card} flex items-center gap-3 p-3 shadow-none`}>
            <div className="grid h-14 w-20 shrink-0 place-items-center rounded-lg bg-neutral-300 text-white">▶</div>
            <div>
              <p className="font-display font-semibold">
                {rollLabel(roll, event.mode)} · {event.clips[roll].count}
              </p>
              <p className="text-xs text-neutral-600">{CLIP_BLURB[roll]}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export default function PersonalEvent({ event }: { event: EventView }) {
  const [tab, setTab] = useState<Tab>('moments')
  const [query, setQuery] = useState('')
  const search = useAction()
  const [results, setResults] = useState<ThumbData[] | null>(null)
  const examples = useAction()
  const empty = event.photos + event.videos === 0 || !!event.ingest

  const tabs: { id: Tab; label: string }[] = [
    { id: 'moments', label: 'Moments' },
    { id: 'highlights', label: 'Highlights' },
    { id: 'clips', label: term('clips', event.mode) },
    { id: 'unsorted', label: `Unsorted · ${event.unsorted}` },
  ]

  function submitSearch(e: FormEvent) {
    e.preventDefault()
    if (query.trim()) search.run(async () => setResults(await searchMedia(event.id, query.trim())))
  }

  return (
    <Page
      center={
        <form onSubmit={submitSearch} className="mx-auto max-w-md" role="search">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Search — try "lola with the cake"'
            aria-label="Search photos"
            className={`${input} py-2`}
          />
        </form>
      }
      right={
        <Link to={`/events/${event.id}/export`} className={btnPrimary}>
          {term('export', event.mode)}
        </Link>
      }
    >
      <Notice>{search.error}</Notice>
      {results && (
        <section className={`${card} mb-6 p-4`}>
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">Best matches</h2>
            <button type="button" className="text-sm underline" onClick={() => setResults(null)}>
              Clear
            </button>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {results.map((thumb) => (
              <Thumb key={thumb.id} thumb={thumb} className="aspect-square w-full rounded-lg" />
            ))}
          </div>
        </section>
      )}
      <Link to="/" className={backLink}>
        ← {term('eventsTitle', event.mode)}
      </Link>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">{event.name}</h1>
      <p className="mt-1 text-sm text-neutral-600">
        {templateLabel(event.eventType)} · {formatDate(event.date, event.endDate)} · {count(event.photos, 'photo')} ·{' '}
        {count(event.videos, 'video')}
        {event.sources ? ` from ${count(event.sources, 'phone')}` : ''}
      </p>

      <div className="mt-6 flex gap-1 overflow-x-auto border-b border-neutral-200" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm ${
              tab === t.id ? 'border-neutral-950 font-semibold' : 'border-transparent text-neutral-600 hover:text-neutral-950'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-9">
          {empty ? (
            <OrganizeCard event={event} />
          ) : (
            <>
              {tab === 'moments' && <Moments event={event} />}
              {(tab === 'moments' || tab === 'highlights') && <Highlights event={event} />}
              {(tab === 'moments' || tab === 'clips') && <Clips event={event} />}
              {tab === 'unsorted' && (
                <section>
                  <p className="text-sm text-neutral-600">
                    KuhaGo wasn't sure about these, so it didn't guess.
                  </p>
                  <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {event.unsortedThumbs.map((thumb) => (
                      <Thumb key={thumb.id} thumb={thumb} className="aspect-square w-full rounded-lg" />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        <aside className="space-y-4">
          <CoverageCard event={event} />
          <div className={`${panel} flex gap-3 p-4`}>
            <Owl className="h-8 w-8 shrink-0" />
            <div>
              <p className="text-sm">Teach KuhaGo what you mean — drop a few example photos into any moment.</p>
              <button type="button" className={`${btnSecondary} mt-2`} onClick={() => examples.run(() => addExamples(event.id))}>
                Add example photos
              </button>
              <Notice>{examples.error}</Notice>
            </div>
          </div>
        </aside>
      </div>
    </Page>
  )
}
