import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { askOwl, type EventView } from '../api/data'
import { usePrefs } from '../lib/profile'
import { input } from '../lib/styles'
import { Owl } from './ui'

type Message = { from: 'you' | 'owl'; text: string }

const SUGGESTIONS = {
  personal: ['What did we miss?', 'Find lola with the cake', 'Write a caption for the GC', 'Summarize the day'],
  pro: ['Which shots am I missing before I leave?', 'Draft client delivery note', 'List unedited selects', 'Suggest A-roll for the SDE'],
}

// Chat with the local assistant. Replies come from the engine; until it can run the assistant,
// the failure is shown as the owl's reply so the person knows why nothing came back.
export function useOwlChat(event?: EventView) {
  const [messages, setMessages] = useState<Message[]>([])
  const [busy, setBusy] = useState(false)

  async function send(text: string) {
    const prompt = text.trim()
    if (!prompt || busy) return
    setMessages((m) => [...m, { from: 'you', text: prompt }])
    setBusy(true)
    try {
      const reply = (await askOwl(event?.id, prompt)) as unknown as string
      setMessages((m) => [...m, { from: 'owl', text: reply }])
    } catch (e) {
      setMessages((m) => [...m, { from: 'owl', text: (e as Error).message }])
    } finally {
      setBusy(false)
    }
  }

  return { messages, busy, send }
}

type Chat = ReturnType<typeof useOwlChat>

export function Bubbles({ messages }: { messages: Message[] }) {
  return (
    <div className="space-y-3" aria-live="polite">
      {messages.map((m, i) =>
        m.from === 'you' ? (
          <p key={i} className="ml-auto w-fit max-w-[85%] rounded-2xl bg-neutral-950 px-4 py-2.5 text-sm text-white">
            {m.text}
          </p>
        ) : (
          <div key={i} className="flex items-start gap-2.5">
            <Owl className="mt-1 h-6 w-6 shrink-0" />
            <p className="max-w-[85%] rounded-2xl bg-neutral-100 px-4 py-2.5 text-sm">{m.text}</p>
          </div>
        ),
      )}
    </div>
  )
}

export function Suggestions({ mode, chat }: { mode: 'personal' | 'pro'; chat: Chat }) {
  return (
    <div className="flex flex-wrap gap-2">
      {SUGGESTIONS[mode].map((s) => (
        <button key={s} type="button" onClick={() => chat.send(s)} className="rounded-full border border-neutral-400 px-3.5 py-1.5 text-sm hover:border-neutral-950">
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

// The compact card on an event page.
export default function OwlCard({ event }: { event: EventView }) {
  const prefs = usePrefs()
  const chat = useOwlChat(event)
  if (!prefs.owlEnabled) return null

  return (
    <section className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <Owl className="h-7 w-7" /> Ask the owl
        </h2>
        <Link to="/owl" className="text-sm font-medium underline">
          Open
        </Link>
      </div>
      <p className="w-fit rounded-full border border-neutral-400 px-2.5 py-0.5 font-mono text-xs">Ollama · {prefs.model} · local</p>
      <Bubbles messages={chat.messages} />
      <Suggestions mode={event.mode} chat={chat} />
      <Composer chat={chat} placeholder="Ask about this event…" />
    </section>
  )
}
