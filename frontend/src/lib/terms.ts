// Single source of mode-aware terminology (AGENTS.md §3).
// Personal mode uses plain language; never show Pro jargon there.

export type Mode = 'personal' | 'pro'

export type TermKey =
  | 'window'
  | 'event'
  | 'events'
  | 'eventsTitle'
  | 'newEvent'
  | 'moment'
  | 'frame'
  | 'shotItems'
  | 'refs'
  | 'rollA'
  | 'rollB'
  | 'clips'
  | 'selects'
  | 'coverage'
  | 'checklistTitle'
  | 'export'
  | 'overview'
  | 'finals'
  | 'settings'
  | 'owl'

const TERMS: Record<TermKey, Record<Mode, string>> = {
  // what the user calls each mode: the two windows of the app
  window: { personal: 'Events', pro: 'Tracker' },
  event: { personal: 'Event', pro: 'Gig' },
  events: { personal: 'Events', pro: 'Gigs' },
  eventsTitle: { personal: 'Your events', pro: 'Tracker' },
  newEvent: { personal: 'New event', pro: 'New gig' },
  moment: { personal: 'moment', pro: 'shot' },
  frame: { personal: 'photo', pro: 'frame' },
  shotItems: { personal: 'Moments checklist', pro: 'Shot list' },
  refs: { personal: 'Example photos', pro: 'References' },
  rollA: { personal: 'Talking clips', pro: 'A-roll' },
  rollB: { personal: 'Scenery clips', pro: 'B-roll' },
  clips: { personal: 'Talking & scenery clips', pro: 'A-roll / B-roll' },
  selects: { personal: 'Favorites', pro: 'Selects' },
  coverage: { personal: 'Missed moments', pro: 'Coverage' },
  // heading of the checklist card; 'coverage' stays the name of the check itself inside sentences
  checklistTitle: { personal: 'Organize photos by theme, subject, etc.', pro: 'Coverage' },
  export: { personal: 'Export folders', pro: 'Archive' },
  overview: { personal: 'Overview', pro: 'Overview' },
  finals: { personal: 'Finals', pro: 'Finals' },
  settings: { personal: 'Settings', pro: 'Settings' },
  owl: { personal: 'Ask KuhaGo', pro: 'Ask KuhaGo' },
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
