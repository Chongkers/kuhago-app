import { useState } from 'react'
import { Link } from 'react-router-dom'
import { missedMoments, STATUSES, useEvents, type EventView } from '../api/data'
import { NewEventModal } from '../components/EventForm'
import { Badge, Thumb } from '../components/ui'
import { Page } from '../components/Shell'
import { count, formatDate, peso } from '../lib/format'
import { useMode } from '../lib/mode'
import { btnPrimary, card, panel } from '../lib/styles'
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

function GigsTable({ gigs }: { gigs: EventView[] }) {
  return (
    <>
      <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {STATUSES.map((status) => (
          <div key={status} className={`${panel} px-4 py-3`}>
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-600">{status}</p>
            <p className="font-display text-3xl font-bold">{gigs.filter((g) => g.status === status).length}</p>
          </div>
        ))}
      </div>
      <div className={`${card} mt-7 overflow-x-auto`}>
        <table className="w-full min-w-[52rem] text-left">
          <thead className="bg-neutral-100 text-xs uppercase tracking-wide text-neutral-600">
            <tr>
              {['Gig', 'Client', 'Date', 'Venue'].map((h) => (
                <th key={h} className="px-4 py-3 font-medium">
                  {h}
                </th>
              ))}
              <th className="px-4 py-3 text-right font-medium">Fee</th>
              <th className="px-4 py-3 font-medium">Paid</th>
              <th className="px-4 py-3 font-medium">Stage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {gigs.map((gig) => (
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
                <td className="px-4 py-3.5 capitalize">{gig.status}</td>
              </tr>
            ))}
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
