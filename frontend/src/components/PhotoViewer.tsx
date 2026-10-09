import { useEffect } from 'react'
import type { Thumb as ThumbData } from '../api/data'
import { useAction } from '../lib/useAction'
import { Notice } from './ui'

const control = 'rounded-xl border border-[#737373] px-4 py-2 font-display text-sm font-semibold hover:border-[#fafafa] disabled:opacity-40'

// One photo, large, over the page: step through the grid it was opened from, or take it out of the event.
// Colours are literal on purpose: the viewer stays dark in both themes.
export default function PhotoViewer({
  thumbs,
  index,
  onIndex,
  onClose,
  onRemove,
}: {
  thumbs: ThumbData[]
  index: number
  onIndex: (index: number) => void
  onClose: () => void
  onRemove: (thumb: ThumbData) => Promise<void>
}) {
  const { error, run } = useAction()
  const thumb = thumbs[index]
  const last = thumbs.length - 1

  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1)
      else if (e.key === 'ArrowRight' && index < last) onIndex(index + 1)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [index, last, onClose, onIndex])

  if (!thumb) return null

  function remove() {
    const ask = 'Remove this photo from the event? The original file on your computer is not deleted.'
    if (window.confirm(ask)) run(() => onRemove(thumb))
  }

  return (
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
        <div className="flex gap-2">
          <button type="button" onClick={remove} className={control}>
            Remove from event
          </button>
          <button type="button" autoFocus onClick={onClose} className={control}>
            Close
          </button>
        </div>
      </div>
      <Notice>{error}</Notice>
      <div className="mt-3 flex min-h-0 flex-1 items-center gap-3">
        <button
          type="button"
          aria-label="Previous photo"
          disabled={index === 0}
          onClick={(e) => {
            e.stopPropagation()
            onIndex(index - 1)
          }}
          className={control}
        >
          ←
        </button>
        <img
          src={thumb.full ?? thumb.src}
          alt={thumb.name ?? ''}
          onClick={(e) => e.stopPropagation()}
          className="mx-auto max-h-full min-w-0 max-w-full rounded-lg object-contain"
        />
        <button
          type="button"
          aria-label="Next photo"
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
  )
}
