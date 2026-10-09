// View data for the pages. Pages only import hooks and actions from here.
//
// A small store backed by the local engine (./client.ts).

import { useSyncExternalStore } from 'react'
import { basename, finalsView, type FinalsView, type Thumb } from '../lib/finals'
import { useProfiles } from '../lib/profile'
import type { Mode } from '../lib/terms'
import { api, watchJob, type ChatMessage, type EventStatus, type ExportPlan, type KuhaEvent, type Media, type MomentIdea } from './client'

export type { FinalsView, MomentIdea, Thumb }

export type SidecarMode = 'lightroom' | 'darktable' | 'rapidraw'

export type MomentView = {
  shotItemId: number
  moment: string
  count: number
  // a must-have: the only kind the missed-moment check reports
  required: boolean
  // false = the missed-moment check found nothing for it
  covered: boolean
  bestScore?: number
  hint?: string
  // every photo and video sorted into it; pages show the first few and open the rest on request
  thumbs: Thumb[]
  refs: Thumb[]
}

export type Clip = { file: string; moment: string; duration: string }
export type Roll = { count: number; items: Clip[] }

export type EventView = {
  id: number
  mode: Mode
  name: string
  eventType: string
  date: string
  endDate?: string
  photos: number
  videos: number
  // number of phones / cards the media came from
  sources?: number
  moments: MomentView[]
  unsorted: number
  unsortedThumbs: Thumb[]
  highlights: { moment: string; thumb: Thumb }[]
  highlightCount: number
  clips: { A: Roll; B: Roll }
  // Pro only
  venue?: string
  client?: string
  fee?: number
  paid?: boolean
  status?: EventStatus
  ingest?: { done: number; total: number; folders: string[] }
  xmpWritten?: boolean
}

export const STATUSES: EventStatus[] = ['inquiry', 'booked', 'shot', 'editing', 'delivered']

const UNSORTED = 'Unsorted'

// Missed = a must-have with nothing found. Optional moments are never reported as missed.
export function missedMoments(event: EventView): MomentView[] {
  return event.moments.filter((m) => m.required && !m.covered)
}

