import { useState, type ReactNode } from 'react'
import { moveMedia, removeMedia, setFavorite, type EventView, type Thumb as ThumbData } from '../api/data'
import PhotoViewer from './PhotoViewer'
import { Thumb } from './ui'

// opens the viewer on one item of a grid; suggest = the missed moment the grid was offered for
export type OpenViewer = (thumbs: ThumbData[], index: number, suggest?: string) => void

// The photo viewer of one event page. It remembers which photos it was opened on and reads them from the event
// each time, so one that was moved or starred shows as it is now, and one that was removed drops out of the list
// (the viewer closes after the last one).
export function useEventViewer(event: EventView): { open: OpenViewer; isOpen: boolean; element: ReactNode } {
  const [viewing, setViewing] = useState<{ ids: string[]; index: number; suggest?: string } | null>(null)
  const byId = new Map(event.media.map((t) => [t.id, t]))
  const thumbs = viewing ? viewing.ids.flatMap((id) => byId.get(id) ?? []) : []
  const isOpen = viewing !== null && thumbs.length > 0

  return {
    open: (list, index, suggest) => setViewing({ ids: list.map((t) => t.id), index, suggest }),
    isOpen,
    element: isOpen && (
      <PhotoViewer
        thumbs={thumbs}
        index={Math.min(viewing.index, thumbs.length - 1)}
        mode={event.mode}
        moments={event.moments.map((m) => m.moment)}
        suggest={viewing.suggest}
        onIndex={(index) => setViewing({ ...viewing, index })}
        onClose={() => setViewing(null)}
        onRemove={(thumb) => removeMedia(event.id, thumb.id)}
        onMove={(thumb, moment) => moveMedia(event.id, thumb.id, moment)}
        onFavorite={(thumb, favorite) => setFavorite(event.id, thumb.id, favorite)}
      />
    ),
  }
}

// A grid photo or clip that opens large when clicked. A clip carries a play mark, a favorite a star.
// The marks' colours are literal: they sit on the picture, not on the page.
export function Tile({
  thumbs,
  index,
  open,
  className,
  suggest,
}: {
  thumbs: ThumbData[]
  index: number
  open: OpenViewer
  className: string
  suggest?: string
}) {
  const thumb = thumbs[index]
  const mark = 'pointer-events-none absolute rounded bg-[#0a0a0a]/75 px-1.5 py-0.5 text-xs text-[#fafafa]'
  return (
    <button
      type="button"
      onClick={() => open(thumbs, index, suggest)}
      aria-label={`${thumb.video ? 'Play' : 'View'} ${thumb.name ?? 'photo'}${thumb.favorite ? ', favorite' : ''}`}
      className="relative block w-full cursor-zoom-in overflow-hidden rounded-lg hover:opacity-80"
    >
      <Thumb thumb={thumb} className={className} />
      {thumb.video && (
        <span aria-hidden="true" className={`${mark} bottom-1.5 left-1.5`}>
          ▶
        </span>
      )}
      {thumb.favorite && (
        <span aria-hidden="true" className={`${mark} right-1.5 top-1.5`}>
          ★
        </span>
      )}
    </button>
  )
}
