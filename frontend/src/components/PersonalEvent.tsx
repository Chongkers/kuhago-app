import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { addExamples, removeMedia, searchMedia, type EventView, type Thumb as ThumbData } from '../api/data'
import { count, formatDate } from '../lib/format'
import { backLink, btnPrimary, btnSecondary, card, input, panel } from '../lib/styles'
import { templateLabel } from '../lib/templates'
import { useMode } from '../lib/mode'
import { rollLabel, term } from '../lib/terms'
import { useAction } from '../lib/useAction'
import CoverageCard from './CoverageCard'
import { EditEventModal } from './EventForm'
import FirstSteps from './FirstSteps'
import OrganizeCard from './OrganizeCard'
import OwlCard from './OwlChat'
import PhotoViewer from './PhotoViewer'
import { ImagePicker, Modal, Notice, Owl, Thumb } from './ui'
import { Page } from './Shell'

type Tab = 'moments' | 'highlights' | 'clips' | 'unsorted'
// opens the photo viewer on one photo of a grid
type Open = (thumbs: ThumbData[], index: number) => void

// A grid photo that opens large when clicked.
function Tile({ thumbs, index, open, className }: { thumbs: ThumbData[]; index: number; open: Open; className: string }) {
  return (
    <button
      type="button"
      onClick={() => open(thumbs, index)}
      aria-label={`View ${thumbs[index].name ?? 'photo'}`}
      className="block w-full cursor-zoom-in overflow-hidden rounded-lg hover:opacity-80"
    >
      <Thumb thumb={thumbs[index]} className={className} />
    </button>
  )
}

// how many photos of a moment the page shows before "View all"
const ROW = 6

function Moments({ event, open, onViewAll }: { event: EventView; open: Open; onViewAll: (moment: string) => void }) {
  // everything was added but nothing fit the list: say what to do instead of showing an empty tab
  if (event.moments.every((m) => m.count === 0)) {
    return (
      <section className="rounded-2xl border-2 border-neutral-950 p-5" role="status">
        <h2 className="text-xl font-bold">Nothing is sorted yet</h2>
        <p className="mt-1 text-sm">
          All {count(event.unsorted, 'photo')} went to Unsorted because{' '}
          {event.moments.length === 0 ? 'your list is empty' : 'none of them fit what is on your list'}. Add the themes
          and subjects these photos show in the <strong>{term('checklistTitle', event.mode)}</strong> section: click{' '}
          <strong>Edit list</strong> there, and KuhaGo sorts them again right away.
        </p>
      </section>
    )
  }
  return (
    <div className="space-y-7">
      {event.moments
        .filter((m) => m.count > 0)
        .map((m) => (
          <section key={m.moment}>
            <div className="flex items-baseline justify-between">
              <h3 className="font-semibold">{m.moment}</h3>
              {m.thumbs.length > ROW ? (
                <button type="button" onClick={() => onViewAll(m.moment)} className="text-sm font-medium underline">
                  View all {m.count}
                </button>
              ) : (
                <span className="text-xs text-neutral-600">{count(m.count, 'photo')}</span>
              )}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {m.thumbs.slice(0, ROW).map((thumb, i) => (
                <Tile key={thumb.id} thumbs={m.thumbs} index={i} open={open} className="aspect-square w-full" />
              ))}
            </div>
          </section>
        ))}
    </div>
  )
}

