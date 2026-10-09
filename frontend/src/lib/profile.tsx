// Local profiles (wireframe: "Who's organizing?"). Stored in this browser only: no account,
// no network. A profile owns its mode and its preferences; the PIN is a salted SHA-256 hash.
// This keeps family members out of a pro's screens; it is not encryption of the library.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Mode } from './terms'

export type Theme = 'light' | 'dark' | 'system'
// auto = the language the question was asked in
export type ReplyLanguage = 'auto' | 'english' | 'filipino' | 'taglish'

// Only what something reads. A setting the engine has nothing behind is not kept here (or shown in Settings).
export type Prefs = {
  owlEnabled: boolean
  ollamaUrl: string
  model: string
  replyLanguage: ReplyLanguage
  libraryFolder: string
  theme: Theme
  reduceMotion: boolean
}

export type Profile = {
  id: string
  name: string
  mode: Mode
  pin?: { salt: string; hash: string }
  // hash of the one-time recovery code, for resetting a forgotten PIN
  recovery?: { salt: string; hash: string }
  // events this profile created; events nobody owns belong to the first profile
  eventIds?: number[]
  prefs: Prefs
}

export const DEFAULT_PREFS: Prefs = {
  owlEnabled: true,
  ollamaUrl: 'http://localhost:11434',
  model: 'llama3.2:3b',
  replyLanguage: 'auto',
  libraryFolder: '',
  theme: 'system',
  reduceMotion: false,
}

const PROFILES_KEY = 'kuha.profiles'
const ACTIVE_KEY = 'kuha.activeProfile'

function readProfiles(): Profile[] {
  try {
    const list = JSON.parse(localStorage.getItem(PROFILES_KEY) ?? '[]') as Profile[]
    return list.map((p) => ({ ...p, prefs: { ...DEFAULT_PREFS, ...p.prefs } }))
  } catch {
    return []
  }
}

// "Keep me logged in" keeps the active profile in localStorage; otherwise only for this tab.
function readActive(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY) ?? sessionStorage.getItem(ACTIVE_KEY)
  } catch {
    return null
  }
}

function writeActive(id: string | null, keep: boolean) {
  try {
    localStorage.removeItem(ACTIVE_KEY)
    sessionStorage.removeItem(ACTIVE_KEY)
    if (id) (keep ? localStorage : sessionStorage).setItem(ACTIVE_KEY, id)
  } catch {
    // storage unavailable: the login lasts until reload
  }
}

// 12 unambiguous characters in groups of four, e.g. K7QM-2XNP-9RTA.
function makeRecoveryCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length])
  return [0, 4, 8].map((i) => chars.slice(i, i + 4).join('')).join('-')
}

const normalizeCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '')

