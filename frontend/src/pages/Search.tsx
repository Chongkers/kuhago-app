import { useState, type FormEvent } from 'react'
import { searchMedia, type Thumb as ThumbData } from '../api/data'
import { Page } from '../components/Shell'
import { Notice, Thumb } from '../components/ui'
import { btnPrimary, input } from '../lib/styles'
import { useAction } from '../lib/useAction'

// Search across every event on this laptop.
export default function Search() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ThumbData[] | null>(null)
  const { error, run } = useAction()

  function submit(e: FormEvent) {
    e.preventDefault()
    if (query.trim()) run(async () => setResults(await searchMedia(undefined, query.trim())))
  }

  return (
    <Page width="max-w-5xl">
      <h1 className="text-4xl font-bold tracking-tight">Search</h1>
      <p className="mt-1 text-neutral-600">Describe what's in the photo. Everything is searched on this laptop.</p>
      <form onSubmit={submit} role="search" className="mt-6 flex gap-2">
        <input type="search" autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder='Try "lola with the cake"' aria-label="Search photos" className={input} />
        <button type="submit" className={btnPrimary}>
          Search
        </button>
      </form>
      <Notice>{error}</Notice>
      {results && (
        <section className="mt-7">
          <h2 className="font-semibold">{results.length === 0 ? 'No matches' : 'Best matches'}</h2>
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {results.map((thumb) => (
              <Thumb key={thumb.id} thumb={thumb} className="aspect-square w-full rounded-lg" />
            ))}
          </div>
        </section>
      )}
    </Page>
  )
}
