// URN: component:application:app:App:frontend:presentation
// Runtime: vite
// Purpose: Route table — journeys render via <TrainView>, not direct screens

import { Routes, Route } from 'react-router-dom'
import { TrainView } from '@game/application/TrainView'

export default function App() {
  return (
    <Routes>
      <Route path="/ghost" element={<TrainView trainId="9999-ghost-train" />} />
    </Routes>
  )
}
