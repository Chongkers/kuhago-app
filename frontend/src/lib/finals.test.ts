// Run: node --test src/lib/
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Media } from '../api/client.ts'
import { basename, finalsView } from './finals.ts'

const media = (id: number, path: string, moment: string, rating: number | null) =>
  ({ id, path, moment, rating, kind: 'photo' }) as Media

test('basename handles both separators', () => {
  assert.equal(basename('D:\\Gigs\\Ana\\IMG_0001.CR3'), 'IMG_0001.CR3')
  assert.equal(basename('/Users/me/IMG_0002.CR3'), 'IMG_0002.CR3')
})

test('finalsView maps media ids to files, moments and thumbs', () => {
  const view = finalsView(
    'X:\\Finals',
    {
      matched: [{ final_path: 'X:\\Finals\\ana-01.jpg', media_id: 1, score: 0.934 }],
      unmatched_finals: ['X:\\Finals\\collage.jpg'],
      unedited_selects: [2],
    },
    [media(1, 'D:\\raw\\IMG_1.CR3', 'Vows', 4), media(2, 'D:\\raw\\IMG_2.CR3', 'Kiss', null)],
    (m) => ({ id: String(m.id), tone: m.id }),
  )
  assert.deepEqual(view, {
    folder: 'X:\\Finals',
    selects: 2,
    finals: 2,
    matchedTotal: 1,
    matched: [{ final: 'ana-01.jpg', raw: 'IMG_1.CR3', moment: 'Vows', score: 0.934 }],
    unmatched: [{ file: 'collage.jpg', note: 'No select looked close enough.' }],
    unedited: [{ file: 'IMG_2.CR3', rating: 0, moment: 'Kiss', thumb: { id: '2', tone: 2 } }],
  })
})

test('an empty scan still renders, so unedited selects show', () => {
  const view = finalsView('X:\\Empty', { matched: [], unmatched_finals: [], unedited_selects: [3] }, [media(3, '/r/IMG_3.CR3', 'Kiss', 5)], (m) => ({ id: String(m.id), tone: m.id }))
  assert.equal(view?.unedited.length, 1)
})

test('finalsView is undefined when nothing was scanned', () => {
  assert.equal(finalsView(undefined, { matched: [], unmatched_finals: [], unedited_selects: [3] }, [], () => ({ id: '', tone: 0 })), undefined)
})
