// URN: component:application:app:App:frontend:presentation
// Runtime: vite
// Purpose: Route table — journeys render via <TrainView>, not direct screens

import { Routes, Route } from 'react-router-dom'
import { TrainView } from '@game/application/TrainView'

export default function App() {
  return (
    <Routes>
      <Route path="/host/:id" element={<TrainView trainId="3001-host-a-match" />} />
    </Routes>
  )
}
