import type { FinalsResult, Media } from '../api/client'

// full = the large preview, name = the file's name and path = where it is, for the photo viewer (media only).
// video = where a clip plays from. moment, placed (put there by hand) and favorite are what the viewer changes.
export type Thumb = {
  id: string
  src?: string
  tone: number
  full?: string
  name?: string
  path?: string
  video?: string
  moment?: string
  placed?: boolean
  favorite?: boolean
}

export type FinalsView = {
  // only known after a scan in this session; the engine doesn't store it
  folder?: string
  selects: number
  finals: number
  matchedTotal: number
  unedited: { file: string; rating: number; moment: string; thumb: Thumb }[]
  unmatched: { file: string; note: string }[]
  // score: image similarity between the final and its RAW, 0–1
  matched: { final: string; raw: string; moment: string; score: number }[]
}

export function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

// The engine's finals result joined with the event's media; undefined until a folder was scanned
// (a scan this session, or stored finals from an earlier one).
export function finalsView(
  folder: string | undefined,
  result: FinalsResult,
  media: Media[],
  thumb: (m: Media) => Thumb,
): FinalsView | undefined {
  if (folder === undefined && result.matched.length + result.unmatched_finals.length === 0) return undefined
  const byId = new Map(media.map((m) => [m.id, m]))
  const edited = new Set(result.matched.map((f) => f.media_id))
  return {
    folder,
    selects: edited.size + result.unedited_selects.length,
    finals: result.matched.length + result.unmatched_finals.length,
    matchedTotal: result.matched.length,
    matched: result.matched.map((f) => {
      const raw = byId.get(f.media_id)
      return { final: basename(f.final_path), raw: raw ? basename(raw.path) : '—', moment: raw?.moment ?? '', score: f.score }
    }),
    unmatched: result.unmatched_finals.map((p) => ({ file: basename(p), note: 'No select looked close enough.' })),
    unedited: result.unedited_selects.flatMap((id) => {
      const m = byId.get(id)
      return m ? [{ file: basename(m.path), rating: m.rating ?? 0, moment: m.moment, thumb: thumb(m) }] : []
    }),
  }
}
