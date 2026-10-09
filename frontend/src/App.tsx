import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useStatus } from './api/data'
import { ModeProvider, useMode } from './lib/mode'
import EventDetail from './pages/EventDetail'
import Events from './pages/Events'
import Export from './pages/Export'
import Finals from './pages/Finals'
import AskOwl from './pages/AskOwl'
import Settings from './pages/Settings'
import Welcome from './pages/Welcome'

function AppRoutes() {
  const { mode } = useMode()
  // Wait for the first load so event pages don't flash "Not found".
  if (!useStatus().loaded) return null

  return (
    <Routes>
      {/* First launch: the home screen is the mode pick until one is chosen. */}
      <Route path="/" element={mode ? <Events /> : <Welcome />} />
      <Route path="/events/:eventId" element={<EventDetail />} />
      <Route path="/events/:eventId/export" element={<Export />} />
      <Route path="/events/:eventId/finals" element={<Finals />} />
      <Route path="/events/:eventId/owl" element={<AskOwl />} />
      <Route path="/settings" element={mode ? <Settings /> : <Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <ModeProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </ModeProvider>
  )
}
