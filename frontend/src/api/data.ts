// View data for the pages. Pages only import hooks and actions from here.
//
// There is no backend yet, so this is an in-memory store seeded with the sample content
// from the wireframes. To go live, reimplement these hooks/actions on top of ./client.ts;
// the pages do not need to change. Actions that need the real engine reject with
// NOT_CONNECTED so the UI already shows their failure path.

import { useSyncExternalStore } from 'react'
import type { Mode } from '../lib/terms'
import { TEMPLATES } from '../lib/templates'
import type { EventStatus } from './client'

export type SidecarMode = 'lightroom' | 'darktable' | 'rapidraw'

export type Thumb = { id: string; src?: string; tone: number }

export type MomentView = {
  moment: string
  count: number
  bestScore?: number
  hint?: string
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
  highlights: { moment: string; thumb: Thumb }[]
  highlightCount: number
  clips: { A: Roll; B: Roll }
  exportSize?: string
  // Pro only
  venue?: string
  client?: string
  fee?: number
  paid?: boolean
  status?: EventStatus
  ingest?: { done: number; total: number; folders: string[] }
  archiveFiles?: number
  xmpWritten?: boolean
}

export type FinalsView = {
  folder: string
  selects: number
  finals: number
  matchedTotal: number
  unedited: { file: string; rating: number; moment: string; thumb: Thumb }[]
  unmatched: { file: string; note: string }[]
  matched: { final: string; raw: string; moment: string; hamming: number }[]
}

export const STATUSES: EventStatus[] = ['inquiry', 'booked', 'shot', 'editing', 'delivered']