// Media ids are reused after an event is deleted, and thumbs are cached for good, so the URL carries
// a fingerprint of the file the id currently stands for.
function fingerprint(text: string): string {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (Math.imul(h, 31) + text.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

function thumb(m: Media): Thumb {
  const version = fingerprint(`${m.event_id}|${m.path}|${m.taken_at}`)
  return {
    id: String(m.id),
    src: api.thumbUrl(m.id, version),
    tone: m.id,
    full: `${api.previewUrl(m.id)}?v=${version}`,
    name: basename(m.path),
  }
}

function roll(media: Media[], r: 'A' | 'B'): Roll {
  const items = media
    .filter((m) => m.kind === 'video' && m.roll === r)
    .map((m) => ({ file: basename(m.path), moment: m.moment, duration: '' }))
  return { count: items.length, items }
}

async function loadEvent(e: KuhaEvent): Promise<EventView> {
  const [items, media, coverage] = await Promise.all([
    api.listShotItems(e.id),
    api.listMedia(e.id),
    api.coverage(e.id),
  ])
  const byMoment = new Map<string, Media[]>()
  for (const m of media) byMoment.set(m.moment, [...(byMoment.get(m.moment) ?? []), m])
  const pro = e.mode === 'pro'
  const moments = items.map((item): MomentView => {
    const cov = coverage.find((c) => c.moment === item.moment)
    const found = byMoment.get(item.moment) ?? []
    return {
      shotItemId: item.id,
      moment: item.moment,
      count: found.length,
      required: item.required,
      covered: cov?.covered ?? found.length > 0,
      bestScore: cov?.best_score,
      // the raw score is jargon, so only Pro sees it
      hint: pro && cov && !cov.covered && media.length > 0 ? `Closest match: ${cov.best_score.toFixed(2)}` : undefined,
      thumbs: found.map(thumb),
      refs: item.refs.map((id) => ({ id: `ref-${id}`, src: api.refImageUrl(id), tone: id })),
    }
  })
  const unsorted = byMoment.get(UNSORTED) ?? []
  const highlights = media.filter((m) => m.is_highlight).map((m) => ({ moment: m.moment, thumb: thumb(m) }))
  return {
    id: e.id,
    mode: e.mode,
    name: e.name,
    eventType: e.event_type,
    date: e.date ?? '',
    photos: media.filter((m) => m.kind === 'photo').length,
    videos: media.filter((m) => m.kind === 'video').length,
    moments,
    unsorted: unsorted.length,
    unsortedThumbs: unsorted.map(thumb),
    highlights,
    highlightCount: highlights.length,
    clips: { A: roll(media, 'A'), B: roll(media, 'B') },
    venue: e.venue ?? undefined,
    client: e.client ?? undefined,
    fee: e.fee ?? undefined,
    paid: e.paid ?? undefined,
    status: e.status ?? undefined,
  }
}

type State = {
  events: EventView[]
  finals: Record<number, FinalsView | undefined>
  sidecarMode: SidecarMode
  loaded: boolean
  error: string | null
}

const SIDECAR_KEY = 'kuha.sidecarMode'

function readSidecarMode(): SidecarMode {
  try {
    const value = localStorage.getItem(SIDECAR_KEY)
    return value === 'lightroom' || value === 'rapidraw' ? value : 'darktable'
  } catch {
    return 'darktable'
  }
}

let state: State = { events: [], finals: {}, sidecarMode: readSidecarMode(), loaded: false, error: null }
const listeners = new Set<() => void>()

function setState(next: Partial<State>) {
  state = { ...state, ...next }
  for (const listener of listeners) listener()
}

function patchEvent(id: number, patch: Partial<EventView>) {
  setState({ events: state.events.map((e) => (e.id === id ? { ...e, ...patch } : e)) })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function useStore(): State {
  return useSyncExternalStore(subscribe, () => state)
}

const OFFLINE = "Can't reach KuhaGo's engine. Start it (backend on port 8000), then reload this page."

async function loadAll() {
  try {
    const events = await Promise.all((await api.listEvents()).map(loadEvent))
    setState({ events: events.reverse(), loaded: true, error: null })
  } catch {
    setState({ loaded: true, error: OFFLINE })
  }
}

async function reloadEvent(id: number) {
  const fresh = await loadEvent((await api.listEvents()).find((e) => e.id === id)!)
  setState({ events: state.events.map((e) => (e.id === id ? fresh : e)) })
}

void loadAll()

export function useStatus(): { loaded: boolean; error: string | null } {
  const { loaded, error } = useStore()
  return { loaded, error }
}

// Each profile only sees the events it created (see ownsEvent in lib/profile).
// The Events window lists all of them; the Tracker lists the ones that are gigs. A gig is an event too, so
// its photos are browsed in Events.
export function useEvents(mode: Mode): EventView[] {
  const { ownsEvent } = useProfiles()
  return useStore().events.filter((e) => (mode === 'personal' || e.mode === 'pro') && ownsEvent(e.id))
}

export function useEvent(id: number): EventView | undefined {
  const { ownsEvent } = useProfiles()
  return useStore().events.find((e) => e.id === id && ownsEvent(e.id))
}

export function useFinals(eventId: number): FinalsView | undefined {
  return useStore().finals[eventId]
}

export function useSidecarMode(): SidecarMode {
  return useStore().sidecarMode
}

export function setSidecarMode(sidecarMode: SidecarMode) {
  try {
    localStorage.setItem(SIDECAR_KEY, sidecarMode)
  } catch {
    // storage unavailable: the choice still applies for this session
  }
  setState({ sidecarMode })
}

export async function createEvent(input: {
  mode: Mode
  name: string
  eventType: string
  date: string
  venue?: string
  client?: string
  fee?: number
}): Promise<number> {
  const created = await api.createEvent({
    mode: input.mode,
    name: input.name,
    event_type: input.eventType,
    date: input.date,
    venue: input.venue || null,
    ...(input.mode === 'pro'
      ? { client: input.client || null, fee: input.fee ?? null, paid: false, status: 'inquiry' as const }
      : {}),
  })
  await api.applyTemplate(created.id, input.eventType)
  setState({ events: [await loadEvent(created), ...state.events] })
  return created.id
}

export type EventDetails = { name: string; date: string; venue: string; client: string; fee: number | null; paid: boolean }

// Edits what was typed when the event was made. Client, fee and paid are sent for gigs only.
export async function updateDetails(event: EventView, details: EventDetails): Promise<void> {
  const { name, date, venue, client, fee, paid } = details
  await api.updateEvent(event.id, {
    name,
    date: date || null,
    venue: venue || null,
    ...(event.mode === 'pro' ? { client: client || null, fee, paid } : {}),
  })
  await reloadEvent(event.id)
}

// Starts tracking an event that is already in Events as a gig. Its photos and list stay as they are.
export async function trackEvent(eventId: number, gig: { client?: string; venue?: string; fee?: number }): Promise<void> {
  await api.updateEvent(eventId, {
    mode: 'pro',
    status: 'inquiry',
    paid: false,
    client: gig.client || null,
    fee: gig.fee ?? null,
    ...(gig.venue ? { venue: gig.venue } : {}),
  })
  await reloadEvent(eventId)
}

// The checklist is the user's: a preset only fills it in to begin with. Every change re-labels the event.
export async function addMoment(
  eventId: number,
  moment: string,
  options: { prompts?: string[]; required?: boolean; model?: string } = {},
): Promise<void> {
  await api.addShotItem(eventId, { moment, ...options })
  await reloadEvent(eventId)
}

export async function updateMoment(
  eventId: number,
  shotItemId: number,
  patch: { moment?: string; required?: boolean },
): Promise<void> {
  await api.updateShotItem(shotItemId, patch)
  await reloadEvent(eventId)
}

export async function removeMoment(eventId: number, shotItemId: number): Promise<void> {
  await api.deleteShotItem(shotItemId)
  await reloadEvent(eventId)
}

// Replaces the whole list (and the example photos on it) with another preset's, or with nothing.
export async function switchPreset(eventId: number, eventType: string): Promise<void> {
  await api.applyTemplate(eventId, eventType)
  await reloadEvent(eventId)
}

// The Ollama model the owl can use right now: the preferred one when installed, else the engine's default,
// else the first installed. null when Ollama is off or has no models (or the engine is unreachable).
export async function owlModel(preferred: string): Promise<string | null> {
  try {
    const status = await api.owlStatus()
    if (!status.connected) return null
    return [preferred, status.default_model].find((m) => status.models.includes(m)) ?? status.models[0] ?? null
  } catch {
    return null
  }
}

// Moments the owl thinks the photos really show; nothing is added until the user picks one.
export async function suggestMoments(eventId: number, model?: string): Promise<MomentIdea[]> {
  return (await api.suggestMoments(eventId, model)).moments
}

export const pickFolder = async (): Promise<string | null> => (await api.pickFolder()).path

export function setStatus(id: number, status: EventStatus) {
  patchEvent(id, { status })
  api.updateEvent(id, { status }).catch(() => reloadEvent(id))
}

// Resolves when a background job ends; doing names the work in failure messages ("Organizing").
function waitForJob(jobId: string, doing: string, onProgress?: (done: number, total: number) => void): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    watchJob(
      jobId,
      (p) => {
        if (p.stage === 'error') reject(new Error(`${doing} stopped: ${p.message ?? 'unknown error'}`))
        else if (p.stage !== 'done') onProgress?.(p.done, p.total)
      },
      resolve,
      () => reject(new Error(`Lost touch with the engine while ${doing.toLowerCase()}.`)),
    )
  })
}

