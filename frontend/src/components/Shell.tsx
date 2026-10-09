import { useEffect, type ReactNode } from 'react'
import { Link, matchPath, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useEvents, useFinals, useStatus, missedMoments, type EventView } from '../api/data'
import { useMode } from '../lib/mode'
import { useProfiles } from '../lib/profile'
import { backLink } from '../lib/styles'
import { term, type Mode } from '../lib/terms'
import { Avatar, ModeToggle, Owl, ThemeToggle } from './ui'

type IconName = 'grid' | 'list' | 'search' | 'folder' | 'check' | 'gear' | 'owl'

const ICONS: Record<Exclude<IconName, 'owl'>, string> = {
  grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-5-5',
  folder: 'M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z',
  check: 'M5 12l5 5L20 7',
  gear: 'M12 9a3 3 0 100 6 3 3 0 000-6zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2',
}

function Icon({ name }: { name: IconName }) {
  if (name === 'owl') return <Owl className="h-[18px] w-[18px]" />
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  )
}

// The event the sidebar's event-level links point at: the one on screen, else the last one opened.
let lastEventId: number | null = null

function useCurrentEvent(events: EventView[]): EventView | undefined {
  const { pathname } = useLocation()
  const routeId = Number(matchPath('/events/:eventId/*', pathname)?.params.eventId)
  const onScreen = events.find((e) => e.id === routeId)
  useEffect(() => {
    if (onScreen) lastEventId = onScreen.id
  }, [onScreen])
  return onScreen ?? events.find((e) => e.id === lastEventId) ?? events[0]
}

type NavItem = { to: string; label: string; icon: IconName; end?: boolean; badge?: ReactNode }

function navItems(mode: Mode, events: EventView[], current: EventView | undefined, unedited: number): NavItem[] {
  // with no event yet, the links into one are left out: they would all point at the list and light up together
  return allNavItems(mode, events, current, unedited).filter((item) => current || !item.to.startsWith('/events/'))
}

function allNavItems(mode: Mode, events: EventView[], current: EventView | undefined, unedited: number): NavItem[] {
  const at = (suffix = '') => `/events/${current?.id}${suffix}`
  if (mode === 'pro') {
    return [
      { to: '/', label: term('events', mode), icon: 'grid', end: true, badge: events.length },
      { to: at(), label: 'Shot list', icon: 'list', end: true },
      { to: at('/finals'), label: 'Selects vs finals', icon: 'check', badge: unedited > 0 ? unedited : undefined },
      { to: at('/export'), label: term('export', mode), icon: 'folder' },
      { to: '/owl', label: term('owl', mode), icon: 'owl', badge: 'AI' },
      { to: '/settings', label: 'Settings', icon: 'gear' },
    ]
  }
  return [
    { to: '/', label: term('events', mode), icon: 'grid', end: true, badge: events.length },
    { to: at(), label: 'Moments', icon: 'list', end: true },
    { to: '/search', label: 'Search', icon: 'search' },
    { to: at('/export'), label: term('export', mode), icon: 'folder' },
    { to: '/owl', label: term('owl', mode), icon: 'owl', badge: 'AI' },
    { to: '/settings', label: 'Settings', icon: 'gear' },
  ]
}

const SHORT_DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })

// What a row of the short list says next to the name: what is still missing in Events, the date or stage in the
// Tracker. It follows the window, so a gig listed in Events reads like every other event there.
function recentLabel(event: EventView, mode: Mode): string | undefined {
  if (mode === 'personal') {
    const missed = missedMoments(event).length
    return missed > 0 ? `${missed} suggested` : undefined
  }
  if (event.status === 'booked' || event.status === 'inquiry') {
    return event.date ? SHORT_DATE.format(new Date(`${event.date}T00:00:00`)) : undefined
  }
  return event.status ? event.status[0].toUpperCase() + event.status.slice(1) : undefined
}

function OwlStatus() {
  const { active } = useProfiles()
  const prefs = active?.prefs
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-3 text-xs">
      <p className="flex items-center gap-2 font-display text-sm font-semibold">
        <span className={`h-2 w-2 rounded-full ${prefs?.owlEnabled ? 'bg-neutral-950' : 'border border-neutral-500'}`} />
        {prefs?.owlEnabled ? 'Ollama, local only' : 'Ask KuhaGo is off'}
      </p>
      {prefs?.owlEnabled && <p className="mt-1.5 break-all font-mono text-neutral-600">{prefs.model}</p>}
      <p className="mt-1.5 text-neutral-600">Offline · nothing leaves your laptop</p>
    </div>
  )
}

