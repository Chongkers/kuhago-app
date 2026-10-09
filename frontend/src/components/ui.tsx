import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useStatus, type Thumb as ThumbData } from '../api/data'
import { useMode } from '../lib/mode'
import type { Mode } from '../lib/terms'

export function Owl({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path d="M6 3l10 7h16l10-7v27c0 9-8 15-18 15S6 39 6 30z" fill="currentColor" />
      <circle cx="16.5" cy="22" r="7" fill="#fff" />
      <circle cx="31.5" cy="22" r="7" fill="#fff" />
      <circle cx="17.5" cy="22" r="3.6" fill="currentColor" />
      <circle cx="30.5" cy="22" r="3.6" fill="currentColor" />
      <circle cx="18.8" cy="20.6" r="1.1" fill="#fff" />
      <circle cx="31.8" cy="20.6" r="1.1" fill="#fff" />
      <path d="M21.5 29.5l2.5 4.5 2.5-4.5z" fill="#fff" />
      <path
        d="M17 37.5l2.5 2.5 2.5-2.5m4 0l2.5 2.5 2.5-2.5"
        fill="none"
        stroke="#fff"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

type PageProps = {
  pro?: boolean
  center?: ReactNode
  right?: ReactNode
  width?: string
  children: ReactNode
}

export function Page({ pro, center, right, width = 'max-w-6xl', children }: PageProps) {
  const { error } = useStatus()
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-neutral-200 bg-white">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4 sm:px-8">
          <Link to="/" className="flex items-center gap-2.5">
            <Owl />
            <span className="font-display text-xl font-bold tracking-tight">KuhaGo</span>
            {pro && <Badge variant="outline">PRO</Badge>}
          </Link>
          <div className="order-last w-full sm:order-none sm:w-auto sm:flex-1">{center}</div>
          <div className="ml-auto flex items-center gap-3 text-sm text-neutral-600">{right}</div>
        </div>
      </header>
      <main className={`mx-auto w-full flex-1 px-4 py-10 sm:px-8 ${width}`}>{children}</main>
      <footer className="px-4 py-4 text-center text-xs text-neutral-500 sm:px-8">
        {error ?? 'Everything stays on this laptop. Your originals are never moved or changed.'}
      </footer>
    </div>
  )
}

export function Badge({ variant = 'solid', children }: { variant?: 'solid' | 'outline'; children: ReactNode }) {
  const look =
    variant === 'solid'
      ? 'bg-neutral-950 font-bold uppercase tracking-wide text-white'
      : 'border border-neutral-400 text-neutral-600'
  return (
    <span className={`inline-block shrink-0 whitespace-nowrap rounded-md px-2 py-0.5 text-xs ${look}`}>
      {children}
    </span>
  )
}

// Literal class names so Tailwind picks them up.
const TONES = ['bg-neutral-200', 'bg-neutral-300', 'bg-neutral-300/70', 'bg-neutral-200/70', 'bg-neutral-400/50']

// A media preview; grey placeholder until the backend serves a preview JPEG.
export function Thumb({ thumb, className = '' }: { thumb?: ThumbData; className?: string }) {
  if (thumb?.src) return <img src={thumb.src} alt="" loading="lazy" className={`object-cover ${className}`} />
  return <div className={`${TONES[(thumb?.tone ?? 0) % TONES.length]} ${className}`} />
}

export function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (done / total) * 100) : 0
  return (
    <div
      className="h-1.5 overflow-hidden rounded-full bg-neutral-200"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
    >
      <div className="h-full rounded-full bg-neutral-950 transition-[width]" style={{ width: `${pct}%` }} />
    </div>
  )
}

export function ModeToggle() {
  const { mode, setMode } = useMode()
  const navigate = useNavigate()
  const options: { mode: Mode; label: string }[] = [
    { mode: 'personal', label: 'Personal' },
    { mode: 'pro', label: 'Pro' },
  ]

  return (
    <div className="flex rounded-full border border-neutral-400 bg-neutral-100 p-1" role="group" aria-label="Mode">
      {options.map((option) => (
        <button
          key={option.mode}
          type="button"
          aria-pressed={mode === option.mode}
          onClick={() => {
            setMode(option.mode)
            navigate('/')
          }}
          className={`rounded-full px-4 py-1.5 font-display text-sm font-semibold ${
            mode === option.mode ? 'bg-neutral-950 text-white' : 'text-neutral-600 hover:text-neutral-950'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function Notice({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <p role="status" className="mt-2 text-sm text-neutral-600">
      {children}
    </p>
  )
}

export function NotFound() {
  return (
    <Page>
      <h1 className="text-2xl font-bold">Not found</h1>
      <Link to="/" className="mt-2 inline-block text-sm underline">
        Back to the list
      </Link>
    </Page>
  )
}
