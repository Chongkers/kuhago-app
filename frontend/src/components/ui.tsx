import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Thumb as ThumbData } from '../api/data'
import logo from '../assets/logo.png'
import { useMode } from '../lib/mode'
import { initials, isDark, useProfiles } from '../lib/profile'
import { btnPrimary, btnSecondary } from '../lib/styles'
import { term, type Mode } from '../lib/terms'

// The logo. It is a picture with its own greys, so it looks the same in both themes.
export function Owl({ className = 'h-7 w-7' }: { className?: string }) {
  return <img src={logo} alt="" aria-hidden="true" className={`shrink-0 ${className}`} />
}

// One click between light and dark. "Match system" is still in Settings; this picks one for good.
export function ThemeToggle() {
  const { active, updatePrefs } = useProfiles()
  if (!active) return null
  const dark = isDark(active.prefs.theme)
  const label = dark ? 'Switch to light mode' : 'Switch to dark mode'
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => updatePrefs({ theme: dark ? 'light' : 'dark' })}
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-neutral-400 hover:border-neutral-950"
    >
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {dark ? (
          <path d="M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
        ) : (
          <path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z" />
        )}
      </svg>
    </button>
  )
}

// A window over the page for one short task. Esc, the X and a click outside all close it.
// The backdrop colour is literal: black is flipped to white in the dark theme.
export function Modal({ title, wide = false, onClose, children }: { title: string; wide?: boolean; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onMouseDown={(e) => e.target === ref.current && onClose()}
      className={`m-auto max-h-[calc(100vh-2rem)] ${wide ? 'w-[min(64rem,calc(100vw-2rem))]' : 'w-[min(38rem,calc(100vw-2rem))]'} max-w-none overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-0 text-neutral-950 shadow-xl backdrop:bg-[#0a0a0a]/60`}
    >
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-xl text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950">
            ×
          </button>
        </div>
        {children}
      </div>
    </dialog>
  )
}

// "Are you sure?" as one of the app's own windows, not the browser's pop-up. children say what will happen.
// The action runs on the confirm button; the window closes when it is done, and stays with the reason if it fails.
export function Confirm({
  title,
  confirmLabel,
  onConfirm,
  onClose,
  children,
}: {
  title: string
  confirmLabel: string
  onConfirm: () => Promise<unknown>
  onClose: () => void
  children: ReactNode
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function confirm() {
    setBusy(true)
    setError(null)
    onConfirm().then(onClose, (e: Error) => {
      setError(e.message)
      setBusy(false)
    })
  }

  return (
    <Modal title={title} onClose={onClose}>
      <div className="mt-2 space-y-2 text-sm text-neutral-600">{children}</div>
      <Notice>{error}</Notice>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" autoFocus onClick={onClose} className={btnSecondary}>
          Cancel
        </button>
        <button type="button" disabled={busy} onClick={confirm} className={btnPrimary}>
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Modal>
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

// An example photo with a small x to take it off its moment.
export function RemovableThumb({ thumb, label, disabled, onRemove }: { thumb: ThumbData; label: string; disabled?: boolean; onRemove: () => void }) {
  return (
    <div className="relative">
      <Thumb thumb={thumb} className="aspect-square w-full rounded-md" />
      <button
        type="button"
        aria-label={label}
        title={label}
        disabled={disabled}
        onClick={onRemove}
        className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full border border-neutral-400 bg-white text-xs leading-none hover:border-neutral-950 disabled:opacity-50"
      >
        ×
      </button>
    </div>
  )
}

// A button-looking label around a hidden image file input; the input keeps keyboard focus.
export function ImagePicker({
  className = '',
  onFiles,
  children,
}: {
  className?: string
  onFiles: (files: File[]) => void
  children: ReactNode
}) {
  return (
    <label className={`cursor-pointer focus-within:ring-2 focus-within:ring-neutral-950 ${className}`}>
      {children}
      <input
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])]
          e.target.value = '' // picking the same files again still fires
          if (files.length > 0) onFiles(files)
        }}
      />
    </label>
  )
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
    { mode: 'personal', label: term('window', 'personal') },
    { mode: 'pro', label: term('window', 'pro') },
  ]

  return (
    <div className="flex rounded-full border border-neutral-400 bg-neutral-100 p-1" role="group" aria-label="Window">
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

export function Avatar({ name, className = 'h-9 w-9 text-sm' }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full bg-neutral-950 font-display font-bold text-white ${className}`}
    >
      {initials(name)}
    </span>
  )
}
