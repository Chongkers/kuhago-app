import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { api, type ChatMessage, type OwlStatus } from '../api/client'
import { useEvent } from '../api/data'
import { Badge, Notice, Owl } from '../components/ui'
import { NotFound, Page } from '../components/Shell'
import { btnPrimary, card, input, panel } from '../lib/styles'
import { term } from '../lib/terms'

const CHIPS = {
  personal: ['What did we miss?', 'Summarize the day', 'Write a caption for the family group chat'],
  pro: ['Which shots am I missing?', 'Draft a client delivery note', 'Summarize the coverage'],
}

function OwlSays({ muted, children }: { muted?: boolean; children: ReactNode }) {
  return (
    <div className="flex max-w-[90%] items-start gap-2.5">
      <Owl className="h-7 w-7 shrink-0" />
      <p className={`rounded-2xl rounded-bl-sm bg-neutral-100 px-3.5 py-3 whitespace-pre-wrap ${muted ? 'text-neutral-600' : ''}`}>
        {children}
      </p>
    </div>
  )
}

// A chat about one event, answered by Ollama on this laptop.
export default function AskOwl() {
  const { eventId } = useParams()
  const event = useEvent(Number(eventId))
  const [status, setStatus] = useState<OwlStatus | null>(null)
  const [model, setModel] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [thinking, setThinking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const end = useRef<HTMLDivElement>(null)

  function checkStatus() {
    api.owlStatus().then(
      (s) => {
        setStatus(s)
        // keep the pick; else the default when installed; else the first installed
        setModel((m) => [m, s.default_model].find((x) => s.models.includes(x)) ?? s.models[0] ?? s.default_model)
      },
      () => setStatus({ connected: false, models: [], default_model: '', url: '' }), // the engine itself is down
    )
  }

  useEffect(checkStatus, [])
  // block body: newer browsers return a Promise from scrollIntoView, which React would call as cleanup
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [messages, thinking])

  if (!event) return <NotFound />

  function send(text: string) {
    if (!text.trim() || thinking || !event) return
    const next: ChatMessage[] = [...messages, { role: 'user', content: text.trim() }]
    setMessages(next)
    setDraft('')
    setError(null)
    setThinking(true)
    api
      .ask(event.id, next, model)
      .then(({ reply }) => setMessages([...next, { role: 'assistant', content: reply }]))
      .catch((e: Error) => {
        setError(e.message)
        checkStatus()
      })
      .finally(() => setThinking(false))
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    send(draft)
  }

  return (
    <Page pro={event.mode === 'pro'}>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-200 pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{term('owl', event.mode)}</h1>
          <p className="text-sm text-neutral-600">About: {event.name}</p>
        </div>
        {status && status.models.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-neutral-600">
            Model
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="rounded-xl border border-neutral-400 bg-white px-3 py-2 font-mono text-sm text-neutral-950"
            >
              {status.models.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-start gap-6">
        <section aria-label="Conversation" className="flex min-w-0 flex-[999_1_480px] flex-col gap-4">
          {messages.length === 0 && (
            <OwlSays>
              Hi! Ask me about this {term('event', event.mode).toLowerCase()}: what's missing, what happened, or a
              caption to share.
            </OwlSays>
          )}
          {messages.map((m, i) =>
            m.role === 'user' ? (
              <p
                key={i}
                className="max-w-[75%] self-end rounded-2xl rounded-br-sm bg-neutral-950 px-3.5 py-2.5 whitespace-pre-wrap text-white"
              >
                {m.content}
              </p>
            ) : (
              <OwlSays key={i}>{m.content}</OwlSays>
            ),
          )}
          {thinking && (
            <div role="status">
              <OwlSays muted>Thinking…</OwlSays>
            </div>
          )}
          <div ref={end} />

          <div className="flex flex-wrap gap-1.5 pt-2">
            {CHIPS[event.mode].map((chip) => (
              <button
                key={chip}
                type="button"
                disabled={thinking}
                onClick={() => send(chip)}
                className="rounded-full border border-neutral-400 bg-white px-3 py-2 text-sm font-medium hover:border-neutral-950 disabled:opacity-50"
              >
                {chip}
              </button>
            ))}
          </div>

          <form onSubmit={submit}>
            <div className="flex items-center gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Ask anything about your photos…"
                aria-label="Message the owl"
                className={input}
              />
              <button type="submit" aria-label="Send" disabled={thinking || !draft.trim()} className={`${btnPrimary} shrink-0`}>
                Send
              </button>
            </div>
            <Notice>{error}</Notice>
          </form>
        </section>

        <aside className="flex min-w-0 flex-[1_1_260px] flex-col gap-4">
          <div className={`${panel} flex flex-col gap-2.5 p-4`}>
            <h2 className="text-lg font-semibold">Local AI</h2>
            {status === null ? (
              <p className="text-sm text-neutral-600">Checking for Ollama…</p>
            ) : status.connected ? (
              <p className="flex items-center gap-2 font-semibold">
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-neutral-950" />
                Connected to Ollama
              </p>
            ) : (
              <>
                <p className="flex items-center gap-2 font-semibold">
                  <span aria-hidden="true" className="h-2 w-2 rounded-full border border-neutral-950" />
                  Ollama isn't running
                </p>
                <p className="text-sm text-neutral-600">
                  Open the Ollama app (or run <span className="font-mono">ollama serve</span>), then{' '}
                  <button type="button" onClick={checkStatus} className="underline">
                    check again
                  </button>
                  . The rest of KuhaGo works without it.
                </p>
              </>
            )}
            {status?.url && <span className="font-mono text-sm text-neutral-600">{status.url}</span>}
            <span className="text-sm text-neutral-600">The owl runs on your laptop. No internet, no uploads, no account.</span>
          </div>

          {status?.connected && (
            <div className={`${card} flex flex-col gap-2 p-4 shadow-none`}>
              <h2 className="text-lg font-semibold">Installed models</h2>
              {status.models.length === 0 && <p className="text-sm text-neutral-600">None yet.</p>}
              {status.models.map((m) => (
                <div key={m} className="flex justify-between gap-2">
                  <span className="font-mono text-sm">{m}</span>
                  {m === model && <Badge>In use</Badge>}
                </div>
              ))}
              <span className="pt-1 text-sm text-neutral-600">
                Add one: <span className="font-mono">ollama pull {status.default_model}</span>
              </span>
            </div>
          )}

          <div className={`${card} flex flex-col gap-1.5 p-4 shadow-none`}>
            <h2 className="mb-1 text-lg font-semibold">What the owl can use</h2>
            <span className="text-sm text-neutral-600">
              The {term('event', event.mode).toLowerCase()}'s name and date, {term('moment', event.mode)} names and counts,
              and {term('coverage', event.mode).toLowerCase()}.
            </span>
            <span className="text-sm text-neutral-600">It never moves, renames, copies or deletes files.</span>
          </div>
        </aside>
      </div>
    </Page>
  )
}
