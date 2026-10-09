import { Link } from 'react-router-dom'
import { useEvents } from '../api/data'
import { Bubbles, Composer, Suggestions, useOwlChat } from '../components/OwlChat'
import { Page } from '../components/Shell'
import { useMode } from '../lib/mode'
import { usePrefs, useProfiles } from '../lib/profile'
import { card, panel } from '../lib/styles'
import { useState } from 'react'

export default function Owl() {
  const { mode: stored } = useMode()
  const mode = stored ?? 'personal'
  const prefs = usePrefs()
  const { updatePrefs } = useProfiles()
  const events = useEvents(mode)
  const [eventId, setEventId] = useState<number | undefined>(events[0]?.id)
  const event = events.find((e) => e.id === eventId) ?? events[0]
  const chat = useOwlChat(event)

  return (
    <Page
      width="max-w-6xl"
      right={
        <label className="flex items-center gap-2">
          Model
          <select value={prefs.model} onChange={(e) => updatePrefs({ model: e.target.value })} className="rounded-lg border border-neutral-400 bg-white px-2 py-1 font-mono text-xs">
            {[...new Set([prefs.model, 'llama3.2:3b', 'qwen2.5:7b', 'gemma3:4b'])].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
      }
    >
      <h1 className="text-4xl font-bold tracking-tight">Ask the owl</h1>
      <p className="mt-1 text-sm text-neutral-600">
        About:{' '}
        {events.length > 1 ? (
          <select value={event?.id} onChange={(e) => setEventId(Number(e.target.value))} className="rounded-lg border border-neutral-400 bg-white px-2 py-0.5">
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        ) : (
          (event?.name ?? 'no event yet')
        )}
      </p>

      {!prefs.owlEnabled && (
        <p className={`${panel} mt-6 p-4 text-sm`}>
          The assistant is off. Turn it on in{' '}
          <Link to="/settings" className="font-semibold underline">
            Settings
          </Link>
          .
        </p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-5">
          <Bubbles messages={chat.messages} />
          <Suggestions mode={mode} chat={chat} />
          <Composer chat={chat} placeholder="Ask anything about your photos…" />
        </div>
        <aside className="space-y-4">
          <section className={`${panel} p-4`}>
            <h2 className="text-lg font-semibold">Local AI</h2>
            <p className="mt-2 font-display text-sm font-semibold">{prefs.owlEnabled ? 'Ollama, on this laptop' : 'Off'}</p>
            <p className="mt-1 break-all font-mono text-xs text-neutral-600">{prefs.ollamaUrl}</p>
            <p className="mt-2 text-xs text-neutral-600">The owl runs on your laptop. No internet, no uploads, no account.</p>
          </section>
          <section className={`${card} p-4`}>
            <h2 className="text-lg font-semibold">What the owl can use</h2>
            <p className="mt-2 text-xs text-neutral-600">Moment names and counts, missed moments, photo search, capture times, your notes.</p>
            <p className="mt-2 text-xs text-neutral-600">
              It never moves, renames or deletes files. Anything that copies files asks you first.
            </p>
          </section>
        </aside>
      </div>
    </Page>
  )
}
