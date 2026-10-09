import { useState, type FormEvent, type ReactNode } from 'react'
import { Avatar, Owl } from '../components/ui'
import { useProfiles } from '../lib/profile'
import { btnPrimary, input } from '../lib/styles'
import type { Mode } from '../lib/terms'

// Split layout shared by log in and create profile: dark brand panel, form on the right.
function Split({ headline, aside, footer, children }: { headline: ReactNode; aside?: ReactNode; footer: ReactNode; children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <section className="flex flex-col justify-between bg-neutral-950 px-8 py-10 text-white sm:px-14">
        <div className="flex items-center gap-2.5">
          <Owl className="h-8 w-8" />
          <span className="font-display text-xl font-bold">KuhaGo</span>
        </div>
        <div className="py-12">
          {headline}
          {aside}
        </div>
        <p className="text-sm text-neutral-400">{footer}</p>
      </section>
      <section className="flex items-center px-6 py-10 sm:px-14">
        <div className="w-full max-w-xl">{children}</div>
      </section>
    </div>
  )
}

function ForgotPin({ id, name, onBack }: { id: string; name: string; onBack: () => void }) {
  const { resetPin } = useProfiles()
  const [code, setCode] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (pin && !/^\d{4,6}$/.test(pin)) return setError('A PIN is 4 to 6 digits, or leave it empty for none.')
    if (!(await resetPin(id, code, pin))) setError("That recovery code doesn't match.")
  }

  return (
    <form onSubmit={submit} className="mt-7 max-w-md">
      <h3 className="font-display text-lg font-semibold">Reset the PIN for {name}</h3>
      <p className="mt-1 text-sm text-neutral-600">Enter the recovery code you saved when you made this profile.</p>
      <label className="mt-4 block font-display text-sm font-semibold">
        Recovery code
        <input autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXX-XXXX-XXXX" className={`${input} mt-1.5 font-mono uppercase tracking-widest`} />
      </label>
      <label className="mt-4 block font-display text-sm font-semibold">
        New PIN <span className="font-normal text-neutral-600">(optional)</span>
        <input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="4-6 digits" className={`${input} mt-1.5 font-mono`} />
      </label>
      {error && (
        <p role="alert" className="mt-3 text-sm font-medium">
          {error}
        </p>
      )}
      <button type="submit" disabled={!code.trim()} className={`${btnPrimary} mt-4 w-full py-3.5 text-base`}>
        Reset PIN and log in
      </button>
      <button type="button" onClick={onBack} className="mt-3 text-sm text-neutral-600 underline">
        Back to log in
      </button>
    </form>
  )
}

function LogIn({ onCreate }: { onCreate: () => void }) {
  const { profiles, login } = useProfiles()
  const [forgot, setForgot] = useState(false)
  const [selected, setSelected] = useState(profiles[0]?.id ?? '')
  const [pin, setPin] = useState('')
  const [keep, setKeep] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const profile = profiles.find((p) => p.id === selected)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      // On success the gate re-renders into the app; only a wrong PIN stays here.
      if (!(await login(selected, pin, keep))) setError("That PIN doesn't match.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Split
      headline={
        <>
          <Owl className="h-24 w-24" />
          <h1 className="mt-8 text-5xl font-extrabold tracking-tight sm:text-6xl">Welcome back.</h1>
          <p className="mt-5 max-w-sm text-lg text-neutral-300">
            Profiles live on this laptop only. No internet, no cloud account, nothing uploaded.
          </p>
        </>
      }
      footer={<span className="font-mono">Offline · local profiles</span>}
    >
      <h2 className="text-3xl font-bold tracking-tight">Who's organizing?</h2>
      <p className="mt-1 text-neutral-600">Pick your profile. Each one keeps its own events, gigs and settings.</p>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Profile">
        {profiles.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={selected === p.id}
            onClick={() => {
              setSelected(p.id)
              setPin('')
              setError(null)
              setForgot(false)
            }}
            className={`flex flex-col items-center rounded-2xl border p-4 ${
              selected === p.id ? 'border-2 border-neutral-950' : 'border-neutral-400 hover:border-neutral-950'
            }`}
          >
            <Avatar name={p.name} className="h-14 w-14 text-xl" />
            <span className="mt-2 font-display font-semibold">{p.name}</span>
            <span className="text-sm text-neutral-600">
              {p.mode === 'pro' ? 'Pro' : 'Personal'}
              {p.pin ? ' · PIN' : ''}
            </span>
          </button>
        ))}
        <button
          type="button"
          onClick={onCreate}
          className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-400 p-4 hover:border-neutral-950"
        >
          <span className="grid h-14 w-14 place-items-center rounded-full border border-dashed border-neutral-400 text-2xl">+</span>
          <span className="mt-2 font-display font-semibold">New profile</span>
        </button>
      </div>

      {profile && forgot && <ForgotPin id={profile.id} name={profile.name} onBack={() => setForgot(false)} />}

      {profile && !forgot && (
        <form onSubmit={submit} className="mt-7 max-w-md">
          {profile.pin && (
            <label className="block font-display text-sm font-semibold">
              PIN for {profile.name}
              <input
                type="password"
                inputMode="numeric"
                autoFocus
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className={`${input} mt-1.5 font-mono tracking-widest`}
              />
            </label>
          )}
          <label className="mt-4 flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-neutral-950" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
            Keep me logged in on this laptop
          </label>
          {error && (
            <p role="alert" className="mt-3 text-sm font-medium">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy || (!!profile.pin && !pin)} className={`${btnPrimary} mt-4 w-full py-3.5 text-base`}>
            Log in
          </button>
          <p className="mt-4 flex justify-between text-sm text-neutral-600">
            {profile.pin ? (
              <button type="button" onClick={() => setForgot(true)} className="underline">
                Forgot PIN?
              </button>
            ) : (
              <span />
            )}
            <span>
              New here?{' '}
              <button type="button" onClick={onCreate} className="font-display font-semibold text-neutral-950 underline">
                Create a profile
              </button>
            </span>
          </p>
        </form>
      )}
    </Split>
  )
}