// Organize one or more folders; progress lands on event.ingest until the job ends.
export async function startIngest(eventId: number, folders: string[]): Promise<void> {
  const { job_id } = await api.startIngest(eventId, folders)
  patchEvent(eventId, { ingest: { done: 0, total: 0, folders } })
  try {
    await waitForJob(job_id, 'Organizing', (done, total) => patchEvent(eventId, { ingest: { done, total, folders } }))
  } finally {
    // reload first: clearing the progress early would flash the old, empty event
    await reloadEvent(eventId).catch(() => undefined)
    patchEvent(eventId, { ingest: undefined })
  }
}

export async function searchMedia(eventId: number | undefined, query: string): Promise<Thumb[]> {
  return (await api.search(query, eventId)).map(thumb)
}

// Takes one photo or video out of the event. The original file stays where it is.
export async function removeMedia(eventId: number, thumbId: string): Promise<void> {
  await api.deleteMedia(Number(thumbId))
  await reloadEvent(eventId)
}

export async function addExamples(eventId: number, shotItemId: number, files: File[]): Promise<void> {
  await api.addRefs(shotItemId, files)
  await reloadEvent(eventId)
}

// RapidRAW reads full-filename sidecars, the same naming as darktable.
export async function writeXmp(eventId: number, mode: SidecarMode): Promise<void> {
  await api.writeXmp(eventId, mode === 'rapidraw' ? 'darktable' : mode)
  patchEvent(eventId, { xmpWritten: true })
}

// Last finals result per event; folder is kept from the scan that made it.
export async function loadFinals(eventId: number, folder = state.finals[eventId]?.folder): Promise<void> {
  const [result, media] = await Promise.all([api.getFinals(eventId), api.listMedia(eventId)])
  const view = finalsView(folder, result, media, thumb)
  setState({ finals: { ...state.finals, [eventId]: view } })
}

export async function scanFinals(eventId: number, folder: string): Promise<void> {
  const { job_id } = await api.matchFinals(eventId, folder)
  await waitForJob(job_id, 'Matching')
  await loadFinals(eventId, folder)
}

export type OwlReply = { reply: string; moments: string[]; photos: Thumb[] }

// One answer about an event from Ollama on this laptop. messages is the whole conversation so far.
export async function askOwl(eventId: number | undefined, messages: ChatMessage[], preferred: string): Promise<OwlReply> {
  if (eventId === undefined) throw new Error('Create an event first, then ask about it.')
  // no installed model: the engine's default is asked for, and its reply says how to get it
  const model = (await owlModel(preferred)) ?? undefined
  const { reply, moments, photos } = await api.ask(eventId, messages, model)
  return { reply, moments, photos: photos.map(thumb) }
}

// Resolves with a sentence saying what Ollama has; rejects with one saying what's missing.
export async function testOllama(): Promise<string> {
  const status = await api.owlStatus()
  if (!status.connected) throw new Error("Ollama isn't running on this laptop. Open the Ollama app, then test again.")
  if (status.models.length === 0) throw new Error(`Ollama is running but has no models yet. Run: ollama pull ${status.default_model}`)
  return `Connected to Ollama. Models on this laptop: ${status.models.join(', ')}.`
}

export const loadExportPlan = (eventId: number): Promise<ExportPlan> => api.exportPlan(eventId)

// Copy the event into dest on the engine; resolves when the copy job ends.
export async function runExport(
  eventId: number,
  dest: string,
  onProgress: (done: number, total: number) => void,
): Promise<void> {
  const { job_id } = await api.startExport(eventId, dest)
  await waitForJob(job_id, 'Copying', onProgress)
}
