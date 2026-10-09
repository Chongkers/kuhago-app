import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ModeProvider, useMode } from './lib/mode'
import EventDetail from './pages/EventDetail'
import Events from './pages/Events'
import Settings from './pages/Settings'
import Welcome from './pages/Welcome'

function AppRoutes() {
  const { mode } = useMode()

  // First launch: nothing is reachable until a mode is picked.
  if (!mode) {
    return (
      <Routes>
        <Route path="*" element={<Welcome />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route path="/" element={<Events />} />
      <Route path="/events/:eventId" element={<EventDetail />} />
      <Route path="/settings" element={<Settings />} />
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
