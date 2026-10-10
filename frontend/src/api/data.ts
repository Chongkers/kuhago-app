// View data for the pages. Pages only import hooks and actions from here.
//
// A small store backed by the local engine (./client.ts).

import { useSyncExternalStore } from 'react'
import { basename, finalsView, type FinalsView, type Thumb } from '../lib/finals'
import { useProfiles, type ReplyLanguage } from '../lib/profile'
import type { Mode } from '../lib/terms'
import { api, watchJob, type ChatMessage, type EventStatus, type ExportPlan, type Health, type KuhaEvent, type Media, type MomentIdea } from './client'

export type { FinalsView, Health, MomentIdea, Thumb }

export type SidecarMode = 'lightroom' | 'darktable' | 'rapidraw'

export type MomentView = {
  shotItemId: number
  moment: string
  // photos + videos sorted into it
  count: number
  photos: number
  videos: number
  // a must-have: the only kind the missed-moment check reports
  required: boolean
  // false = the missed-moment check found nothing for it
  covered: boolean
  bestScore?: number
  hint?: string
  // every photo and video sorted into it; pages show the first few and open the rest on request
  thumbs: Thumb[]
  refs: Thumb[]
  // for a missed moment: the closest photos KuhaGo found, to ask "is it one of these?"
  candidates: Thumb[]
}

// Where an Organize job is. stage is the engine's name for the step; jobId is what Stop cancels.
export type IngestProgress = { done: number; total: number; folders: string[]; stage: string; jobId: string }

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
  // everything in the event as it is now, in the order it was taken
  media: Thumb[]
  moments: MomentView[]
  unsorted: number
  unsortedThumbs: Thumb[]
  highlights: { moment: string; thumb: Thumb }[]
  highlightCount: number
  // marked by hand: Favorites in Events, Selects in the Tracker
  favorites: Thumb[]
  clips: { A: Thumb[]; B: Thumb[] }
  // Pro only
  venue?: string
  client?: string
  fee?: number
  paid?: boolean
  status?: EventStatus
  ingest?: IngestProgress
  xmpWritten?: boolean
}

export const STATUSES: EventStatus[] = ['inquiry', 'booked', 'shot', 'editing', 'delivered']

export const UNSORTED = 'Unsorted'
// prefix of an example photo's thumb id, so it never collides with a media id
const REF = 'ref-'

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
    path: m.path,
    video: m.kind === 'video' ? `${api.videoUrl(m.id)}?v=${version}` : undefined,
    moment: m.moment,
    placed: m.moment_locked,
    favorite: m.is_select,
  }
}

// How many of these are videos; the rest are photos.
export function videosIn(thumbs: Thumb[]): number {
  return thumbs.filter((t) => t.video).length
}

