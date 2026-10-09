import { useEffect, useState, type FormEvent } from 'react'
import {
  addMoment,
  missedMoments,
  owlModel,
  removeMoment,
  suggestMoments,
  switchPreset,
  updateMoment,
  type EventView,
  type MomentIdea,
  type MomentView,
} from '../api/data'
import { count } from '../lib/format'
import { usePrefs } from '../lib/profile'
import { btnSecondary, card, input } from '../lib/styles'
import { BLANK, TEMPLATES, templateLabel } from '../lib/templates'
import { term } from '../lib/terms'
import { useAction } from '../lib/useAction'
import { Badge, Notice } from './ui'

const link = 'text-sm font-medium underline disabled:opacity-50'

// One moment while the list is being edited: rename, must-have or optional, remove.
function EditRow({ event, moment, run }: { event: EventView; moment: MomentView; run: (a: () => Promise<unknown>) => void }) {
  const [name, setName] = useState(moment.moment)

  function rename() {
    const next = name.trim()
    if (!next) setName(moment.moment)
    else if (next !== moment.moment) run(() => updateMoment(event.id, moment.shotItemId, { moment: next }))
  }

  function remove() {
    const examples = moment.refs.length > 0 ? ` and its ${term('refs', event.mode).toLowerCase()}` : ''
    if (window.confirm(`Remove ${moment.moment}${examples} from the list? Your photos are not touched.`)) {
      run(() => removeMoment(event.id, moment.shotItemId))
    }
  }

  return (
    <li className="space-y-1.5 py-3">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={rename}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        aria-label={`Name of ${moment.moment}`}
        className={`${input} px-3 py-1.5`}
      />
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-neutral-950"
            checked={moment.required}
            onChange={(e) => run(() => updateMoment(event.id, moment.shotItemId, { required: e.target.checked }))}
          />
          Must-have
        </label>
        <button type="button" onClick={remove} className={link}>
          Remove
        </button>
      </div>
    </li>
  )
}

