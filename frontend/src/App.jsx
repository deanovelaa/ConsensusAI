// App.jsx — the router
// Think of this as the map of the entire app.
// BrowserRouter handles URL changes without page reloads.
// Routes maps each URL pattern to the right page component.

import { BrowserRouter, Routes, Route } from 'react-router-dom'
import CreatePoll from './pages/CreatePoll'
import VoterPage from './pages/VoterPage'
import AdminDashboard from './pages/AdminDashboard'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Home: poll creator flow */}
        <Route path="/" element={<CreatePoll />} />

        {/* Voter flow: /poll/abc123 */}
        <Route path="/poll/:pollId" element={<VoterPage />} />

        {/* Owner dashboard: /poll/abc123/admin?token=xxx */}
        <Route path="/poll/:pollId/admin" element={<AdminDashboard />} />
      </Routes>
    </BrowserRouter>
  )
}