function Sidebar({ mode }: { mode: Mode }) {
  const { active, logout } = useProfiles()
  const events = useEvents(mode)
  const current = useCurrentEvent(events)
  const unedited = useFinals(current?.id ?? -1)?.unedited.length ?? 0
  const items = navItems(mode, events, current, unedited)
  const recent = events.slice(0, 3)

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-4 border-r border-neutral-200 bg-neutral-100 p-3 lg:flex">
      <div className="flex items-center justify-between gap-2 px-2 pt-2">
        <Link to="/" className="flex items-center gap-2.5">
          <Owl className="h-8 w-8" />
          <span className="font-display text-xl font-bold tracking-tight">KuhaGo</span>
        </Link>
        <ThemeToggle />
      </div>
      <ModeToggle />
      {/* Only this middle part scrolls, with no scrollbar: the logo, the window switch and the profile stay put,
          and the sidebar is the same width in both windows however long the list below gets. */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto [scrollbar-width:none]">
        <nav aria-label="Main" className="space-y-1">
          {items.map((item) => (
            <NavLink
              key={item.label}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 font-display text-sm font-medium ${
                  isActive ? 'bg-neutral-950 text-white' : 'text-neutral-950 hover:bg-neutral-200'
                }`
              }
            >
              <Icon name={item.icon} />
              <span className="flex-1">{item.label}</span>
              {item.badge !== undefined && <span className="text-xs opacity-60">{item.badge}</span>}
            </NavLink>
          ))}
        </nav>
        {recent.length > 0 && (
          <div>
            <p className="px-3 text-xs font-medium uppercase tracking-wide text-neutral-600">
              {mode === 'pro' ? 'Active gigs' : 'Recent events'}
            </p>
            <ul className="mt-2 space-y-0.5">
              {recent.map((event) => (
                <li key={event.id}>
                  <Link to={`/events/${event.id}`} className="flex items-baseline justify-between gap-2 rounded-lg px-3 py-1.5 text-sm hover:bg-neutral-200">
                    <span className="truncate">{event.name}</span>
                    <span className="shrink-0 text-xs text-neutral-600">{recentLabel(event, mode)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="shrink-0 space-y-3">
        {active && (
          <button type="button" onClick={logout} className="flex w-full items-center gap-3 rounded-xl px-2 py-1 text-left hover:bg-neutral-200">
            <Avatar name={active.name} />
            <span>
              <span className="block font-display text-sm font-semibold">{active.name}</span>
              <span className="block text-xs text-neutral-600">Switch profile</span>
            </span>
          </button>
        )}
        <OwlStatus />
      </div>
    </aside>
  )
}

// On small screens the sidebar collapses into a scrolling row of the same links.
function MobileNav({ mode }: { mode: Mode }) {
  const events = useEvents(mode)
  const current = useCurrentEvent(events)
  const items = navItems(mode, events, current, 0)
  return (
    <header className="border-b border-neutral-200 bg-neutral-100 px-4 py-3 lg:hidden">
      <div className="flex items-center justify-between gap-3">
        <Link to="/" className="flex items-center gap-2">
          <Owl className="h-6 w-6" />
          <span className="font-display text-lg font-bold">KuhaGo</span>
        </Link>
        <div className="flex items-center gap-2">
          <ModeToggle />
          <ThemeToggle />
        </div>
      </div>
      <nav aria-label="Main" className="-mx-1 mt-3 flex gap-1 overflow-x-auto">
        {items.map((item) => (
          <NavLink
            key={item.label}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${isActive ? 'bg-neutral-950 text-white' : 'hover:bg-neutral-200'}`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </header>
  )
}

type PageProps = {
  // kept for call sites; the sidebar already shows the mode
  pro?: boolean
  center?: ReactNode
  right?: ReactNode
  width?: string
  children: ReactNode
}

export function Page({ center, right, width = 'max-w-6xl', children }: PageProps) {
  const { mode } = useMode()
  const { error } = useStatus()
  return (
    <div className="flex min-h-screen">
      <Sidebar mode={mode ?? 'personal'} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav mode={mode ?? 'personal'} />
        {(center || right) && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-neutral-200 px-4 py-3 sm:px-8">
            <div className="w-full sm:w-auto sm:flex-1">{center}</div>
            <div className="ml-auto flex items-center gap-3 text-sm text-neutral-600">{right}</div>
          </div>
        )}
        <main className={`mx-auto w-full flex-1 px-4 py-8 sm:px-8 ${width}`}>{children}</main>
        <footer className="px-4 py-4 text-center text-xs text-neutral-500 sm:px-8">
          {error ?? 'Everything stays on this laptop. Your originals are never moved or changed.'}
        </footer>
      </div>
    </div>
  )
}

// Header-only layout for the screens before a mode is in play (the mode pick).
export function BarePage({ right, width = 'max-w-4xl', children }: { right?: ReactNode; width?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-neutral-200 px-4 py-4 sm:px-8">
        <Link to="/" className="flex items-center gap-2.5">
          <Owl />
          <span className="font-display text-xl font-bold tracking-tight">KuhaGo</span>
        </Link>
        <div className="flex items-center gap-4 text-sm text-neutral-600">
          {right}
          <ThemeToggle />
        </div>
      </header>
      <main className={`mx-auto w-full flex-1 px-4 py-10 sm:px-8 ${width}`}>{children}</main>
    </div>
  )
}

export function NotFound() {
  const navigate = useNavigate()
  return (
    <Page>
      <h1 className="text-2xl font-bold">Not found</h1>
      <button type="button" onClick={() => navigate('/')} className={`${backLink} mt-2 underline`}>
        Back to the list
      </button>
    </Page>
  )
}
