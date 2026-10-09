import { useState, type FormEvent, type ReactNode } from 'react'
import { clearOwlHistory, clearPreviewCache, moveLibrary, setSidecarMode, testOllama, useSidecarMode } from '../api/data'
import { SIDECAR_OPTIONS } from '../components/ProGig'
import { Page } from '../components/Shell'
import { Avatar, Badge, ModeToggle, Notice } from '../components/ui'
import { useMode } from '../lib/mode'
import { useProfiles, type ReplyLanguage, type Theme } from '../lib/profile'
import { btnPrimary, btnSecondary, card, input, panel } from '../lib/styles'
import { useAction } from '../lib/useAction'

function Section({ id, title, badge, tone = 'card', children }: { id: string; title: string; badge?: string; tone?: 'card' | 'panel'; children: ReactNode }) {
  return (
    <section id={id} className={`${tone === 'card' ? card : panel} scroll-mt-6 p-5`}>
      <h2 className="flex items-center gap-2 text-xl font-bold">
        {title}
        {badge && <Badge variant="outline">{badge}</Badge>}
      </h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block font-display text-sm font-semibold">
      {label}
      <span className="mt-1.5 block font-sans font-normal">{children}</span>
    </label>
  )
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="inline-flex rounded-full border border-neutral-400 bg-neutral-100 p-1" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-full px-4 py-1.5 font-display text-sm font-semibold ${value === o.value ? 'bg-neutral-950 text-white' : 'text-neutral-600 hover:text-neutral-950'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function ChangePin() {
  const { active, changePin } = useProfiles()
  const [open, setOpen] = useState(false)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (pin && !/^\d{4,6}$/.test(pin)) return setError('A PIN is 4 to 6 digits, or leave it empty to remove it.')
    await changePin(pin)
    setPin('')
    setError(null)
    setOpen(false)
  }

  if (!open)
    return (
      <button type="button" className={btnSecondary} onClick={() => setOpen(true)}>
        {active?.pin ? 'Change PIN' : 'Set a PIN'}
      </button>
    )
  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <input type="password" inputMode="numeric" autoFocus value={pin} onChange={(e) => setPin(e.target.value)} placeholder="New PIN, 4-6 digits" aria-label="New PIN" className={`${input} w-52 font-mono`} />
      <button type="submit" className={btnPrimary}>
        Save PIN
      </button>
      {error && <p className="w-full text-sm">{error}</p>}
    </form>
  )
}

function RecoveryCode() {
  const { newRecoveryCode } = useProfiles()
  const [code, setCode] = useState<string | null>(null)
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" className={btnSecondary} onClick={async () => setCode(await newRecoveryCode())}>
        New recovery code
      </button>
      {code && (
        <span className="text-sm">
          <span className="font-mono text-base tracking-widest">{code}</span> · shown once, the old code no longer works.
        </span>
      )}
    </div>
  )
}

const SECTIONS = [
  { id: 'profile', label: 'Profile' },
  { id: 'mode', label: 'Mode' },
  { id: 'owl', label: 'Ask the owl' },
  { id: 'library', label: 'Library & storage' },
  { id: 'pro', label: 'Pro workflow', pro: true },
  { id: 'appearance', label: 'Appearance' },
  { id: 'privacy', label: 'Privacy' },
]

