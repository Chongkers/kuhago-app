function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const MONTH_DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
const FULL = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const LIST = new Intl.ListFormat('en', { type: 'conjunction' })

// "Oct 4, 2026", or "Aug 15–17, 2026" for a multi-day event in one month.
export function formatDate(date: string, endDate?: string): string {
  if (!date) return 'No date'
  const start = parseISODate(date)
  if (!endDate || endDate === date) return FULL.format(start)
  const end = parseISODate(endDate)
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${MONTH_DAY.format(start)}–${end.getDate()}, ${end.getFullYear()}`
  }
  return `${FULL.format(start)} – ${FULL.format(end)}`
}

export function peso(amount: number): string {
  return `₱${amount.toLocaleString('en-US')}`
}

export function count(n: number, unit: string): string {
  return `${n.toLocaleString('en-US')} ${unit}${n === 1 ? '' : 's'}`
}

export function listOf(items: string[]): string {
  return LIST.format(items)
}

export function todayISO(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}