export function placeholderThumbs(prefix: string, n: number): Thumb[] {
  return Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${i}`, tone: (i * 7 + prefix.length * 3) % 5 }))
}

export function missedMoments(event: EventView): MomentView[] {
  return event.moments.filter((m) => m.count === 0)
}

function moment(name: string, count: number, extra: Partial<MomentView> = {}): MomentView {
  return { moment: name, count, thumbs: placeholderThumbs(name, Math.min(count, 6)), refs: [], ...extra }
}

function withRefs(name: string, count: number): MomentView {
  return moment(name, count, { refs: placeholderThumbs(`ref-${name}`, 3) })
}

function highlightsOf(moments: MomentView[]): EventView['highlights'] {
  return moments
    .filter((m) => m.count > 0)
    .slice(0, 4)
    .map((m) => ({ moment: m.moment, thumb: m.thumbs[0] }))
}

const NO_CLIPS = { A: { count: 0, items: [] }, B: { count: 0, items: [] } }

function gig(
  id: number,
  name: string,
  eventType: string,
  client: string,
  date: string,
  venue: string,
  fee: number,
  paid: boolean,
  status: EventStatus,
): EventView {
  const template = TEMPLATES.find((t) => t.eventType === eventType)
  return {
    id, mode: 'pro', name, eventType, client, date, venue, fee, paid, status,
    photos: 0, videos: 0, unsorted: 0, highlights: [], highlightCount: 0, clips: NO_CLIPS,
    moments: (template?.moments ?? []).map((m) => moment(m, 0)),
  }
}

const lolaMoments = [
  moment('Blowing the Candles', 12),
  moment('Cake', 18),
  moment('Food / Handaan', 34),
  moment('Arrival / Guests', 57),
  moment('Games', 9),
  moment('Decorations', 22),
  moment('Group Photo', 0, { hint: "Take one while everyone's still here." }),
  moment('Gift Opening', 0),
]

const tripMoments = [
  moment('Scenery', 188),
  moment('Beach / Pool', 142),
  moment('Selfies', 96),
  moment('Food', 71),
  moment('Travel / Transport', 64),
  moment('Group Photo', 38),
]

const gradMoments = [
  moment('Toga Portrait', 31),
  moment('Family with Graduate', 27),
  moment('Celebration Meal', 26),
  moment('Marching', 22),
  moment('Receiving Diploma', 0),
]

const debutMoments = [
  withRefs('Grand Entrance', 46),
  withRefs('18 Roses', 112),
  withRefs('18 Treasures', 31),
  withRefs('Cotillion', 88),
  withRefs('Cake', 14),
  withRefs('Speech / Toast', 22),
  moment('Details / Decor', 40),
  moment('18 Candles', 0, { bestScore: 0.21, hint: 'Closest match: 0.21 · check B-cam card' }),
  moment('Family Formals', 0),
]

const SEED_EVENTS: EventView[] = [
  {
    id: 1, mode: 'personal', name: "Lola's 80th Birthday", eventType: 'birthday', date: '2026-10-04',
    photos: 482, videos: 21, sources: 4, moments: lolaMoments, unsorted: 12,
    highlights: highlightsOf(lolaMoments), highlightCount: 30, exportSize: '2.8 GB',
    clips: { A: { count: 8, items: [] }, B: { count: 13, items: [] } },
  },
  {
    id: 2, mode: 'personal', name: 'Barkada trip — La Union', eventType: 'trip', date: '2026-08-15', endDate: '2026-08-17',
    photos: 611, videos: 24, sources: 6, moments: tripMoments, unsorted: 12,
    highlights: highlightsOf(tripMoments), highlightCount: 30,
    clips: { A: { count: 5, items: [] }, B: { count: 19, items: [] } },
  },
  {
    id: 3, mode: 'personal', name: "Ate Mika's Graduation", eventType: 'graduation', date: '2026-06-28',
    photos: 111, videos: 2, sources: 2, moments: gradMoments, unsorted: 5,
    highlights: highlightsOf(gradMoments), highlightCount: 20,
    clips: { A: { count: 1, items: [] }, B: { count: 1, items: [] } },
  },
  {
    id: 101, mode: 'pro', name: "Bea's Debut", eventType: 'debut', client: 'Santos family', date: '2026-10-03',
    venue: 'Casa Alegre, Quezon City', fee: 35000, paid: false, status: 'editing',
    photos: 1284, videos: 38, moments: debutMoments, unsorted: 0,
    highlights: highlightsOf(debutMoments), highlightCount: 35,
    ingest: { done: 1284, total: 1410, folders: ['E:\\DCIM\\100CANON', 'E:\\DCIM\\101CANON', 'F:\\B-CAM'] },
    exportSize: '68.4 GB', archiveFiles: 1520, xmpWritten: true,
    clips: {
      A: {
        count: 11,
        items: [
          { file: 'MVI_0412.MP4', moment: 'Speech / Toast', duration: '2:41' },
          { file: 'MVI_0398.MP4', moment: '18 Candles', duration: '4:05' },
          { file: 'C0031.MP4', moment: 'Grand Entrance', duration: '0:52' },
        ],
      },
      B: {
        count: 27,
        items: [
          { file: 'C0044.MP4', moment: 'Details / Decor', duration: '0:18' },
          { file: 'C0047.MP4', moment: 'Cotillion', duration: '1:36' },
          { file: 'MVI_0420.MP4', moment: 'Cake', duration: '0:25' },
        ],
      },
    },
  },
  gig(102, 'Reyes–Lim Wedding', 'wedding', 'Carla Reyes', '2026-10-17', 'Tagaytay', 65000, false, 'booked'),
  gig(103, 'Baby Elijah Binyag', 'binyag', 'Dela Cruz family', '2026-09-20', 'Pasig', 18000, true, 'delivered'),
  gig(104, 'Ana & Paolo Prenup', 'wedding', 'Ana Villanueva', '2026-11-08', 'Intramuros', 22000, false, 'inquiry'),
  gig(105, "Migo's 7th Birthday", 'birthday', 'Tan family', '2026-09-27', 'Makati', 15000, true, 'delivered'),
  gig(106, 'Class of 2026 Graduation', 'graduation', 'St. Jude Academy', '2026-10-01', 'Marikina', 31000, false, 'shot'),
]

const SEED_FINALS: Record<number, FinalsView> = {
  101: {
    folder: 'D:\\Gigs\\Bea Debut\\Exports',
    selects: 64,
    finals: 62,
    matchedTotal: 61,
    unedited: [
      { file: 'IMG_4471.CR3', rating: 4, moment: '18 Roses', thumb: { id: 'u1', tone: 1 } },
      { file: 'IMG_4630.CR3', rating: 3, moment: 'Cotillion', thumb: { id: 'u2', tone: 0 } },
      { file: 'IMG_4802.CR3', rating: 5, moment: 'Speech / Toast', thumb: { id: 'u3', tone: 2 } },
    ],
    unmatched: [
      {
        file: 'Bea_Debut_Final_047.jpg',
        note: 'Heavy crop — no RAW matched above the threshold. Pick its RAW by hand.',
      },
    ],
    matched: [
      { final: 'Bea_Debut_Final_001.jpg', raw: 'IMG_4102.CR3', moment: 'Grand Entrance', hamming: 3 },
      { final: 'Bea_Debut_Final_002.jpg', raw: 'IMG_4118.CR3', moment: 'Grand Entrance', hamming: 5 },
      { final: 'Bea_Debut_Final_014.jpg', raw: 'IMG_4466.CR3', moment: '18 Roses', hamming: 2 },
      { final: 'Bea_Debut_Final_031.jpg', raw: 'IMG_4655.CR3', moment: 'Cotillion', hamming: 7 },
    ],
  },
}

type State = { events: EventView[]; finals: Record<number, FinalsView>; sidecarMode: SidecarMode }

let state: State = { events: SEED_EVENTS, finals: SEED_FINALS, sidecarMode: 'darktable' }
const listeners = new Set<() => void>()

function setState(next: Partial<State>) {
  state = { ...state, ...next }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function useStore(): State {
  return useSyncExternalStore(subscribe, () => state)
}

export function useEvents(mode: Mode): EventView[] {
  return useStore().events.filter((e) => e.mode === mode)
}

export function useEvent(id: number): EventView | undefined {
  return useStore().events.find((e) => e.id === id)
}

export function useFinals(eventId: number): FinalsView | undefined {
  return useStore().finals[eventId]
}

export function useSidecarMode(): SidecarMode {
  return useStore().sidecarMode
}

export function setSidecarMode(sidecarMode: SidecarMode) {
  setState({ sidecarMode })
}

export function createEvent(input: {
  mode: Mode
  name: string
  eventType: string
  date: string
  client?: string
}): number {
  const id = Math.max(...state.events.map((e) => e.id)) + 1
  const template = TEMPLATES.find((t) => t.eventType === input.eventType)
  const event: EventView = {
    ...input,
    id,
    photos: 0, videos: 0, unsorted: 0, highlights: [], highlightCount: 0, clips: NO_CLIPS,
    moments: (template?.moments ?? []).map((m) => moment(m, 0)),
    ...(input.mode === 'pro' ? { paid: false, status: 'inquiry' as const } : {}),
  }
  setState({ events: [event, ...state.events] })
  return id
}

export function setStatus(id: number, status: EventStatus) {
  setState({ events: state.events.map((e) => (e.id === id ? { ...e, status } : e)) })
}

export const NOT_CONNECTED = "KuhaGo's engine isn't connected yet, so this can't run on real files."

function notConnected(): Promise<never> {
  return Promise.reject(new Error(NOT_CONNECTED))
}

// These need the real backend (ingest, CLIP search, ExifTool, native folder picker).
export const startIngest = (_eventId: number, _folders: string[]) => notConnected()
export const searchMedia = (_eventId: number, _query: string) => notConnected()
export const addExamples = (_eventId: number) => notConnected()
export const writeXmp = (_eventId: number, _mode: SidecarMode) => notConnected()
export const rescanFinals = (_eventId: number) => notConnected()
export const pickFolder = () => notConnected()

// Sample-data stand-in for the export job's SSE progress: counts up without touching disk.
// Returns a cancel function.
export function runExport(total: number, onProgress: (done: number) => void): () => void {
  let done = 0
  const step = Math.max(1, Math.ceil(total / 40))
  const timer = setInterval(() => {
    done = Math.min(total, done + step)
    onProgress(done)
    if (done >= total) clearInterval(timer)
  }, 80)
  return () => clearInterval(timer)
}