export default function Settings() {
  const { mode } = useMode()
  const { active, updatePrefs, update, logout, remove } = useProfiles()
  const sidecarMode = useSidecarMode()
  const owl = useAction()
  const library = useAction()
  const privacy = useAction()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [libraryDraft, setLibraryDraft] = useState<string | null>(null)
  if (!active) return null
  const { prefs } = active
  const pro = mode === 'pro'

  return (
    <Page width="max-w-3xl">
      <h1 className="text-4xl font-bold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-neutral-600">Saved on this laptop for {active.name}'s profile.</p>

      <nav aria-label="Settings sections" className="mt-5 flex flex-wrap gap-2">
        {SECTIONS.filter((s) => !s.pro || pro).map((s) => (
          <a key={s.id} href={`#${s.id}`} className="rounded-full border border-neutral-400 px-3 py-1 text-sm hover:border-neutral-950">
            {s.label}
          </a>
        ))}
      </nav>

      <div className="mt-6 space-y-5">
        <Section id="profile" title="Profile">
          <div className="flex flex-wrap items-start gap-4">
            <Avatar name={active.name} className="h-16 w-16 text-xl" />
            <div className="grid min-w-64 flex-1 gap-4 sm:grid-cols-2">
              <Field label="Name">
                <input value={active.name} onChange={(e) => update({ name: e.target.value })} className={input} />
              </Field>
              {pro && (
                <Field label="Studio name (Pro)">
                  <input value={prefs.studio} onChange={(e) => updatePrefs({ studio: e.target.value })} placeholder="Your studio" className={input} />
                </Field>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ChangePin />
            <RecoveryCode />
            <button type="button" className={btnSecondary} onClick={logout}>
              Switch profile
            </button>
            <button type="button" className="text-sm font-medium underline" onClick={logout}>
              Log out
            </button>
          </div>
        </Section>

        <Section id="mode" title="Mode">
          <ModeToggle />
          <p className="text-xs text-neutral-600">New events open in this mode. Each event can still be switched on its own page.</p>
        </Section>

        <Section id="owl" title="Ask the owl">
          <label className="flex items-center justify-between gap-4 text-sm">
            Turn on the assistant
            <input type="checkbox" className="h-5 w-5 accent-neutral-950" checked={prefs.owlEnabled} onChange={(e) => updatePrefs({ owlEnabled: e.target.checked })} />
          </label>
          <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
            <Field label="Ollama address">
              <input value={prefs.ollamaUrl} onChange={(e) => updatePrefs({ ollamaUrl: e.target.value })} className={`${input} font-mono`} />
            </Field>
            <Field label="Model">
              <input value={prefs.model} onChange={(e) => updatePrefs({ model: e.target.value })} className={`${input} font-mono`} />
            </Field>
          </div>
          <div>
            <button type="button" className={btnSecondary} onClick={() => owl.run(() => testOllama(prefs.ollamaUrl))}>
              Test connection
            </button>
            <Notice>{owl.error}</Notice>
          </div>
          <fieldset>
            <legend className="font-display text-sm font-semibold">Reply language</legend>
            <div className="mt-2 space-y-1.5">
              {([['taglish', 'Taglish'], ['english', 'English'], ['filipino', 'Filipino']] as [ReplyLanguage, string][]).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 text-sm">
                  <input type="radio" name="language" className="accent-neutral-950" checked={prefs.language === value} onChange={() => updatePrefs({ language: value })} />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex items-center justify-between gap-4 text-sm">
            <span>
              Always ask before copying files
              <span className="block text-xs text-neutral-600">Can't be turned off — the owl never moves, renames or deletes.</span>
            </span>
            <input type="checkbox" className="h-5 w-5 accent-neutral-950" checked disabled readOnly />
          </label>
        </Section>

        <Section id="library" title="Library & storage">
          <Field label="Library folder">
            <span className="flex gap-2">
              <input value={libraryDraft ?? prefs.libraryFolder} onChange={(e) => setLibraryDraft(e.target.value)} className={`${input} font-mono`} />
              <button type="button" className={`${btnSecondary} shrink-0`} onClick={() => library.run(() => moveLibrary(libraryDraft ?? prefs.libraryFolder))}>
                Move library
              </button>
            </span>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Processing">
              <select value={prefs.processing} onChange={(e) => updatePrefs({ processing: e.target.value as 'auto' | 'cpu' })} className={input}>
                <option value="auto">Automatic (GPU if available)</option>
                <option value="cpu">CPU only</option>
              </select>
            </Field>
            <Field label="Highlights per moment">
              <input type="number" min={1} max={20} value={prefs.highlightsPerMoment} onChange={(e) => updatePrefs({ highlightsPerMoment: Math.max(1, Number(e.target.value) || 1) })} className={input} />
            </Field>
          </div>
          <div>
            <button type="button" className={btnSecondary} onClick={() => library.run(clearPreviewCache)}>
              Clear preview cache
            </button>
            <Notice>{library.error}</Notice>
          </div>
        </Section>

        {pro && (
          <Section id="pro" title="Pro workflow" badge="PRO">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Sidecar mode">
                <select value={sidecarMode} onChange={(e) => setSidecarMode(e.target.value as typeof sidecarMode)} className={input}>
                  {SIDECAR_OPTIONS.map((o) => (
                    <option key={o.mode} value={o.mode}>
                      {o.label} ({o.example})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Selects start at">
                <select value={prefs.selectMinRating} onChange={(e) => updatePrefs({ selectMinRating: Number(e.target.value) })} className={input}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? 'star' : 'stars'}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Archive folder name">
              <input value={prefs.archiveName} onChange={(e) => updatePrefs({ archiveName: e.target.value })} className={`${input} font-mono`} />
            </Field>
          </Section>
        )}

        <Section id="appearance" title="Appearance">
          <Segmented<Theme>
            label="Theme"
            value={prefs.theme}
            onChange={(theme) => updatePrefs({ theme })}
            options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'Match system' }]}
          />
          <label className="flex items-center justify-between gap-4 text-sm">
            Reduce motion
            <input type="checkbox" className="h-5 w-5 accent-neutral-950" checked={prefs.reduceMotion} onChange={(e) => updatePrefs({ reduceMotion: e.target.checked })} />
          </label>
        </Section>

        <Section id="privacy" title="Privacy" tone="panel">
          <p className="text-sm text-neutral-600">KuhaGo works fully offline. Photos, profiles and AI chats never leave this laptop.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnSecondary} onClick={() => privacy.run(clearOwlHistory)}>
              Clear owl chat history
            </button>
            {confirmDelete ? (
              <>
                <button type="button" className={btnPrimary} onClick={remove}>
                  Yes, delete this profile
                </button>
                <button type="button" className={btnSecondary} onClick={() => setConfirmDelete(false)}>
                  Cancel
                </button>
              </>
            ) : (
              <button type="button" className={btnSecondary} onClick={() => setConfirmDelete(true)}>
                Delete this profile…
              </button>
            )}
          </div>
          <Notice>{privacy.error}</Notice>
          <p className="text-xs text-neutral-600">Deleting a profile removes its settings from this laptop. Your original photos are never touched.</p>
        </Section>
      </div>
    </Page>
  )
}
