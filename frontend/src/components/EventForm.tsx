import { useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { createEvent, trackEvent, updateDetails, useEvents, type EventView } from '../api/data'
import { todayISO } from '../lib/format'
import { useProfiles } from '../lib/profile'
import { btnPrimary, btnSecondary, input } from '../lib/styles'
import { BLANK, TEMPLATES, templateLabel } from '../lib/templates'
import { term, type Mode } from '../lib/terms'
import { useAction } from '../lib/useAction'
import { Modal, Notice } from './ui'

function Field({ label, className = '', children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <label className={`block text-sm font-medium ${className}`}>
      {label}
      <span className="mt-1 block">{children}</span>
    </label>
  )
}

// A fee is an amount or nothing; anything else typed is read as no fee.
function feeOf(text: string): number | undefined {
  const n = Number(text)
  return text.trim() && Number.isFinite(n) && n >= 0 ? n : undefined
}

// The client, venue and fee of a gig. Shared by the new-gig and edit windows.
function GigFields({ client, venue, fee, set }: { client: string; venue: string; fee: string; set: (patch: { client?: string; venue?: string; fee?: string }) => void }) {
  return (
    <>
      <Field label="Client">
        <input value={client} onChange={(e) => set({ client: e.target.value })} className={input} />
      </Field>
      <Field label="Fee (₱)">
        <input type="number" min={0} step="any" value={fee} onChange={(e) => set({ fee: e.target.value })} placeholder="Not set" className={`${input} font-mono`} />
      </Field>
      <Field label="Venue" className="sm:col-span-2">
        <input value={venue} onChange={(e) => set({ venue: e.target.value })} className={input} />
      </Field>
    </>
  )
}

const NEW = 'new'

// New event (Events window) or new gig (Tracker). A gig either starts its own event or tracks one that is
// already in Events, so its shot list and its photos are one and the same event.
export function NewEventModal({ mode, onClose }: { mode: Mode; onClose: () => void }) {
  const navigate = useNavigate()
  const { claimEvent } = useProfiles()
  const { error, run } = useAction()
  const pro = mode === 'pro'
  // events that are not gigs yet: the ones a new gig can track
  const untracked = useEvents('personal').filter((e) => e.mode === 'personal')
  const [source, setSource] = useState(NEW)
  const existing = untracked.find((e) => String(e.id) === source)
  const [eventType, setEventType] = useState(TEMPLATES[0].eventType)
  const [name, setName] = useState('')
  const [date, setDate] = useState(todayISO)
  const [gig, setGig] = useState({ client: '', venue: '', fee: '' })
  const [busy, setBusy] = useState(false)

  function submit(e: FormEvent) {
    e.preventDefault()
    if (busy || (!existing && !name.trim())) return
    setBusy(true)
    run(async () => {
      try {
        const details = { client: gig.client.trim(), venue: gig.venue.trim(), fee: feeOf(gig.fee) }
        let id: number
        if (existing) {
          id = existing.id
          await trackEvent(id, details)
        } else {
          id = await createEvent({ mode, name: name.trim(), eventType, date, ...(pro ? details : {}) })
          claimEvent(id)
        }
        navigate(`/events/${id}`)
      } finally {
        setBusy(false)
      }
    })
  }

  return (
    <Modal title={term('newEvent', mode)} onClose={onClose}>
      <form onSubmit={submit} className="mt-4 space-y-5">
        {pro && untracked.length > 0 && (
          <Field label="Photos">
            <select value={source} onChange={(e) => setSource(e.target.value)} className={input}>
              <option value={NEW}>Start a new event for this gig</option>
              {untracked.map((e) => (
                <option key={e.id} value={e.id}>
                  Track "{e.name}", already in Events
                </option>
              ))}
            </select>
          </Field>
        )}

        {!existing && (
          <fieldset>
            <legend className="text-sm font-medium">Start from a preset</legend>
            <p className="mt-0.5 text-xs text-neutral-600">
              Only a starting list of {term('moment', mode)}s. You can add, rename and remove them any time, or pick
              Custom to write your own.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[...TEMPLATES, { eventType: BLANK, label: templateLabel(BLANK) }].map((template) => (
                <button
                  key={template.eventType}
                  type="button"
                  aria-pressed={eventType === template.eventType}
                  onClick={() => setEventType(template.eventType)}
                  className={`rounded-full border px-3.5 py-1.5 font-display text-sm font-medium ${
                    eventType === template.eventType
                      ? 'border-neutral-950 bg-neutral-950 text-white'
                      : 'border-neutral-400 hover:border-neutral-950'
                  }`}
                >
                  {template.label}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {!existing && (
            <>
              <Field label={`${term('event', mode)} name`}>
                <input
                  autoFocus
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={pro ? "Bea's Debut" : "Lola's 80th Birthday"}
                  className={input}
                />
              </Field>
              <Field label="Date">
                <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={input} />
              </Field>
            </>
          )}
          {pro && <GigFields {...gig} set={(patch) => setGig({ ...gig, ...patch })} />}
        </div>

        <Notice>{error}</Notice>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={btnSecondary}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={btnPrimary}>
            {busy ? 'Creating…' : existing ? 'Track as a gig' : `Create ${term('event', mode).toLowerCase()}`}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// Change what was typed when the event or gig was made.
export function EditEventModal({ event, onClose }: { event: EventView; onClose: () => void }) {
  const { error, run } = useAction()
  const pro = event.mode === 'pro'
  const [name, setName] = useState(event.name)
  const [date, setDate] = useState(event.date)
  const [gig, setGig] = useState({ client: event.client ?? '', venue: event.venue ?? '', fee: event.fee != null ? String(event.fee) : '' })
  const [paid, setPaid] = useState(event.paid ?? false)
  const [busy, setBusy] = useState(false)

  function submit(e: FormEvent) {
    e.preventDefault()
    if (busy || !name.trim()) return
    setBusy(true)
    run(async () => {
      try {
        await updateDetails(event, { name: name.trim(), date, venue: gig.venue.trim(), client: gig.client.trim(), fee: feeOf(gig.fee) ?? null, paid })
        onClose()
      } finally {
        setBusy(false)
      }
    })
  }

  return (
    <Modal title={`Edit ${term('event', event.mode).toLowerCase()} details`} onClose={onClose}>
      <form onSubmit={submit} className="mt-4 space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`${term('event', event.mode)} name`}>
            <input autoFocus required value={name} onChange={(e) => setName(e.target.value)} className={input} />
          </Field>
          <Field label="Date">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} />
          </Field>
          {pro ? (
            <GigFields {...gig} set={(patch) => setGig({ ...gig, ...patch })} />
          ) : (
            <Field label="Venue" className="sm:col-span-2">
              <input value={gig.venue} onChange={(e) => setGig({ ...gig, venue: e.target.value })} className={input} />
            </Field>
          )}
        </div>
        {pro && (
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" className="h-4 w-4 accent-neutral-950" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
            Paid
          </label>
        )}
        <Notice>{error}</Notice>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={btnSecondary}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={btnPrimary}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
