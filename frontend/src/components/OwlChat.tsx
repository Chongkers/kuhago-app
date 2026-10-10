import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import type { ChatMessage } from '../api/client'
import { addMoment, askOwl, owlModel, type EventView, type Thumb as ThumbData } from '../api/data'
import { usePrefs } from '../lib/profile'
import { input } from '../lib/styles'
import { term } from '../lib/terms'
import { useAction } from '../lib/useAction'
import { Notice, Owl, Thumb } from './ui'

// failed: the reply is the reason nothing came back, so it is shown but never sent on as conversation.
// moments: a list the user can add from with a click; photos: what matched when they asked to find something.
type Message = { from: 'you' | 'owl'; text: string; failed?: boolean; moments?: string[]; photos?: ThumbData[] }

const SUGGESTIONS = {
  personal: ['What did we miss?', 'Suggest themes for these photos', 'Find the group photos', 'Write a caption for the family group chat'],
  pro: ['Which shots am I missing?', 'Make me a shot list for this gig', 'Find the wide shots', 'Draft a client delivery note'],
}

// Conversations are kept in this browser, one per event, so they are still there after a reload.
const KEEP = 60
const storageKey = (eventId: number) => `kuhago.chat.${eventId}`

function stored(eventId: number | undefined): Message[] {
  if (eventId === undefined) return []
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(storageKey(eventId)) ?? '[]')
    return Array.isArray(saved) ? (saved as Message[]) : []
  } catch {
    return [] // storage blocked or not JSON: start a new conversation
  }
}

// After an event is deleted: its id may be given to the next event, which must not open on this chat.
export function forgetChat(eventId: number) {
  store(eventId, [])
}

function store(eventId: number | undefined, messages: Message[]) {
  if (eventId === undefined) return
  try {
    if (messages.length === 0) localStorage.removeItem(storageKey(eventId))
    else localStorage.setItem(storageKey(eventId), JSON.stringify(messages.slice(-KEEP)))
  } catch {
    // storage full or blocked: the chat still works, it just isn't kept
  }
}

// Chat with the local assistant about one event. A failure is shown as its reply so the person knows
// why nothing came back.
export function useOwlChat(event?: EventView) {
  const { model, replyLanguage } = usePrefs()
  const eventId = event?.id
  const [chat, setChat] = useState({ eventId, messages: stored(eventId) })
  const [busy, setBusy] = useState(false)
  // a conversation is about one event: switching events shows that event's own
  if (chat.eventId !== eventId) setChat({ eventId, messages: stored(eventId) })
  const { messages } = chat

  // a reply lands in the conversation that was asked, even if another event is on screen by then
  function add(to: number | undefined, message: Message) {
    store(to, [...stored(to), message])
    setChat((c) => (c.eventId === to ? { ...c, messages: [...c.messages, message] } : c))
  }

  async function send(text: string) {
    const prompt = text.trim()
    if (!prompt || busy) return
    const history: ChatMessage[] = [...messages.filter((m) => !m.failed), { from: 'you' as const, text: prompt }].map((m) => ({
      role: m.from === 'you' ? 'user' : 'assistant',
      content: m.text,
    }))
    add(eventId, { from: 'you', text: prompt })
    setBusy(true)
    try {
      const { reply, moments, photos } = await askOwl(eventId, history, model, replyLanguage)
      add(eventId, { from: 'owl', text: reply, moments, photos })
    } catch (e) {
      add(eventId, { from: 'owl', text: (e as Error).message, failed: true })
    } finally {
      setBusy(false)
    }
  }

  function clear() {
    store(eventId, [])
    setChat({ eventId, messages: [] })
  }

  return { event, messages, busy, send, clear }
}

type Chat = ReturnType<typeof useOwlChat>

// The list a reply offers: a shot list for a gig, moments for an event. Each line is added with a click, or all
// of them at once; adding re-sorts the photos. A line reads as added for as long as it is on the event's list.
function MomentList({ event, moments }: { event: EventView; moments: string[] }) {
  const prefs = usePrefs()
  const { error, run } = useAction()
  const [adding, setAdding] = useState<string | null>(null)
  const have = new Set(event.moments.map((m) => m.moment.toLowerCase()))
  const left = moments.filter((name) => !have.has(name.toLowerCase()))

  function add(names: string[]) {
    run(async () => {
      try {
        // with a model, the engine describes what such a photo looks like, which is what the sorting matches on
        const model = (await owlModel(prefs.model)) ?? undefined
        for (const name of names) {
          setAdding(name)
          await addMoment(event.id, name, { model })
        }
      } finally {
        setAdding(null)
      }
    })
  }

  return (
    <div className="mt-2 rounded-xl border border-neutral-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-3 py-2">
        <p className="font-display text-sm font-semibold">
          {event.mode === 'pro' ? 'Suggested shot list' : 'Suggested moments'}
        </p>
        {left.length > 1 && (
          <button type="button" disabled={adding !== null} onClick={() => add(left)} className="text-sm font-medium underline disabled:opacity-50">
            Add all {left.length}
          </button>
        )}
      </div>
      <ol className="divide-y divide-neutral-200">
        {moments.map((name, i) => (
          <li key={name} className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm">
            <span className="min-w-0">
              <span className="mr-2 font-mono text-xs text-neutral-600">{i + 1}</span>
              {name}
            </span>
            {have.has(name.toLowerCase()) ? (
              <span className="shrink-0 text-xs text-neutral-600">✓ On the list</span>
            ) : (
              <button type="button" disabled={adding !== null} onClick={() => add([name])} className="shrink-0 font-medium underline disabled:opacity-50">
                {adding === name ? 'Adding…' : '+ Add'}
              </button>
            )}
          </li>
        ))}
      </ol>
      {error && (
        <div className="px-3 pb-2">
          <Notice>{error}</Notice>
        </div>
      )}
    </div>
  )
}