async function loadEvent(e: KuhaEvent): Promise<EventView> {
  const [items, media, coverage] = await Promise.all([
    api.listShotItems(e.id),
    api.listMedia(e.id),
    api.coverage(e.id),
  ])
  const byId = new Map(media.map((m) => [m.id, m]))
  const byMoment = new Map<string, Media[]>()
  for (const m of media) byMoment.set(m.moment, [...(byMoment.get(m.moment) ?? []), m])
  const pro = e.mode === 'pro'
  const moments = items.map((item): MomentView => {
    const cov = coverage.find((c) => c.moment === item.moment)
    const found = byMoment.get(item.moment) ?? []
    const videos = found.filter((m) => m.kind === 'video').length
    return {
      shotItemId: item.id,
      moment: item.moment,
      count: found.length,
      photos: found.length - videos,
      videos,
      required: item.required,
      covered: cov?.covered ?? found.length > 0,
      bestScore: cov?.best_score,
      // the raw score is jargon, so only Pro sees it
      hint: pro && cov && !cov.covered && media.length > 0 ? `Closest match: ${cov.best_score.toFixed(2)}` : undefined,
      thumbs: found.map(thumb),
      refs: item.refs.map((id) => ({ id: `${REF}${id}`, src: api.refImageUrl(id), tone: id })),
      candidates: item.required && cov && !cov.covered ? cov.candidates.flatMap((id) => byId.get(id) ?? []).map(thumb) : [],
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
    media: media.map(thumb),
    moments,
    unsorted: unsorted.length,
    unsortedThumbs: unsorted.map(thumb),
    highlights,
    highlightCount: highlights.length,
    favorites: media.filter((m) => m.is_select).map(thumb),
    clips: {
      A: media.filter((m) => m.kind === 'video' && m.roll === 'A').map(thumb),
      B: media.filter((m) => m.kind === 'video' && m.roll !== 'A').map(thumb),
    },
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
  // null: not asked yet, or an engine too old to say
  health: Health | null
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

let state: State = { events: [], finals: {}, sidecarMode: readSidecarMode(), health: null, loaded: false, error: null }
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

// Also the "Try again" of the engine-not-running screen.
export async function loadAll() {
  try {
    const [health, list] = await Promise.all([api.health().catch(() => null), api.listEvents()])
    const events = await Promise.all(list.map(loadEvent))
    setState({ events: events.reverse(), health, loaded: true, error: null })
  } catch {
    setState({ loaded: true, error: OFFLINE })
  }
}

async function reloadEvent(id: number) {
  const fresh = await loadEvent((await api.listEvents()).find((e) => e.id === id)!)
  setState({ events: state.events.map((e) => (e.id === id ? fresh : e)) })
}

void loadAll()

export function useStatus(): { loaded: boolean; error: string | null; health: Health | null } {
  const { loaded, error, health } = useStore()
  return { loaded, error, health }
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

// Forgets the event (and the gig it may be) in KuhaGo. Original files and exported folders are never touched.
export async function deleteEvent(eventId: number): Promise<void> {
  await api.deleteEvent(eventId)
  const finals = { ...state.finals }
  delete finals[eventId]
  setState({ events: state.events.filter((e) => e.id !== eventId), finals })
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

type JobEnd = { notes: string[]; cancelled: boolean }

// Resolves when a background job ends, with what it said about files it left out and whether the user stopped
// it; doing names the work in failure messages ("Organizing").
function waitForJob(
  jobId: string,
  doing: string,
  onProgress?: (done: number, total: number, stage: string) => void,
): Promise<JobEnd> {
  return new Promise<JobEnd>((resolve, reject) => {
    const end: JobEnd = { notes: [], cancelled: false }
    watchJob(
      jobId,
      (p) => {
        if (p.stage === 'error') reject(new Error(`${doing} stopped: ${p.message ?? 'unknown error'}`))
        else if (p.stage === 'warning') end.notes.push(p.message ?? '')
        else if (p.stage === 'cancelled') end.cancelled = true
        else if (p.stage !== 'done') onProgress?.(p.done, p.total, p.stage)
      },
      () => resolve(end),
      () => reject(new Error(`Lost touch with the engine while ${doing.toLowerCase()}.`)),
    )
  })
}

// Organize one or more folders; progress lands on event.ingest until the job ends. Resolves with what to tell
// the user afterwards: files that were left out, or that it was stopped.
export async function startIngest(eventId: number, folders: string[]): Promise<string[]> {
  const { job_id: jobId } = await api.startIngest(eventId, folders)
  patchEvent(eventId, { ingest: { done: 0, total: 0, folders, stage: '', jobId } })
  try {
    const end = await waitForJob(jobId, 'Organizing', (done, total, stage) =>
      patchEvent(eventId, { ingest: { done, total, folders, stage, jobId } }),
    )
    return end.cancelled ? ['Stopped. Nothing from this folder was added.'] : end.notes
  } finally {
    // reload first: clearing the progress early would flash the old, empty event
    await reloadEvent(eventId).catch(() => undefined)
    patchEvent(eventId, { ingest: undefined })
  }
}

// Asks the running Organize to stop. It ends on its own a moment later, and startIngest resolves.
export async function stopIngest(eventId: number): Promise<void> {
  const jobId = state.events.find((e) => e.id === eventId)?.ingest?.jobId
  if (jobId) await api.cancelJob(jobId)
}

export async function searchMedia(eventId: number | undefined, query: string): Promise<Thumb[]> {
  return (await api.search(query, eventId)).map(thumb)
}

// Takes one photo or video out of the event. The original file stays where it is.
export async function removeMedia(eventId: number, thumbId: string): Promise<void> {
  await api.deleteMedia(Number(thumbId))
  await reloadEvent(eventId)
}

// Puts one photo or video where the user says it belongs; it stays there however the list changes.
// moment null hands it back to KuhaGo to sort.
export async function moveMedia(eventId: number, thumbId: string, moment: string | null): Promise<void> {
  await api.updateMedia(Number(thumbId), { moment })
  await reloadEvent(eventId)
}

export async function setFavorite(eventId: number, thumbId: string, favorite: boolean): Promise<void> {
  await api.updateMedia(Number(thumbId), { is_select: favorite })
  await reloadEvent(eventId)
}

export async function addExamples(eventId: number, shotItemId: number, files: File[]): Promise<void> {
  await api.addRefs(shotItemId, files)
  await reloadEvent(eventId)
}

// Takes one example photo (a MomentView ref) off its moment; the event is sorted again without it.
export async function removeExample(eventId: number, ref: Thumb): Promise<void> {
  await api.deleteRef(Number(ref.id.slice(REF.length)))
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
export async function askOwl(
  eventId: number | undefined,
  messages: ChatMessage[],
  preferred: string,
  language: ReplyLanguage,
): Promise<OwlReply> {
  if (eventId === undefined) throw new Error('Create an event first, then ask about it.')
  // no installed model: the engine's default is asked for, and its reply says how to get it
  const model = (await owlModel(preferred)) ?? undefined
  const { reply, moments, photos } = await api.ask(eventId, messages, model, language)
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
