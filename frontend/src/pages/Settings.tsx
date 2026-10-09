import { Link } from 'react-router-dom'
import { setSidecarMode, useSidecarMode } from '../api/data'
import { SIDECAR_OPTIONS } from '../components/ProGig'
import { ModeToggle, Page } from '../components/ui'
import { useMode } from '../lib/mode'
import { backLink, card } from '../lib/styles'

export default function Settings() {
  const { mode } = useMode()
  const sidecarMode = useSidecarMode()

  return (
    <Page pro={mode === 'pro'} width="max-w-2xl">
      <Link to="/" className={backLink}>
        ← Back
      </Link>
      <h1 className="mt-1 text-4xl font-bold tracking-tight">Settings</h1>

      <section className={`${card} mt-7 flex flex-wrap items-center justify-between gap-4 p-5`}>
        <div>
          <h2 className="text-lg font-semibold">Mode</h2>
          <p className="text-sm text-neutral-600">Personal for your own photos, Pro if you shoot for clients.</p>
        </div>
        <ModeToggle />
      </section>

      {mode === 'pro' && (
        <section className={`${card} mt-4 p-5`}>
          <h2 className="text-lg font-semibold">Sidecar mode</h2>
          <p className="text-sm text-neutral-600">Which editor should read the keywords KuhaGo writes?</p>
          <div className="mt-3 space-y-1.5">
            {SIDECAR_OPTIONS.map((option) => (
              <label key={option.mode} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="sidecar"
                  className="accent-neutral-950"
                  checked={sidecarMode === option.mode}
                  onChange={() => setSidecarMode(option.mode)}
                />
                <span className="font-display font-medium">{option.label}</span>
                <span className="font-mono text-xs text-neutral-600">{option.example}</span>
              </label>
            ))}
          </div>
        </section>
      )}
    </Page>
  )
}
