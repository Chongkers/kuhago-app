import { useMode } from '../lib/mode'
import type { Mode } from '../lib/terms'

const CHOICES: { mode: Mode; title: string; body: string }[] = [
  {
    mode: 'personal',
    title: "I'm organizing my own photos",
    body: 'Birthdays, Noche Buena, trips, graduations. Phone photos and videos.',
  },
  {
    mode: 'pro',
    title: 'I shoot for clients',
    body: 'Paid gigs with RAW files, camera video, and your editing app.',
  },
]

// Placeholder layout until the wireframes land; the mode pick itself is functional.
export default function Welcome() {
  const { setMode } = useMode()

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 p-6">
      <h1 className="text-3xl font-semibold">Kuha</h1>
      <p className="text-neutral-600">How will you use Kuha? You can change this later in Settings.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {CHOICES.map((choice) => (
          <button
            key={choice.mode}
            type="button"
            onClick={() => setMode(choice.mode)}
            className="rounded-lg border border-neutral-300 bg-white p-5 text-left hover:border-neutral-900"
          >
            <span className="block font-medium">{choice.title}</span>
            <span className="mt-1 block text-sm text-neutral-600">{choice.body}</span>
          </button>
        ))}
      </div>
    </main>
  )
}
