import type { ExportPlan } from '../api/client'

export type PlanRow = { depth: number; name: string; count?: string }

// Folder tree of the backend's dry-run plan, in its layout order, with files per folder.
export function planRows(plan: ExportPlan): PlanRow[] {
  const files = new Map<string, number>()
  for (const { dest } of plan.copies) {
    const dirs = dest.split('/').slice(1, -1) // drop root and file name
    dirs.forEach((_, i) => {
      const dir = dirs.slice(0, i + 1).join('/')
      files.set(dir, (files.get(dir) ?? 0) + (i === dirs.length - 1 ? 1 : 0))
    })
  }
  return [...files].map(([dir, n]) => ({
    depth: dir.split('/').length,
    name: `${dir.split('/').pop()}/`,
    count: n > 0 ? String(n) : undefined,
  }))
}
