import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useStatus } from './api/data'
import { ModeProvider, useMode } from './lib/mode'
import { ProfileProvider, useProfiles } from './lib/profile'
import EventDetail from './pages/EventDetail'
import Events from './pages/Events'
import Export from './pages/Export'
import Finals from './pages/Finals'
import Settings from './pages/Settings'
import Owl from './pages/Owl'
import Profiles from './pages/Profiles'
import Search from './pages/Search'
import Welcome from './pages/Welcome'

function AppRoutes() {
  const { mode } = useMode()
  const { active } = useProfiles()
  const { loaded } = useStatus()
  // Nobody is logged in: pick or create a local profile first.
  if (!active) return <Profiles />
  // Wait for the first load so event pages don't flash "Not found".
  if (!loaded) return null

  return (
    <Routes>
      {/* First launch: the home screen is the mode pick until one is chosen. */}
      <Route path="/" element={mode ? <Events /> : <Welcome />} />
      <Route path="/events/:eventId" element={<EventDetail />} />
      <Route path="/events/:eventId/export" element={<Export />} />
      <Route path="/events/:eventId/finals" element={<Finals />} />
      <Route path="/events/:eventId/owl" element={<Owl />} />
      <Route path="/search" element={<Search />} />
      <Route path="/owl" element={<Owl />} />
      <Route path="/settings" element={mode ? <Settings /> : <Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <ProfileProvider>
      <ModeProvider>
        {/* Hash routes: page paths like /events/3 are also API paths on the same server. */}
        <HashRouter>
          <AppRoutes />
        </HashRouter>
      </ModeProvider>
    </ProfileProvider>
  )
}