// Add a moment, ask the owl for ideas, or swap the whole list for another preset.
function EditTools({ event, run }: { event: EventView; run: (a: () => Promise<unknown>) => void }) {
  const prefs = usePrefs()
  const [name, setName] = useState('')
  const [preset, setPreset] = useState(event.eventType)
  const [ideas, setIdeas] = useState<MomentIdea[] | null>(null)
  const [thinking, setThinking] = useState(false)
  const [adding, setAdding] = useState(false)
  const noun = term('moment', event.mode)
  // Asked once per edit, not on every add: when Ollama is off, each call to it costs seconds before it fails.
  // undefined = not known yet, null = the owl can't help right now.
  const [found, setFound] = useState<string | null>()
  useEffect(() => {
    if (!prefs.owlEnabled) return
    let stale = false
    owlModel(prefs.model).then((m) => stale || setFound(m))
    return () => {
      stale = true
    }
  }, [prefs.owlEnabled, prefs.model])
  const model = prefs.owlEnabled ? found : null
  // the owl turns a typed name into what such a photo looks like; without it the name itself is used
  const describer = model ?? undefined

  function add(e: FormEvent) {
    e.preventDefault()
    const moment = name.trim()
    if (!moment || adding) return
    setAdding(true) // the owl may take a while to describe it
    run(() =>
      addMoment(event.id, moment, { model: describer })
        .then(() => setName(''))
        .finally(() => setAdding(false)),
    )
  }

  function suggest() {
    setThinking(true)
    run(() => suggestMoments(event.id, describer).then(setIdeas).finally(() => setThinking(false)))
  }

  function addIdea(idea: MomentIdea) {
    run(async () => {
      await addMoment(event.id, idea.moment, { prompts: idea.prompts, required: false })
      setIdeas((list) => list?.filter((i) => i !== idea) ?? null)
    })
  }

  function swap() {
    const label = preset === BLANK ? 'an empty list' : `the ${templateLabel(preset)} preset`
    const warning = `Replace this list with ${label}? The ${noun}s you added and their ${term('refs', event.mode).toLowerCase()} are removed. Your photos are not touched.`
    if (window.confirm(warning)) run(() => switchPreset(event.id, preset))
  }

  return (
    <div className="mt-3 space-y-4 border-t border-neutral-200 pt-4">
      <form onSubmit={add} className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={`Add a ${noun}, e.g. Band on stage`}
          aria-label={`New ${noun}`}
          className={`${input} px-3 py-2`}
        />
        <button type="submit" disabled={!name.trim() || adding} className={`${btnSecondary} shrink-0 py-2`}>
          {adding ? 'Adding…' : 'Add'}
        </button>
      </form>

      {prefs.owlEnabled && (
        <div>
          <button
            type="button"
            onClick={suggest}
            disabled={thinking || !model || event.photos + event.videos === 0}
            className={link}
          >
            {thinking ? 'KuhaGo is looking…' : `Ask KuhaGo what ${noun}s these photos show`}
          </button>
          {model === null && (
            <p className="mt-1 text-xs text-neutral-600">Start Ollama on this laptop to get suggestions.</p>
          )}
          {ideas && ideas.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {ideas.map((idea) => (
                <button
                  key={idea.moment}
                  type="button"
                  title={idea.prompts.join(' · ')}
                  onClick={() => addIdea(idea)}
                  className="rounded-full border border-neutral-400 px-3 py-1 text-sm hover:border-neutral-950"
                >
                  + {idea.moment}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div>
        <label className="text-xs text-neutral-600" htmlFor={`preset-${event.id}`}>
          Start over from a preset
        </label>
        <div className="mt-1 flex gap-2">
          <select id={`preset-${event.id}`} value={preset} onChange={(e) => setPreset(e.target.value)} className={`${input} px-3 py-2`}>
            {TEMPLATES.map((t) => (
              <option key={t.eventType} value={t.eventType}>
                {t.label}
              </option>
            ))}
            <option value={BLANK}>{templateLabel(BLANK)}</option>
          </select>
          <button type="button" onClick={swap} className={`${btnSecondary} shrink-0 py-2`}>
            Use
          </button>
        </div>
      </div>
    </div>
  )
}

// The missed-moment check: missed must-haves first, then what was found, then optional moments with nothing yet.
// The list itself is the user's to change; the preset only filled it in.
export default function CoverageCard({ event }: { event: EventView }) {
  const { mode } = event
  const pro = mode === 'pro'
  // an empty list sorts nothing, so it opens ready to be filled in
  const [editing, setEditing] = useState(event.moments.length === 0)
  const { error, run } = useAction()
  const missed = missedMoments(event)
  const covered = event.moments.filter((m) => m.covered)
  const optional = event.moments.filter((m) => !m.required && !m.covered)
  const mustHaves = event.moments.filter((m) => m.required).length

  const summary =
    event.moments.length === 0
      ? `This list is empty, so nothing can be sorted yet. Click Edit list to add ${term('moment', mode)}s.`
      : missed.length === 0
        ? 'Every must-have is covered.'
        : pro
          ? `KuhaGo suggests getting ${count(missed.length, 'more shot')}: it found no frames for ${missed.length} of ${mustHaves} must-haves.`
          : `KuhaGo suggests getting ${count(missed.length, 'more moment')}: it found no photos for ${missed.length} of ${mustHaves} must-haves.`
  // advice, not a verdict: KuhaGo may simply not have recognized the photo
  const fallbackHint = pro ? "KuhaGo didn't find frames for this. Worth a shot?" : "KuhaGo didn't find this one. Worth getting a photo?"

  return (
    <section className={`${card} p-5`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xl font-bold">{term('checklistTitle', mode)}</h2>
        <button type="button" onClick={() => setEditing(!editing)} className={link}>
          {editing ? 'Done' : 'Edit list'}
        </button>
      </div>
      <p className="mt-1 text-xs text-neutral-600">
        {editing
          ? `KuhaGo sorts your ${term('frame', mode)}s into what is listed here: a theme, a subject, anything you can see in a ${term('frame', mode)}. It only suggests getting must-haves. Changing the list re-sorts your ${term('frame', mode)}s.`
          : summary}
      </p>
      {editing ? (
        <>
          <ul className="mt-3 divide-y divide-neutral-200">
            {event.moments.map((m) => (
              <EditRow key={m.shotItemId} event={event} moment={m} run={run} />
            ))}
          </ul>
          <EditTools event={event} run={run} />
        </>
      ) : (
        <ul className="mt-3 divide-y divide-neutral-200">
          {missed.map((m) => (
            <li key={m.moment} className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="font-display font-semibold">{m.moment}</p>
                <p className="text-xs text-neutral-600">{m.hint ?? fallbackHint}</p>
              </div>
              <Badge variant="outline">Suggested</Badge>
            </li>
          ))}
          {covered.map((m) => (
            <li key={m.moment} className="flex items-center justify-between gap-3 py-3">
              <p className="font-display font-semibold">{m.moment}</p>
              <Badge variant="outline">{pro ? m.count : count(m.count, 'photo')}</Badge>
            </li>
          ))}
          {optional.map((m) => (
            <li key={m.moment} className="flex items-center justify-between gap-3 py-3 text-neutral-600">
              <p className="font-display">{m.moment}</p>
              <span className="text-xs">Optional</span>
            </li>
          ))}
        </ul>
      )}
      <Notice>{error}</Notice>
    </section>
  )
}