export function Bubbles({ chat }: { chat: Chat }) {
  const says = 'rounded-2xl bg-neutral-100 px-4 py-2.5 text-sm whitespace-pre-wrap'
  return (
    <div className="space-y-3" aria-live="polite">
      {chat.messages.map((m, i) =>
        m.from === 'you' ? (
          <p key={i} className="ml-auto w-fit max-w-[85%] rounded-2xl bg-neutral-950 px-4 py-2.5 text-sm whitespace-pre-wrap text-white">
            {m.text}
          </p>
        ) : (
          <div key={i} className="flex items-start gap-2.5">
            <Owl className="mt-1 h-6 w-6 shrink-0" />
            <div className="max-w-[85%] min-w-0">
              <p className={`${says} w-fit`}>{m.text}</p>
              {m.moments && m.moments.length > 0 && chat.event && <MomentList event={chat.event} moments={m.moments} />}
              {m.photos && m.photos.length > 0 && (
                <div className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                  {m.photos.map((photo) => (
                    <a key={photo.id} href={photo.full} target="_blank" rel="noreferrer" title={photo.name}>
                      <Thumb thumb={photo} className="aspect-square w-full rounded-md" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        ),
      )}
      {chat.busy && (
        <div role="status" className="flex items-start gap-2.5">
          <Owl className="mt-1 h-6 w-6 shrink-0" />
          <p className={`${says} text-neutral-600`}>Thinking…</p>
        </div>
      )}
    </div>
  )
}

export function Suggestions({ mode, chat }: { mode: 'personal' | 'pro'; chat: Chat }) {
  return (
    <div className="flex flex-wrap gap-2">
      {SUGGESTIONS[mode].map((s) => (
        <button key={s} type="button" disabled={chat.busy} onClick={() => chat.send(s)} className="rounded-full border border-neutral-400 px-3.5 py-1.5 text-sm hover:border-neutral-950 disabled:opacity-50">
          {s}
        </button>
      ))}
    </div>
  )
}

export function Composer({ chat, placeholder }: { chat: Chat; placeholder: string }) {
  const [text, setText] = useState('')
  function submit(e: FormEvent) {
    e.preventDefault()
    chat.send(text)
    setText('')
  }
  return (
    <form onSubmit={submit} className="flex gap-2">
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-label={placeholder} className={input} />
      <button type="submit" disabled={chat.busy || !text.trim()} aria-label="Send" className="grid w-11 shrink-0 place-items-center rounded-xl bg-neutral-950 text-white disabled:opacity-50">
        →
      </button>
    </form>
  )
}

export function ClearChat({ chat }: { chat: Chat }) {
  if (chat.messages.length === 0) return null
  return (
    <button type="button" disabled={chat.busy} onClick={chat.clear} className="text-sm text-neutral-600 underline disabled:opacity-50">
      Clear this chat
    </button>
  )
}

// The compact card on an event page. The conversation scrolls inside the card, newest at the bottom, so the
// card stays the same height however long the chat gets.
export default function OwlCard({ event }: { event: EventView }) {
  const prefs = usePrefs()
  const chat = useOwlChat(event)
  const scroller = useRef<HTMLDivElement>(null)
  const shown = chat.messages.length + (chat.busy ? 1 : 0)
  // a reply swaps "Thinking…" for a message, so the count alone would miss it
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight })
  }, [chat.messages.length, chat.busy])
  if (!prefs.owlEnabled) return null

  return (
    <section className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <Owl className="h-7 w-7" /> {term('owl', event.mode)}
        </h2>
        <Link to={`/events/${event.id}/owl`} className="text-sm font-medium underline">
          Open
        </Link>
      </div>
      <p className="w-fit rounded-full border border-neutral-400 px-2.5 py-0.5 font-mono text-xs">Ollama · on this laptop</p>
      {shown > 0 ? (
        <div ref={scroller} className="-mr-2 max-h-96 overflow-y-auto pr-2">
          <Bubbles chat={chat} />
        </div>
      ) : (
        <Suggestions mode={event.mode} chat={chat} />
      )}
      <Composer chat={chat} placeholder={`Ask about this ${term('event', event.mode).toLowerCase()}…`} />
      <ClearChat chat={chat} />
    </section>
  )
}
