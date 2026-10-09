import { Owl } from '../components/ui'
import { BarePage } from '../components/Shell'
import { useMode } from '../lib/mode'
import { useProfiles } from '../lib/profile'
import { btnPrimary, btnSecondary } from '../lib/styles'
import { term, type Mode } from '../lib/terms'

const CHOICES: { mode: Mode; kicker: string; title: string; body: string; cta: string; button: string }[] = [
  {
    mode: 'personal',
    kicker: term('window', 'personal'),
    title: "I'm organizing my own photos",
    body: 'Birthdays, Noche Buena, barkada trips, graduations. Phone photos and videos.',
    cta: 'Get started',
    button: btnPrimary,
  },
  {
    mode: 'pro',
    kicker: term('window', 'pro'),
    title: 'I shoot for clients',
    body: 'Debuts, weddings, binyag. RAW files, shot lists, A-roll / B-roll, XMP for your editor.',
    cta: 'Open the tracker',
    button: btnSecondary,
  },
]

export default function Welcome() {
  const { setMode } = useMode()
  const { logout } = useProfiles()

  return (
    <BarePage
      right={
        <>
          <span>Offline · nothing leaves your laptop</span>
          <button type="button" onClick={logout} className="font-display font-semibold text-neutral-950 underline">
            Switch profile
          </button>
        </>
      }
    >
      <div className="flex flex-col items-center pt-8 text-center">
        <Owl className="h-24 w-24" />
        <h1 className="mt-6 text-5xl font-extrabold tracking-tight sm:text-6xl">Every moment, sorted.</h1>
        <p className="mt-6 max-w-xl text-lg text-neutral-600">
          Point KuhaGo at your party photos and videos. It groups them into moments, picks the best shots, and
          tells you what nobody got a photo of.
        </p>
      </div>
      <div className="mt-12 grid gap-5 sm:grid-cols-2">
        {CHOICES.map((choice) => (
          <section key={choice.mode} className="rounded-2xl border border-neutral-400 p-7">
            <p className="text-sm font-medium uppercase tracking-wide text-neutral-600">{choice.kicker}</p>
            <h2 className="mt-3 text-2xl font-bold">{choice.title}</h2>
            <p className="mt-3 text-neutral-600">{choice.body}</p>
            <button type="button" onClick={() => setMode(choice.mode)} className={`mt-5 ${choice.button} text-base`}>
              {choice.cta}
            </button>
          </section>
        ))}
      </div>
      <p className="mt-10 text-center text-sm text-neutral-600">You can switch between Events and Tracker any time, from the sidebar.</p>
    </BarePage>
  )
}
