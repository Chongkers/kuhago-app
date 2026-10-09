import { useState } from 'react'
import type { EventView } from '../api/data'
import { term } from '../lib/terms'

const SEEN_KEY = 'kuha.guideSeen'

function readSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return false
  }
}

// The first-use guide: what to do, in order, with the step to do now called out. It follows the event,
// so a step ticks itself off once it is done. Shown until the user hides it; "How it works" brings it back.
export default function FirstSteps({ event }: { event: EventView }) {
  const [seen, setSeen] = useState(readSeen)
  const media = event.photos + event.videos

  function remember(next: boolean) {
    setSeen(next)
    try {
      if (next) localStorage.setItem(SEEN_KEY, '1')
      else localStorage.removeItem(SEEN_KEY)
    } catch {
      // storage unavailable: the choice lasts until reload
    }
  }

  if (seen) {
    return (
      <button type="button" onClick={() => remember(false)} className="mt-2 text-sm underline">
        How it works
      </button>
    )
  }

  const steps = [
    {
      title: 'Tell KuhaGo what to sort by',
      text: 'Your list is what photos get sorted into: a theme, a subject, a moment, anything you can see in a photo. Click Edit list to add or change them.',
      done: event.moments.length > 0,
    },
    {
      title: 'Add your photos and videos',
      text: 'Pick the folder they are in and press Organize. Your originals are never moved or changed.',
      done: media > 0,
    },
    {
      title: 'Check Unsorted',
      text: 'KuhaGo never guesses. If photos are left in Unsorted, add a theme or subject that fits them to your list and they are sorted again.',
      done: media > 0 && event.unsorted === 0,
    },
    {
      title: term('export', event.mode),
      text: 'Copy everything into tidy folders, one per item on your list.',
      done: false,
    },
  ]
  const current = steps.findIndex((s) => !s.done)

  return (
    <section className="mt-6 rounded-2xl bg-neutral-950 p-5 text-white" aria-label="Getting started">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-neutral-300">First time here? Start with these</p>
          <h2 className="mt-1 text-2xl font-bold">How to organize your photos in 4 steps</h2>
        </div>
        <button type="button" onClick={() => remember(true)} className="text-sm underline">
          Got it, hide this
        </button>
      </div>
      <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step, i) => {
          const now = i === current
          return (
            <li
              key={step.title}
              aria-current={now ? 'step' : undefined}
              className={`rounded-xl p-4 ${now ? 'bg-white text-neutral-950' : 'border border-neutral-600'}`}
            >
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide">
                <span
                  className={`grid h-6 w-6 place-items-center rounded-full ${
                    now ? 'bg-neutral-950 text-white' : 'border border-neutral-400'
                  }`}
                >
                  {step.done ? '✓' : i + 1}
                </span>
                {now ? 'Do this now' : step.done ? 'Done' : 'Next'}
              </p>
              <h3 className="mt-2 font-semibold">{step.title}</h3>
              <p className={`mt-1 text-sm ${now ? 'text-neutral-600' : 'text-neutral-300'}`}>{step.text}</p>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