async function hashPin(pin: string, salt: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${salt}:${pin}`)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

// "system" follows the OS.
export function isDark(theme: Theme): boolean {
  return theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
}

export function initials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
  return (letters.slice(0, 2) || '?').toUpperCase()
}

type ProfileContextValue = {
  profiles: Profile[]
  active: Profile | null
  login: (id: string, pin: string, keep: boolean) => Promise<boolean>
  logout: () => void
  // creates the profile without logging in; returns its one-time recovery code
  create: (input: { name: string; pin: string; mode: Mode; libraryFolder: string }) => Promise<{ id: string; code: string }>
  // log in without a PIN (right after creating a profile)
  enter: (id: string, keep: boolean) => void
  resetPin: (id: string, code: string, newPin: string) => Promise<boolean>
  newRecoveryCode: () => Promise<string>
  claimEvent: (eventId: number) => void
  // after an event is deleted: its id is free for the next event, whoever makes it
  releaseEvent: (eventId: number) => void
  ownsEvent: (eventId: number) => boolean
  update: (patch: Partial<Pick<Profile, 'name' | 'mode'>>) => void
  updatePrefs: (patch: Partial<Prefs>) => void
  changePin: (pin: string) => Promise<void>
  remove: () => void
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profiles, setProfiles] = useState<Profile[]>(readProfiles)
  const [activeId, setActiveId] = useState<string | null>(readActive)
  const active = profiles.find((p) => p.id === activeId) ?? null
  const prefs = active?.prefs

  function save(next: Profile[]) {
    setProfiles(next)
    try {
      localStorage.setItem(PROFILES_KEY, JSON.stringify(next))
    } catch {
      // storage unavailable: profiles last until reload
    }
  }

  function patchActive(patch: (p: Profile) => Profile) {
    save(profiles.map((p) => (p.id === activeId ? patch(p) : p)))
  }

  async function makePin(pin: string): Promise<Profile['pin']> {
    if (!pin) return undefined
    const salt = crypto.randomUUID()
    return { salt, hash: await hashPin(pin, salt) }
  }

  const value: ProfileContextValue = {
    profiles,
    active,
    async login(id, pin, keep) {
      const profile = profiles.find((p) => p.id === id)
      if (!profile) return false
      if (profile.pin && (await hashPin(pin, profile.pin.salt)) !== profile.pin.hash) return false
      writeActive(id, keep)
      setActiveId(id)
      return true
    },
    logout() {
      writeActive(null, false)
      setActiveId(null)
    },
    async create({ name, pin, mode, libraryFolder }) {
      const code = makeRecoveryCode()
      const profile: Profile = {
        id: crypto.randomUUID(),
        name: name.trim(),
        mode,
        pin: await makePin(pin),
        recovery: await makePin(normalizeCode(code)),
        eventIds: [],
        prefs: { ...DEFAULT_PREFS, libraryFolder },
      }
      save([...profiles, profile])
      return { id: profile.id, code }
    },
    enter(id, keep) {
      writeActive(id, keep)
      setActiveId(id)
    },
    async resetPin(id, code, newPin) {
      const profile = profiles.find((p) => p.id === id)
      if (!profile?.recovery) return false
      if ((await hashPin(normalizeCode(code), profile.recovery.salt)) !== profile.recovery.hash) return false
      const pin = await makePin(newPin)
      save(profiles.map((p) => (p.id === id ? { ...p, pin } : p)))
      writeActive(id, true)
      setActiveId(id)
      return true
    },
    async newRecoveryCode() {
      const code = makeRecoveryCode()
      const recovery = await makePin(normalizeCode(code))
      patchActive((p) => ({ ...p, recovery }))
      return code
    },
    claimEvent: (eventId) =>
      patchActive((p) => ({ ...p, eventIds: [...new Set([...(p.eventIds ?? []), eventId])] })),
    releaseEvent: (eventId) =>
      save(profiles.map((p) => (p.eventIds?.includes(eventId) ? { ...p, eventIds: p.eventIds.filter((id) => id !== eventId) } : p))),
    ownsEvent(eventId) {
      const owner = profiles.find((p) => p.eventIds?.includes(eventId)) ?? profiles[0]
      return !!owner && owner.id === activeId
    },
    update: (patch) => patchActive((p) => ({ ...p, ...patch })),
    updatePrefs: (patch) => patchActive((p) => ({ ...p, prefs: { ...p.prefs, ...patch } })),
    async changePin(pin) {
      const next = await makePin(pin)
      patchActive((p) => ({ ...p, pin: next }))
    },
    remove() {
      save(profiles.filter((p) => p.id !== activeId))
      writeActive(null, false)
      setActiveId(null)
    },
  }

  // Appearance applies to the whole document. "system" follows the OS and keeps following it.
  const theme = prefs?.theme ?? 'system'
  const reduceMotion = prefs?.reduceMotion ?? false
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      document.documentElement.dataset.theme = isDark(theme) ? 'dark' : 'light'
    }
    apply()
    query.addEventListener('change', apply)
    return () => query.removeEventListener('change', apply)
  }, [theme])
  useEffect(() => {
    document.documentElement.dataset.motion = reduceMotion ? 'reduce' : 'full'
  }, [reduceMotion])

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export function useProfiles(): ProfileContextValue {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useProfiles must be used inside ProfileProvider')
  return ctx
}

export function usePrefs(): Prefs {
  return useProfiles().active?.prefs ?? DEFAULT_PREFS
}
