// Typed wrappers for the local FastAPI backend (AGENTS.md §8).
// The only host this app ever talks to is the backend on localhost.

import type { ReplyLanguage } from '../lib/profile'
import type { Mode } from '../lib/terms'

// A built UI is served by the engine itself, so the API is at the same address under /api.
// Under the Vite dev server it is the engine on :8000 (127.0.0.1, not localhost: another server on [::]:8000
// can catch `localhost` first).
export const API_BASE = import.meta.env.DEV ? 'http://127.0.0.1:8000/api' : '/api'

export type EventStatus = 'inquiry' | 'booked' | 'shot' | 'editing' | 'delivered'
export type SidecarMode = 'lightroom' | 'darktable'

export type KuhaEvent = {
  id: number
  mode: Mode
  name: string
  event_type: string
  date: string | null
  venue: string | null
  // Pro only
  client: string | null
  fee: number | null
  paid: boolean | null
  status: EventStatus | null
}

export type ShotItem = {
  id: number
  event_id: number
  moment: string
  prompt: string[]  // CLIP prompts
  required: boolean
  refs: number[]  // example photo ids, served by refImageUrl
}

export type Media = {
  id: number
  event_id: number
  path: string
  kind: 'photo' | 'video'
  taken_at: string | null
  moment: string
  // true = the user put it in this moment by hand; re-sorting leaves it there
  moment_locked: boolean
  confidence: number
  roll: 'A' | 'B' | null
  speech_ratio: number | null
  sharpness: number | null
  dup_group: number | null
  is_highlight: boolean
  rating: number | null
  is_select: boolean
}

export type CoverageItem = {
  moment: string
  // a must-have; only these count as missed
  required: boolean
  covered: boolean
  count: number
  best_score: number
  candidates: number[]
}

// stage 'error' carries a message and is always followed by 'done'. 'warning' carries a message about files that
// were left out; 'cancelled' means the user stopped the job.
export type JobProgress = { stage: string; done: number; total: number; message?: string }

// dest is relative to the folder the user picks; it starts with root
export type ExportPlan = { root: string; copies: { src: string; dest: string }[] }

export type FinalsResult = {
  matched: { final_path: string; media_id: number; score: number }[]
  unmatched_finals: string[]
  unedited_selects: number[]
}

// What the engine says about itself when the UI opens. ffmpeg/exiftool: false = not installed on this laptop.
export type Health = { ready: boolean; ffmpeg: boolean; exiftool: boolean; highlights_per_moment: number; select_min_rating: number }

export type MomentIdea = { moment: string; prompts: string[] }

export type ChatMessage = { role: 'user' | 'assistant'; content: string }
export type OwlStatus = { connected: boolean; models: string[]; default_model: string; url: string }

function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, init)
  } catch {
    throw new Error("Can't reach KuhaGo's engine. Check that it's running, then try again.")
  }
  if (!res.ok) {
    // the engine's own sentence when it sent one; never the method, path or status code
    const detail: unknown = await res.json().then((body) => body?.detail, () => undefined)
    throw new Error(typeof detail === 'string' ? sentence(detail) : "That didn't work. Check what you typed and try again.")
  }
  return res.json() as Promise<T>
}

function json(method: string, body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}

function query(params: Record<string, string | number | boolean | undefined>): string {
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') qs.set(key, String(value))
  }
  const s = qs.toString()
  return s ? `?${s}` : ''
}