const STEPS = ['Your name and an optional PIN', 'Personal or Pro', 'Where your library lives']

const MODE_CHOICES: { mode: Mode; title: string; body: string }[] = [
  { mode: 'personal', title: "I'm organizing my own photos", body: 'Personal · birthdays, Noche Buena, trips' },
  { mode: 'pro', title: 'I shoot for clients', body: 'Pro · gigs, RAW, A-roll / B-roll, XMP' },
]

function CreateProfile({ onBack, canGoBack }: { onBack: () => void; canGoBack: boolean }) {
  const { create, enter } = useProfiles()
  const [created, setCreated] = useState<{ id: string; code: string } | null>(null)
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [mode, setMode] = useState<Mode>('personal')
  const [folder, setFolder] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (pin && !/^\d{4,6}$/.test(pin)) return setError('A PIN is 4 to 6 digits.')
    if (pin !== confirm) return setError("The two PINs don't match.")
    setBusy(true)
    try {
      setCreated(await create({ name, pin, mode, libraryFolder: folder.trim() }))
    } finally {
      setBusy(false)
    }
  }

  if (created)
    return (
      <Split
        headline={<h1 className="text-5xl font-extrabold tracking-tight sm:text-6xl">You're all set.</h1>}
        footer="Your profile is saved on this laptop. There's no email and no online account."
      >
        <h2 className="text-3xl font-bold tracking-tight">Save your recovery code</h2>
        <p className="mt-2 text-neutral-600">
          If you forget your PIN, this code is the only way back in. It is shown once and isn't stored anywhere
          readable. Write it down or keep it somewhere safe.
        </p>
        <p className="mt-6 rounded-2xl border border-neutral-400 bg-neutral-100 px-5 py-4 text-center font-mono text-3xl tracking-widest">
          {created.code}
        </p>
        <button type="button" onClick={() => enter(created.id, true)} className={`${btnPrimary} mt-6 px-6 py-3.5 text-base`}>
          I've saved it, continue
        </button>
      </Split>
    )

  return (
    <Split
      headline={
        <>
          <h1 className="text-5xl font-extrabold tracking-tight sm:text-6xl">Make your profile.</h1>
          <ol className="mt-8 space-y-3">
            {STEPS.map((step, i) => (
              <li key={step} className="flex items-center gap-3 text-neutral-200">
                <span className={`grid h-7 w-7 place-items-center rounded-full border text-sm font-bold ${i === 0 ? 'border-white bg-white text-neutral-950' : 'border-neutral-400'}`}>
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </>
      }
      footer="Your profile is saved on this laptop. There's no email and no online account."
    >
      {canGoBack && (
        <button type="button" onClick={onBack} className="text-sm text-neutral-600 hover:text-neutral-950">
          ← Back to profiles
        </button>
      )}
      <h2 className="text-3xl font-bold tracking-tight">Create a profile</h2>
      <form onSubmit={submit} className="mt-6 space-y-5">
        <label className="block font-display text-sm font-semibold">
          Your name
          <input required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Lawrence" className={`${input} mt-1.5 font-sans font-normal`} />
        </label>
        <div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block font-display text-sm font-semibold">
              PIN <span className="font-normal text-neutral-600">(optional)</span>
              <input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="4-6 digits" className={`${input} mt-1.5 font-mono font-normal`} />
            </label>
            <label className="block font-display text-sm font-semibold">
              Confirm PIN
              <input type="password" inputMode="numeric" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Again" className={`${input} mt-1.5 font-mono font-normal`} />
            </label>
          </div>
          <p className="mt-2 text-sm text-neutral-600">
            A PIN keeps family members out of a pro's client gigs. Skip it if you're the only one using this laptop.
          </p>
        </div>
        <fieldset>
          <legend className="font-display text-sm font-semibold">How will you use KuhaGo?</legend>
          <div className="mt-2 space-y-3">
            {MODE_CHOICES.map((choice) => (
              <label key={choice.mode} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 ${mode === choice.mode ? 'border-2 border-neutral-950' : 'border-neutral-400'}`}>
                <input type="radio" name="mode" className="mt-1 accent-neutral-950" checked={mode === choice.mode} onChange={() => setMode(choice.mode)} />
                <span>
                  <span className="block font-display text-lg font-semibold">{choice.title}</span>
                  <span className="block text-sm text-neutral-600">{choice.body}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block font-display text-sm font-semibold">
          Library folder
          <input value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="C:\Users\You\KuhaGo" className={`${input} mt-1.5 font-mono font-normal`} />
          <span className="mt-2 block font-sans text-sm font-normal text-neutral-600">
            Previews and search data go here (about 1 GB per 5,000 photos). Your photos stay where they are.
          </span>
        </label>
        {error && (
          <p role="alert" className="text-sm font-medium">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy || !name.trim()} className={`${btnPrimary} px-6 py-3.5 text-base`}>
          Create profile
        </button>
      </form>
    </Split>
  )
}

export default function Profiles() {
  const { profiles } = useProfiles()
  const [creating, setCreating] = useState(profiles.length === 0)
  return creating ? (
    <CreateProfile canGoBack={profiles.length > 0} onBack={() => setCreating(false)} />
  ) : (
    <LogIn onCreate={() => setCreating(true)} />
  )
}
