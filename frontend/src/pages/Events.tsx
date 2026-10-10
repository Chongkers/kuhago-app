import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { EventStatus } from '../api/client'
import { missedMoments, setStatus, STATUSES, useEvents, type EventView } from '../api/data'
import { NewEventModal } from '../components/EventForm'
import { Badge, Thumb } from '../components/ui'
import { Page } from '../components/Shell'
import { count, formatDate, peso } from '../lib/format'
import { useMode } from '../lib/mode'
import { btnPrimary, card, input, panel } from '../lib/styles'
import { term } from '../lib/terms'

function EventCard({ event }: { event: EventView }) {
  const missed = missedMoments(event).length
  const cover = event.moments.flatMap((m) => m.thumbs)

  return (
    <Link to={`/events/${event.id}`} className={`${card} block overflow-hidden hover:border-neutral-400`}>
      <div className="grid h-44 grid-cols-3 grid-rows-2 gap-0.5">
        <Thumb thumb={cover[0]} className="col-span-2 row-span-2 h-full w-full" />
        <Thumb thumb={cover[1] ?? { id: 'b', tone: 3 }} className="h-full w-full" />
        <Thumb thumb={cover[2] ?? { id: 'c', tone: 1 }} className="h-full w-full" />
      </div>
      <div className="p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="min-w-0 truncate text-lg font-semibold">{event.name}</h3>
          {missed > 0 ? <Badge variant="outline">{missed} suggested</Badge> : <Badge variant="outline">All covered</Badge>}
        </div>
        <p className="mt-1 text-sm text-neutral-600">
          {formatDate(event.date, event.endDate)} · {count(event.photos, 'photo')} · {count(event.videos, 'video')}
          {event.mode === 'pro' && ` · in ${term('window', 'pro')}`}
        </p>
      </div>
    </Link>
  )
}

type SortKey = 'name' | 'client' | 'date' | 'venue' | 'fee' | 'paid' | 'status'

const COLUMNS: { key: SortKey; label: string; right?: boolean }[] = [
  { key: 'name', label: 'Gig' },
  { key: 'client', label: 'Client' },
  { key: 'date', label: 'Date' },
  { key: 'venue', label: 'Venue' },
  { key: 'fee', label: 'Fee', right: true },
  { key: 'paid', label: 'Paid' },
  { key: 'status', label: 'Stage' },
]

// What a column sorts by. undefined (nothing typed) always goes last, whichever way the column is sorted.
function sortValue(gig: EventView, key: SortKey): string | number | undefined {
  if (key === 'fee') return gig.fee
  if (key === 'paid') return gig.paid ? 1 : 0
  if (key === 'status') return STATUSES.indexOf(gig.status ?? 'inquiry')
  return gig[key]?.toLowerCase() || undefined
}

