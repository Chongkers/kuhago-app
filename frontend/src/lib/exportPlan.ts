import type { EventView, FinalsView } from '../api/data'

export type PlanRow = { depth: number; name: string; count?: string }
export type ExportPlan = { root: string; rows: PlanRow[] }

// Mirrors the backend's Windows-safe folder names (AGENTS.md §6, Agent 9).
export function sanitizeFolder(name: string): string {
  return name.replace(/\s*[<>:"/\\|?*]\s*/g, ' - ').trim()
}

const RAW_PREVIEW_ROWS = 4

export function personalPlan(event: EventView): ExportPlan {
  const covered = event.moments.filter((m) => m.count > 0)
  return {
    root: `${event.date}_${sanitizeFolder(event.name)}/`,
    rows: [
      { depth: 1, name: 'Highlights/', count: `${event.highlightCount} photos` },
      { depth: 1, name: 'Moments/' },
      ...covered.map((m) => ({ depth: 2, name: `${sanitizeFolder(m.moment)}/`, count: String(m.count) })),
      { depth: 1, name: 'Videos/' },
      { depth: 2, name: 'Talking/', count: `${event.clips.A.count} clips` },
      { depth: 2, name: 'Scenery/', count: `${event.clips.B.count} clips` },
      { depth: 1, name: 'Unsorted/', count: String(event.unsorted) },
    ],
  }
}

export function proPlan(event: EventView, finals?: FinalsView): ExportPlan {
  const covered = event.moments.filter((m) => m.count > 0)
  const shown = covered.slice(0, RAW_PREVIEW_ROWS)
  const rest = covered.length - shown.length
  const references = event.moments.reduce((sum, m) => sum + m.refs.length, 0)
  return {
    root: `${event.date}_${sanitizeFolder(event.client ?? 'Client')}_${sanitizeFolder(event.name)}/`,
    rows: [
      { depth: 1, name: '01_RAW/' },
      ...shown.map((m) => ({ depth: 2, name: `${sanitizeFolder(m.moment)}/`, count: String(m.count) })),
      ...(rest > 0 ? [{ depth: 2, name: `…${rest} more shots` }] : []),
      { depth: 1, name: '02_SELECTS/', count: String(finals?.selects ?? 0) },
      { depth: 1, name: '03_FINALS/', count: String(finals?.finals ?? 0) },
      { depth: 1, name: '04_VIDEO/' },
      { depth: 2, name: 'A-ROLL/', count: `${event.clips.A.count} clips` },
      { depth: 2, name: 'B-ROLL/', count: `${event.clips.B.count} clips` },
      { depth: 1, name: '05_REFERENCES/', count: String(references) },
    ],
  }
}
