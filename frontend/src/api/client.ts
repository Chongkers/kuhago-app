// Typed wrappers for the local FastAPI backend (AGENTS.md §8).
// The only host this app ever talks to is the backend on localhost.

import type { Mode } from '../lib/terms'

export const API_BASE = 'http://localhost:8000'

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
  prompt: string
  required: boolean
}

export type Media = {
  id: number
  event_id: number
  path: string
  kind: 'photo' | 'video'
  taken_at: string | null
  moment: string
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
  covered: boolean
  count: number
  best_score: number
  candidates: number[]
}

export type JobProgress = { stage: string; done: number; total: number }

export type ExportPlan = { copies: { src: string; dest: string }[] }

export type FinalsResult = {
  matched: { final_path: string; media_id: number; score: number }[]
  unmatched_finals: string[]
  unedited_selects: number[]
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init)
  if (!res.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${path} failed: ${res.status} ${await res.text()}`)
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
  listEvents: () => request<KuhaEvent[]>('/events'),
  createEvent: (event: Partial<KuhaEvent> & Pick<KuhaEvent, 'mode' | 'name' | 'event_type'>) =>
    request<KuhaEvent>('/events', json('POST', event)),
  updateEvent: (id: number, patch: Partial<KuhaEvent>) =>
    request<KuhaEvent>(`/events/${id}`, json('PATCH', patch)),
  applyTemplate: (id: number, event_type: string) =>
    request<ShotItem[]>(`/events/${id}/template`, json('POST', { event_type })),

  listShotItems: (eventId: number) => request<ShotItem[]>(`/events/${eventId}/shot_items`),
  addRefs: (shotItemId: number, files: File[]) => {
    const form = new FormData()
    for (const file of files) form.append('files', file)
    return request<{ added: number }>(`/shot_items/${shotItemId}/refs`, { method: 'POST', body: form })
  },

  startIngest: (eventId: number, folders: string[]) =>
    request<{ job_id: string }>(`/events/${eventId}/ingest`, json('POST', { folders })),

  listMedia: (eventId: number, filter: { moment?: string; roll?: 'A' | 'B'; highlights?: boolean } = {}) =>
    request<Media[]>(`/events/${eventId}/media${query(filter)}`),
  previewUrl: (mediaId: number) => `${API_BASE}/media/${mediaId}/preview`,

  coverage: (eventId: number) => request<CoverageItem[]>(`/events/${eventId}/coverage`),
  highlights: (eventId: number) => request<Media[]>(`/events/${eventId}/highlights`),
  search: (q: string, eventId?: number) => request<Media[]>(`/search${query({ q, event_id: eventId })}`),

  exportEvent: (eventId: number, dest: string, dry_run: boolean) =>
    request<ExportPlan | { job_id: string }>(`/events/${eventId}/export`, json('POST', { dest, dry_run })),

  // Pro only
  matchFinals: (eventId: number, folder: string) =>
    request<{ job_id: string }>(`/events/${eventId}/finals`, json('POST', { folder })),
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