function GigsTable({ gigs }: { gigs: EventView[] }) {
  // null: the order gigs were made in, newest first
  const [sort, setSort] = useState<{ key: SortKey; down: boolean } | null>(null)
  const [stage, setStage] = useState<EventStatus | null>(null)
  const [query, setQuery] = useState('')

  const words = query.trim().toLowerCase()
  const shown = gigs.filter(
    (g) =>
      (!stage || (g.status ?? 'inquiry') === stage) &&
      (!words || [g.name, g.client, g.venue].some((text) => text?.toLowerCase().includes(words))),
  )
  if (sort) {
    shown.sort((a, b) => {
      const [x, y] = [sortValue(a, sort.key), sortValue(b, sort.key)]
      if (x === y) return 0
      if (x === undefined) return 1
      if (y === undefined) return -1
      return (x < y ? -1 : 1) * (sort.down ? -1 : 1)
    })
  }

  // first click sorts up, the second down, the third puts the list back as it was
  function sortBy(key: SortKey) {
    setSort(sort?.key !== key ? { key, down: false } : sort.down ? null : { key, down: true })
  }

  return (
    <>
      <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-5" role="group" aria-label="Show one stage">
        {STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            aria-pressed={stage === status}
            onClick={() => setStage(stage === status ? null : status)}
            className={`rounded-2xl px-4 py-3 text-left ${stage === status ? 'bg-neutral-950 text-white' : 'bg-neutral-100 hover:bg-neutral-200'}`}
          >
            <span className={`block text-xs font-medium uppercase tracking-wide ${stage === status ? '' : 'text-neutral-600'}`}>{status}</span>
            <span className="block font-display text-3xl font-bold">{gigs.filter((g) => (g.status ?? 'inquiry') === status).length}</span>
          </button>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by gig, client or venue"
          aria-label="Filter gigs"
          className={`${input} max-w-sm py-2`}
        />
        <p className="text-sm text-neutral-600" role="status">
          {shown.length === gigs.length ? count(gigs.length, 'gig') : `${shown.length} of ${count(gigs.length, 'gig')}`}
          {stage && ` · ${stage}`}
        </p>
        {(stage || words) && (
          <button
            type="button"
            className="text-sm font-medium underline"
            onClick={() => {
              setStage(null)
              setQuery('')
            }}
          >
            Show all
          </button>
        )}
      </div>
      <div className={`${card} mt-3 overflow-x-auto`}>
        <table className="w-full min-w-[52rem] text-left">
          <thead className="bg-neutral-100 text-xs uppercase tracking-wide text-neutral-600">
            <tr>
              {COLUMNS.map((column) => {
                const sorted = sort?.key === column.key
                return (
                  <th
                    key={column.key}
                    aria-sort={sorted ? (sort.down ? 'descending' : 'ascending') : undefined}
                    className={`px-4 py-3 font-medium ${column.right ? 'text-right' : ''}`}
                  >
                    <button type="button" onClick={() => sortBy(column.key)} className="uppercase tracking-wide hover:text-neutral-950">
                      {column.label}
                      <span aria-hidden="true" className={sorted ? '' : 'invisible'}>
                        {' '}
                        {sorted && sort.down ? '↓' : '↑'}
                      </span>
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {shown.map((gig) => (
              <tr key={gig.id}>
                <td className="px-4 py-3.5">
                  <Link to={`/events/${gig.id}`} className="font-display font-semibold underline">
                    {gig.name}
                  </Link>
                </td>
                <td className="px-4 py-3.5">{gig.client || '—'}</td>
                <td className="px-4 py-3.5 text-neutral-600">{formatDate(gig.date, gig.endDate)}</td>
                <td className="px-4 py-3.5 text-neutral-600">{gig.venue || '—'}</td>
                <td className="px-4 py-3.5 text-right font-mono text-sm">{gig.fee != null ? peso(gig.fee) : '—'}</td>
                <td className="px-4 py-3.5">
                  {gig.paid ? <Badge variant="outline">Paid</Badge> : <Badge>Unpaid</Badge>}
                </td>
                <td className="px-4 py-2.5">
                  <select
                    value={gig.status ?? 'inquiry'}
                    onChange={(e) => setStatus(gig.id, e.target.value as EventStatus)}
                    aria-label={`Stage of ${gig.name}`}
                    className="rounded-lg border border-neutral-400 bg-white px-2 py-1 text-sm capitalize"
                  >
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="px-4 py-6 text-center text-sm text-neutral-600">
                  No gigs match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}

export default function Events() {
  const { mode: storedMode } = useMode()
  const mode = storedMode ?? 'personal'
  const pro = mode === 'pro'
  const events = useEvents(mode)
  const [creating, setCreating] = useState(false)

  const photos = events.reduce((sum, e) => sum + e.photos, 0)
  const videos = events.reduce((sum, e) => sum + e.videos, 0)
  const booked = events.reduce((sum, e) => sum + (e.fee ?? 0), 0)
  const unpaid = events.reduce((sum, e) => sum + (e.paid ? 0 : (e.fee ?? 0)), 0)
  const subtitle = pro
    ? `${count(events.length, 'gig')} this season · ${peso(booked)} booked · ${peso(unpaid)} unpaid`
    : `${count(events.length, 'event')} · ${count(photos, 'photo')} · ${count(videos, 'video')}`

  return (
    <Page pro={pro} width="max-w-7xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">{term('eventsTitle', mode)}</h1>
          <p className="mt-1 text-neutral-600">{subtitle}</p>
        </div>
        <button type="button" className={`${btnPrimary} text-base`} onClick={() => setCreating(true)}>
          <span aria-hidden="true">+</span> {term('newEvent', mode)}
        </button>
      </div>

      {creating && <NewEventModal mode={mode} onClose={() => setCreating(false)} />}

      {events.length === 0 ? (
        <section className={`${panel} mt-7 p-8 text-center`}>
          <h2 className="text-xl font-bold">{pro ? 'No gigs yet' : 'No events yet'}</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-neutral-600">
            {pro
              ? 'A gig keeps the client, the fee and the shot list. Its photos show up in Events.'
              : 'Make an event, point KuhaGo at a folder of photos and videos, and it sorts them into moments.'}
          </p>
          <button type="button" className={`${btnPrimary} mt-4`} onClick={() => setCreating(true)}>
            <span aria-hidden="true">+</span> {term('newEvent', mode)}
          </button>
        </section>
      ) : pro ? (
        <GigsTable gigs={events} />
      ) : (
        <div className="mt-9 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </Page>
  )
}
