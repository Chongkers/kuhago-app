// Shared class strings so buttons and surfaces look the same on <button> and <Link>.

const btnBase =
  'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-display text-sm font-semibold transition-colors disabled:opacity-50'

export const btnPrimary = `${btnBase} bg-neutral-950 text-white hover:bg-neutral-800`
export const btnSecondary = `${btnBase} border border-neutral-400 bg-white hover:border-neutral-950`

export const card = 'rounded-2xl border border-neutral-200 bg-white shadow-sm'
export const panel = 'rounded-2xl bg-neutral-100'
export const input =
  'w-full rounded-xl border border-neutral-400 bg-white px-4 py-2.5 text-sm outline-none focus:border-neutral-950'
export const backLink = 'text-sm text-neutral-600 hover:text-neutral-950'
