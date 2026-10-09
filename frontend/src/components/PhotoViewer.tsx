import { useEffect, useState } from 'react'
import { UNSORTED, type Thumb as ThumbData } from '../api/data'
import { term, type Mode } from '../lib/terms'
import { useAction } from '../lib/useAction'
import { Confirm } from './ui'

const control = 'rounded-xl border border-[#737373] px-4 py-2 font-display text-sm font-semibold hover:border-[#fafafa] disabled:opacity-40'
// the "let KuhaGo decide" choice of the moment menu; never a moment's name
const AUTO = '\u0000auto'

// One photo or video, large, over the page: step through the grid it was opened from, play a clip, and fix what
// KuhaGo got wrong by hand: move it to another moment, mark it as a favorite, or take it out of the event.
// Colours are literal on purpose: the viewer stays dark in both themes.
export default function PhotoViewer({
  thumbs,
  index,
  mode,
  moments,
  suggest,
  onIndex,
  onClose,
  onRemove,
  onMove,
  onFavorite,
}: {
  thumbs: ThumbData[]
  index: number
  mode: Mode
  // the names on the event's list, for the moment menu
  moments: string[]
  // the missed moment these photos were offered for: the viewer asks "is this it?"
  suggest?: string
  onIndex: (index: number) => void
  onClose: () => void
  onRemove: (thumb: ThumbData) => Promise<void>
  // null hands it back to KuhaGo to sort
  onMove: (thumb: ThumbData, moment: string | null) => Promise<void>
  onFavorite: (thumb: ThumbData, favorite: boolean) => Promise<void>
}) {
  const { error, busy, run } = useAction()
  const [removing, setRemoving] = useState(false)
  // the clip the player gave up on (some phone formats don't play in a browser); its still frame is shown instead
  const [unplayable, setUnplayable] = useState<string | null>(null)
  const thumb = thumbs[index]
  const last = thumbs.length - 1

  useEffect(() => {
    function key(e: KeyboardEvent) {
      // a window is open over the viewer, or the key belongs to the menu or the player
      if (removing || (e.target instanceof Element && e.target.closest('select, video'))) return
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1)
      else if (e.key === 'ArrowRight' && index < last) onIndex(index + 1)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [removing, index, last, onClose, onIndex])

  if (!thumb) return null

  const kind = thumb.video ? 'video' : 'photo'
  const playing = thumb.video !== undefined && unplayable !== thumb.id
  const notes = [
    error,
    thumb.video && !playing ? `This clip can't be played here. Open it in your video player: ${thumb.path ?? thumb.name}` : null,
  ].filter(Boolean)

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={thumb.name ?? 'Photo'}
        className="fixed inset-0 z-50 flex flex-col bg-[#0a0a0a]/95 p-4 text-[#fafafa]"
        onClick={onClose}
      >
        <div className="flex flex-wrap items-center justify-between gap-3" onClick={(e) => e.stopPropagation()}>
          <p className="min-w-0 truncate font-mono text-sm">
            {thumb.name} · {index + 1} of {thumbs.length}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-[#d4d4d4]">
              {thumb.placed ? 'You put it in' : 'Sorted into'}
              <select
                value={thumb.moment ?? UNSORTED}
                disabled={busy}
                onChange={(e) => {
                  const moment = e.target.value === AUTO ? null : e.target.value
                  run(() => onMove(thumb, moment))
                }}
                className={`${control} max-w-48 bg-[#0a0a0a] text-[#fafafa] [color-scheme:dark]`}
              >
                {moments.map((m) => (
                  <option key={m}>{m}</option>
                ))}
                <option>{UNSORTED}</option>
                {thumb.placed && <option value={AUTO}>Let KuhaGo decide</option>}
              </select>
            </label>
            <button
              type="button"
              aria-pressed={!!thumb.favorite}
              disabled={busy}
              onClick={() => run(() => onFavorite(thumb, !thumb.favorite))}
              className={`${control} ${thumb.favorite ? 'bg-[#fafafa] text-[#0a0a0a]' : ''}`}
            >
              {thumb.favorite ? '★' : '☆'} {term('select', mode)}
            </button>
            <button type="button" disabled={busy} onClick={() => setRemoving(true)} className={control}>
              Remove from event
            </button>
            <button type="button" autoFocus onClick={onClose} className={control}>
              Close
            </button>
          </div>
        </div>
        {suggest && (
          <div
            className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#737373] px-4 py-2.5 text-sm"
            onClick={(e) => e.stopPropagation()}
          >
            {thumb.moment === suggest ? (
              <p role="status">✓ Now under {suggest}.</p>
            ) : (
              <>
                <p>
                  Is this <strong>{suggest}</strong>? KuhaGo wasn't sure enough to put it there.
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => onMove(thumb, suggest))}
                  className="rounded-xl bg-[#fafafa] px-4 py-2 font-display text-sm font-semibold text-[#0a0a0a] disabled:opacity-40"
                >
                  Yes, this is {suggest}
                </button>
              </>
            )}
          </div>
        )}
        {notes.map((note) => (
          <p key={note} role="status" className="mt-2 break-all text-sm text-[#d4d4d4]" onClick={(e) => e.stopPropagation()}>
            {note}
          </p>
        ))}
        <div className="mt-3 flex min-h-0 flex-1 items-center gap-3">
          <button
            type="button"
            aria-label={`Previous ${kind}`}
            disabled={index === 0}
            onClick={(e) => {
              e.stopPropagation()
              onIndex(index - 1)
            }}
            className={control}
          >
            ←
          </button>
          {playing ? (
            <video
              key={thumb.id}
              src={thumb.video}
              poster={thumb.full}
              controls
              autoPlay
              onError={() => setUnplayable(thumb.id)}
              onClick={(e) => e.stopPropagation()}
              className="mx-auto max-h-full min-w-0 max-w-full rounded-lg"
            />
          ) : (
            <img
              src={thumb.full ?? thumb.src}
              alt={thumb.name ?? ''}
              onClick={(e) => e.stopPropagation()}
              className="mx-auto max-h-full min-w-0 max-w-full rounded-lg object-contain"
            />
          )}
          <button
            type="button"
            aria-label={`Next ${kind}`}
            disabled={index === last}
            onClick={(e) => {
              e.stopPropagation()
              onIndex(index + 1)
            }}
            className={control}
          >
            →
          </button>
        </div>
      </div>
      {removing && (
        <Confirm
          title={`Remove this ${kind} from the event?`}
          confirmLabel="Remove from event"
          onConfirm={() => onRemove(thumb)}
          onClose={() => setRemoving(false)}
        >
          <p>
            KuhaGo forgets <span className="font-mono">{thumb.name}</span> in this event. The original file on your computer is
            not deleted, and it comes back if you organize its folder again.
          </p>
        </Confirm>
      )}
    </>
  )
}
