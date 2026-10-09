// Single source of mode-aware terminology (AGENTS.md §3).
// Personal mode uses plain language; never show Pro jargon there.

export type Mode = 'personal' | 'pro'

export type TermKey =
  | 'event'
  | 'events'
  | 'shotItems'
  | 'refs'
  | 'rollA'
  | 'rollB'
  | 'selects'
  | 'coverage'
  | 'export'

const TERMS: Record<TermKey, Record<Mode, string>> = {
  event: { personal: 'Event', pro: 'Gig' },
  events: { personal: 'Events', pro: 'Gigs' },
  shotItems: { personal: 'Moments checklist', pro: 'Shot list' },
  refs: { personal: 'Example photos', pro: 'References' },
  rollA: { personal: 'Talking clips', pro: 'A-roll' },
  rollB: { personal: 'Scenery clips', pro: 'B-roll' },
  selects: { personal: 'Favorites', pro: 'Selects' },
  coverage: { personal: 'Missed moments', pro: 'Coverage' },
  export: { personal: 'Export folders', pro: 'Archive' },
}

export function term(key: TermKey, mode: Mode): string {
  return TERMS[key][mode]
}

export function rollLabel(roll: 'A' | 'B', mode: Mode): string {
  return term(roll === 'A' ? 'rollA' : 'rollB', mode)
}

// Fields and panels hidden in Personal mode: fee, paid, client, XMP, finals, RAW settings.
export function isPro(mode: Mode): boolean {
  return mode === 'pro'
}