export const api = {
  health: () => request<Health>('/health'),
  listEvents: () => request<KuhaEvent[]>('/events'),
  createEvent: (event: Partial<KuhaEvent> & Pick<KuhaEvent, 'mode' | 'name' | 'event_type'>) =>
    request<KuhaEvent>('/events', json('POST', event)),
  updateEvent: (id: number, patch: Partial<KuhaEvent>) =>
    request<KuhaEvent>(`/events/${id}`, json('PATCH', patch)),
  // forgets the event in KuhaGo; original files and exported folders are never touched
  deleteEvent: (id: number) => request<{ deleted: number }>(`/events/${id}`, { method: 'DELETE' }),
  applyTemplate: (id: number, event_type: string) =>
    request<ShotItem[]>(`/events/${id}/template`, json('POST', { event_type })),

  listShotItems: (eventId: number) => request<ShotItem[]>(`/events/${eventId}/shot_items`),
  // without prompts the engine writes them: from the owl's model when one is given, else from the name
  addShotItem: (eventId: number, item: { moment: string; prompts?: string[]; required?: boolean; model?: string }) =>
    request<ShotItem>(`/events/${eventId}/shot_items`, json('POST', item)),
  updateShotItem: (id: number, patch: { moment?: string; prompts?: string[]; required?: boolean }) =>
    request<ShotItem>(`/shot_items/${id}`, json('PATCH', patch)),
  deleteShotItem: (id: number) => request<ShotItem[]>(`/shot_items/${id}`, { method: 'DELETE' }),
  addRefs: (shotItemId: number, files: File[]) => {
    const form = new FormData()
    for (const file of files) form.append('files', file)
    return request<{ added: number }>(`/shot_items/${shotItemId}/refs`, { method: 'POST', body: form })
  },
  refImageUrl: (refId: number) => `${API_BASE}/refs/${refId}/image`,
  deleteRef: (refId: number) => request<{ removed: number }>(`/refs/${refId}`, { method: 'DELETE' }),

  startIngest: (eventId: number, folders: string[]) =>
    request<{ job_id: string }>(`/events/${eventId}/ingest`, json('POST', { folders })),
  // asks a running job to stop; it ends with a 'cancelled' event
  cancelJob: (jobId: string) => request<{ cancelling: boolean }>(`/jobs/${jobId}/cancel`, { method: 'POST' }),

  listMedia: (eventId: number, filter: { moment?: string; roll?: 'A' | 'B'; highlights?: boolean } = {}) =>
    request<Media[]>(`/events/${eventId}/media${query(filter)}`),
  // forgets it in the event; the original file is never touched
  deleteMedia: (mediaId: number) => request<{ removed: number }>(`/media/${mediaId}`, { method: 'DELETE' }),
  // moment: a name on the list (or Unsorted) places it by hand, null hands it back to KuhaGo; is_select: favorite
  updateMedia: (mediaId: number, patch: { moment?: string | null; is_select?: boolean }) =>
    request<Media>(`/media/${mediaId}`, json('PATCH', patch)),
  // a video's own file, for the player
  videoUrl: (mediaId: number) => `${API_BASE}/media/${mediaId}/file`,
  previewUrl: (mediaId: number) => `${API_BASE}/media/${mediaId}/preview`,
  // small and cached for good by the browser; version must change when the id is reused for another file
  thumbUrl: (mediaId: number, version: string) => `${API_BASE}/media/${mediaId}/thumb${query({ v: version })}`,

  coverage: (eventId: number) => request<CoverageItem[]>(`/events/${eventId}/coverage`),
  search: (q: string, eventId?: number) => request<Media[]>(`/search${query({ q, event_id: eventId })}`),

  exportPlan: (eventId: number) => request<ExportPlan>(`/events/${eventId}/export`, json('POST', { dry_run: true })),
  startExport: (eventId: number, dest: string) =>
    request<{ job_id: string }>(`/events/${eventId}/export`, json('POST', { dest, dry_run: false })),

  owlStatus: () => request<OwlStatus>('/owl/status'),
  ask: (eventId: number, messages: ChatMessage[], model?: string, language?: ReplyLanguage) =>
    // moments: names the user can add with a click; photos: what matches when they asked to find something
    request<{ reply: string; moments: string[]; photos: Media[] }>(`/events/${eventId}/ask`, json('POST', { messages, model, language })),
  suggestMoments: (eventId: number, model?: string) =>
    request<{ moments: MomentIdea[]; saw_photos: boolean }>(`/events/${eventId}/suggest_moments`, json('POST', { model })),

  // the OS folder window on this laptop; null = cancelled
  pickFolder: () => request<{ path: string | null }>('/pick-folder', { method: 'POST' }),

  // Pro only
  matchFinals: (eventId: number, folder: string) =>
    request<{ job_id: string }>(`/events/${eventId}/finals`, json('POST', { folder })),
  getFinals: (eventId: number) => request<FinalsResult>(`/events/${eventId}/finals`),
  writeXmp: (eventId: number, mode: SidecarMode) =>
    request<{ written: number }>(`/events/${eventId}/xmp`, json('POST', { mode })),
}

// Subscribe to a background job's SSE progress. Returns an unsubscribe function.
export function watchJob(
  jobId: string,
  onProgress: (progress: JobProgress) => void,
  onDone?: () => void,
  onError?: (error: Event) => void,
): () => void {
  const source = new EventSource(`${API_BASE}/jobs/${jobId}/events`)
  source.onmessage = (e) => {
    const progress = JSON.parse(e.data) as JobProgress
    onProgress(progress)
    if (progress.stage === 'done') {
      source.close()
      onDone?.()
    }
  }
  source.onerror = (e) => {
    source.close()
    onError?.(e)
  }
  return () => source.close()
}
