import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, type OwlStatus } from '../api/client'
import { useEvent, useEvents } from '../api/data'
import { Bubbles, ClearChat, Composer, Suggestions, useOwlChat } from '../components/OwlChat'
import { Page } from '../components/Shell'
import { useMode } from '../lib/mode'
import { usePrefs, useProfiles } from '../lib/profile'
import { card, panel } from '../lib/styles'
import { term } from '../lib/terms'

const OFFLINE: OwlStatus = { connected: false, models: [], default_model: '', url: '' }

export default function Owl() {
  const { mode: stored } = useMode()
  const mode = stored ?? 'personal'
  const prefs = usePrefs()
  const { updatePrefs } = useProfiles()
  const events = useEvents(mode)
  // opened from an event (/events/:eventId/owl), the chat starts on that event, whatever mode it is in
  const linked = useEvent(Number(useParams().eventId))
  const [eventId, setEventId] = useState<number | undefined>(linked?.id ?? events[0]?.id)
  const event = [linked, ...events].find((e) => e?.id === eventId) ?? events[0]
  const chat = useOwlChat(event)
  // null = still checking
  const [status, setStatus] = useState<OwlStatus | null>(null)

  function checkStatus() {
    api.owlStatus().then(setStatus, () => setStatus(OFFLINE)) // the engine itself is down
  }
  useEffect(checkStatus, [])

  const models = status?.models ?? []
  // the same pick the engine is asked for: the preferred model when installed, else its default, else the first
  const inUse = [prefs.model, status?.default_model].find((m) => m && models.includes(m)) ?? models[0]
  const noun = term('event', mode).toLowerCase()

  return (
    <Page
      width="max-w-6xl"
      right={
        models.length > 0 && (
          <label className="flex items-center gap-2">
            Model
            <select value={inUse} onChange={(e) => updatePrefs({ model: e.target.value })} className="rounded-lg border border-neutral-400 bg-white px-2 py-1 font-mono text-xs">
              {models.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
        )
      }
    >
      <h1 className="text-4xl font-bold tracking-tight">{term('owl', mode)}</h1>
      <p className="mt-1 text-sm text-neutral-600">
        About:{' '}
        {events.length > 1 ? (
          <select
            value={event?.id}
            onChange={(e) => setEventId(Number(e.target.value))}
            className="rounded-lg border border-neutral-400 bg-white px-2 py-0.5"
          >
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        ) : (
          (event?.name ?? `no ${noun} yet`)
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
          <Bubbles chat={chat} />
          <Suggestions mode={mode} chat={chat} />
          <Composer chat={chat} placeholder={`Ask about this ${noun}…`} />
          <ClearChat chat={chat} />
        </div>
        <aside className="space-y-4">
          <section className={`${panel} p-4`}>
            <h2 className="text-lg font-semibold">Local AI</h2>
            {status === null ? (
              <p className="mt-2 text-sm text-neutral-600">Checking for Ollama…</p>
            ) : status.connected ? (
              <>
                <p className="mt-2 font-display text-sm font-semibold">Connected to Ollama</p>
                <p className="mt-1 break-all font-mono text-xs text-neutral-600">
                  {inUse ?? `No models yet. Run: ollama pull ${status.default_model}`}
                </p>
              </>
            ) : (
              <>
                <p className="mt-2 font-display text-sm font-semibold">Ollama isn't running</p>
                <p className="mt-1 text-xs text-neutral-600">
                  Open the Ollama app, then{' '}
                  <button type="button" onClick={checkStatus} className="underline">
                    check again
                  </button>
                  . The rest of KuhaGo works without it.
                </p>
              </>
            )}
            <p className="mt-2 text-xs text-neutral-600">It runs on your laptop. No internet, no uploads, no account.</p>
          </section>
          <section className={`${card} p-4`}>
            <h2 className="text-lg font-semibold">What KuhaGo can use</h2>
            <p className="mt-2 text-xs text-neutral-600">
              The {noun}'s name and date, {term('moment', mode)} names and counts, {term('coverage', mode).toLowerCase()}, and
              what KuhaGo's image search sees in the photos.
            </p>
            <p className="mt-2 text-xs text-neutral-600">
              Ask it to suggest {term('moment', mode)}s and add them with a click, or to find photos. This chat is kept in this
              browser.
            </p>
            <p className="mt-2 text-xs text-neutral-600">It never moves, renames, copies or deletes files.</p>
          </section>
        </aside>
      </div>
    </Page>
  )
}
