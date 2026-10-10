import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { addExamples, removeExample, searchMedia, useStatus, videosIn, type EventView, type Thumb as ThumbData } from '../api/data'
import { count, formatDate, mediaCount } from '../lib/format'
import { backLink, btnPrimary, btnSecondary, card, input, panel } from '../lib/styles'
import { templateLabel } from '../lib/templates'
import { useMode } from '../lib/mode'
import { rollLabel, term } from '../lib/terms'
import { useAction } from '../lib/useAction'
import CoverageCard from './CoverageCard'
import { EditEventModal } from './EventForm'
import { Tile, useEventViewer, type OpenViewer } from './EventViewer'
import FirstSteps from './FirstSteps'
import OrganizeCard from './OrganizeCard'
import OwlCard from './OwlChat'
import { ImagePicker, Modal, Notice, Owl, RemovableThumb } from './ui'
import { Page } from './Shell'

type Tab = 'moments' | 'highlights' | 'favorites' | 'clips' | 'unsorted'

// how many photos of a moment the page shows before "View all"
const ROW = 6

function Moments({ event, open, onViewAll }: { event: EventView; open: OpenViewer; onViewAll: (moment: string) => void }) {
  // everything was added but nothing fit the list: say what to do instead of showing an empty tab
  if (event.moments.every((m) => m.count === 0)) {
    const videos = videosIn(event.unsortedThumbs)
    return (
      <section className="rounded-2xl border-2 border-neutral-950 p-5" role="status">
        <h2 className="text-xl font-bold">Nothing is sorted yet</h2>
        <p className="mt-1 text-sm">
          All {mediaCount(event.unsorted - videos, videos, ' and ')} went to Unsorted because{' '}
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
                <span className="text-xs text-neutral-600">{mediaCount(m.photos, m.videos)}</span>
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

function Highlights({ event, open }: { event: EventView; open: OpenViewer }) {
  const { health } = useStatus()
  const thumbs = event.highlights.map((h) => h.thumb)
  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold">Highlights</h2>
        <span className="text-xs text-neutral-600">
          {health ? `Best ${health.highlights_per_moment}` : 'The best few'} per moment · blurry and repeat shots hidden
        </span>
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

function Favorites({ event, open }: { event: EventView; open: OpenViewer }) {
  const name = term('select', event.mode)
  return (
    <section>
      <h2 className="text-xl font-bold">{term('selects', event.mode)}</h2>
      {event.favorites.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-600">
          None yet. Open any photo or video and press ☆ {name} to keep it here. {term('selects', event.mode)} get their own
          folder when you export.
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {event.favorites.map((thumb, i) => (
            <Tile key={thumb.id} thumbs={event.favorites} index={i} open={open} className="aspect-square w-full" />
          ))}
        </div>
      )}
    </section>
  )
}

const CLIP_BLURB = { A: 'Messages, speeches, greetings', B: 'The venue, the table, the dancing' }

function Clips({ event, open }: { event: EventView; open: OpenViewer }) {
  return (
    <section>
      <h2 className="text-xl font-bold">{term('clips', event.mode)}</h2>
      {event.videos === 0 && <p className="mt-2 text-sm text-neutral-600">There are no videos in this event yet.</p>}
      <div className="mt-3 space-y-6">
        {(['A', 'B'] as const)
          .filter((roll) => event.clips[roll].length > 0)
          .map((roll) => (
            <div key={roll}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold">
                  {rollLabel(roll, event.mode)} · {event.clips[roll].length}
                </h3>
                <span className="text-xs text-neutral-600">{CLIP_BLURB[roll]}</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {event.clips[roll].map((clip, i) => (
                  <div key={clip.id} className="min-w-0">
                    <Tile thumbs={event.clips[roll]} index={i} open={open} className="aspect-video w-full" />
                    <p className="mt-1 truncate text-xs text-neutral-600">{clip.name}</p>
                  </div>
                ))}
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
  const viewer = useEventViewer(event)
  // the moment whose photos are all on show in a window
  const [allOf, setAllOf] = useState<string | null>(null)
  const all = event.moments.find((m) => m.moment === allOf && m.count > 0)
  // matches as they are now: one that was removed from the event is gone from the results too
  const inEvent = new Map(event.media.map((t) => [t.id, t]))
  const matches = results?.flatMap((t) => inEvent.get(t.id) ?? [])

  const tabs: { id: Tab; label: string }[] = [
    { id: 'moments', label: 'Moments' },
    { id: 'highlights', label: 'Highlights' },
    { id: 'favorites', label: `${term('selects', event.mode)} · ${event.favorites.length}` },
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
      {editing && <EditEventModal event={event} tracked={tracked} onClose={() => setEditing(false)} />}
      {/* a photo opened from this window covers it; closing the photo comes back here */}
      {all && !viewer.isOpen && (
        <Modal wide title={`${all.moment} · ${mediaCount(all.photos, all.videos)}`} onClose={() => setAllOf(null)}>
          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
            {all.thumbs.map((thumb, i) => (
              <Tile key={thumb.id} thumbs={all.thumbs} index={i} open={viewer.open} className="aspect-square w-full" />
            ))}
          </div>
        </Modal>
      )}
      {viewer.element}
      <Notice>{search.error}</Notice>
      {matches && (
        <section className={`${card} mb-6 p-4`}>
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">{matches.length === 0 ? 'No matches' : 'Best matches'}</h2>
            <button type="button" className="text-sm underline" onClick={() => setResults(null)}>
              Clear
            </button>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {matches.map((thumb, i) => (
              <Tile key={thumb.id} thumbs={matches} index={i} open={viewer.open} className="aspect-square w-full" />
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
              {tab === 'moments' && <Moments event={event} open={viewer.open} onViewAll={setAllOf} />}
              {(tab === 'moments' || tab === 'highlights') && <Highlights event={event} open={viewer.open} />}
              {tab === 'favorites' && <Favorites event={event} open={viewer.open} />}
              {((tab === 'moments' && event.videos > 0) || tab === 'clips') && <Clips event={event} open={viewer.open} />}
              {tab === 'unsorted' && (
                <section>
                  <p className="text-sm text-neutral-600">
                    {event.moments.length === 0
                      ? 'Your list is empty, so there is nothing to sort these into yet.'
                      : "KuhaGo wasn't sure about these, so it didn't guess."}
                  </p>
                  {event.unsorted > 0 && (
                    <p className="mt-1 text-sm font-semibold">
                      {event.moments.length > 0 && 'Know where one belongs? Open it and pick its moment from the menu at the top. '}
                      To sort many at once, click Edit list and add a theme or subject that fits, e.g. "Band on stage".
                    </p>
                  )}
                  <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {event.unsortedThumbs.map((thumb, i) => (
                      <Tile key={thumb.id} thumbs={event.unsortedThumbs} index={i} open={viewer.open} className="aspect-square w-full" />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
          <OrganizeCard event={event} />
        </div>

        <aside className="space-y-4">
          <CoverageCard event={event} onOpen={viewer.open} />
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
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {moment.refs.map((thumb) => (
                    <RemovableThumb
                      key={thumb.id}
                      thumb={thumb}
                      label="Remove this example photo"
                      disabled={examples.busy}
                      onRemove={() => examples.run(() => removeExample(event.id, thumb))}
                    />
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