function Highlights({ event, open }: { event: EventView; open: Open }) {
  const thumbs = event.highlights.map((h) => h.thumb)
  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold">Highlights</h2>
        <span className="text-xs text-neutral-600">Best 5 per moment · blurry and repeat shots hidden</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {event.highlights.map((h, i) => (
          <div key={h.thumb.id} className="relative">
            <Tile thumbs={thumbs} index={i} open={open} className="aspect-[4/3] w-full" />
            <span className="pointer-events-none absolute bottom-2 left-2 rounded bg-neutral-800/80 px-1.5 py-0.5 text-xs text-white">
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
            <div className="grid h-14 w-20 shrink-0 place-items-center rounded-lg bg-neutral-300 text-neutral-700">▶</div>
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

// tracked: the event is also a gig, so it has a second page in the Tracker
export default function PersonalEvent({ event, tracked = false }: { event: EventView; tracked?: boolean }) {
  const { setMode } = useMode()
  const [editing, setEditing] = useState(false)
  const [tab, setTab] = useState<Tab>('moments')
  const [query, setQuery] = useState('')
  const search = useAction()
  const [results, setResults] = useState<ThumbData[] | null>(null)
  const examples = useAction()
  const [exampleMoment, setExampleMoment] = useState('')
  const moment = event.moments.find((m) => m.moment === exampleMoment) ?? event.moments[0]
  const empty = event.photos + event.videos === 0 || !!event.ingest
  const [viewing, setViewing] = useState<{ thumbs: ThumbData[]; index: number } | null>(null)
  const open: Open = (thumbs, index) => setViewing({ thumbs, index })
  // the moment whose photos are all on show in a window
  const [allOf, setAllOf] = useState<string | null>(null)
  const all = event.moments.find((m) => m.moment === allOf && m.count > 0)

  // the viewer moves on to the next photo of the grid it was opened from, and closes after the last one
  async function remove(thumb: ThumbData) {
    await removeMedia(event.id, thumb.id)
    setResults((list) => list?.filter((t) => t.id !== thumb.id) ?? null)
    setViewing((v) => {
      const thumbs = v?.thumbs.filter((t) => t.id !== thumb.id) ?? []
      return v && thumbs.length > 0 ? { thumbs, index: Math.min(v.index, thumbs.length - 1) } : null
    })
  }

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
        <>
          {tracked && (
            // same address: the Tracker window shows this event's gig page
            <button type="button" onClick={() => setMode('pro')} className={btnSecondary}>
              Open in {term('window', 'pro')}
            </button>
          )}
          <Link to={`/events/${event.id}/export`} className={btnPrimary}>
            {term('export', event.mode)}
          </Link>
        </>
      }
    >
      {editing && <EditEventModal event={event} onClose={() => setEditing(false)} />}
      {/* a photo opened from this window covers it; closing the photo comes back here */}
      {all && !viewing && (
        <Modal wide title={`${all.moment} · ${count(all.count, 'photo')}`} onClose={() => setAllOf(null)}>
          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
            {all.thumbs.map((thumb, i) => (
              <Tile key={thumb.id} thumbs={all.thumbs} index={i} open={open} className="aspect-square w-full" />
            ))}
          </div>
        </Modal>
      )}
      {viewing && (
        <PhotoViewer
          thumbs={viewing.thumbs}
          index={viewing.index}
          onIndex={(index) => setViewing({ thumbs: viewing.thumbs, index })}
          onClose={() => setViewing(null)}
          onRemove={remove}
        />
      )}
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
            {results.map((thumb, i) => (
              <Tile key={thumb.id} thumbs={results} index={i} open={open} className="aspect-square w-full" />
            ))}
          </div>
        </section>
      )}
      <Link to="/" className={backLink}>
        ← {term('eventsTitle', event.mode)}
      </Link>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
        <h1 className="text-3xl font-bold tracking-tight">{event.name}</h1>
        <button type="button" onClick={() => setEditing(true)} className="text-sm font-medium underline">
          Edit details
        </button>
      </div>
      <p className="mt-1 text-sm text-neutral-600">
        {templateLabel(event.eventType)} · {formatDate(event.date, event.endDate)}
        {event.venue ? ` · ${event.venue}` : ''} · {count(event.photos, 'photo')} · {count(event.videos, 'video')}
        {event.sources ? ` from ${count(event.sources, 'phone')}` : ''}
      </p>
      <FirstSteps event={event} />

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
          {!empty && (
            <>
              {tab === 'moments' && <Moments event={event} open={open} onViewAll={setAllOf} />}
              {(tab === 'moments' || tab === 'highlights') && <Highlights event={event} open={open} />}
              {(tab === 'moments' || tab === 'clips') && <Clips event={event} />}
              {tab === 'unsorted' && (
                <section>
                  <p className="text-sm text-neutral-600">
                    {event.moments.length === 0
                      ? 'Your list is empty, so there is nothing to sort these into yet.'
                      : "KuhaGo wasn't sure about these, so it didn't guess."}
                  </p>
                  {event.unsorted > 0 && (
                    <p className="mt-1 text-sm font-semibold">
                      To sort them, click Edit list and add a theme or subject that fits, e.g. "Band on stage".
                    </p>
                  )}
                  <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {event.unsortedThumbs.map((thumb, i) => (
                      <Tile key={thumb.id} thumbs={event.unsortedThumbs} index={i} open={open} className="aspect-square w-full" />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
          <OrganizeCard event={event} />
        </div>

        <aside className="space-y-4">
          <CoverageCard event={event} />
          <OwlCard event={event} />
          <div className={`${panel} flex gap-3 p-4`}>
            <Owl className="h-8 w-8 shrink-0" />
            <div>
              <p className="text-sm">Teach KuhaGo what you mean — drop a few example photos into any moment.</p>
              <select
                value={moment?.moment ?? ''}
                onChange={(e) => setExampleMoment(e.target.value)}
                aria-label="Moment"
                className={`${input} mt-2 py-2`}
              >
                {event.moments.map((m) => (
                  <option key={m.moment}>{m.moment}</option>
                ))}
              </select>
              {moment && moment.refs.length > 0 && (
                <div className="mt-2 grid grid-cols-4 gap-1.5">
                  {moment.refs.map((thumb) => (
                    <Thumb key={thumb.id} thumb={thumb} className="aspect-square w-full rounded-md" />
                  ))}
                </div>
              )}
              {moment && (
                <ImagePicker
                  className={`${btnSecondary} mt-2`}
                  onFiles={(files) => examples.run(() => addExamples(event.id, moment.shotItemId, files))}
                >
                  {term('refs', event.mode)}
                </ImagePicker>
              )}
              <Notice>{examples.error}</Notice>
            </div>
          </div>
        </aside>
      </div>
    </Page>
  )
}
