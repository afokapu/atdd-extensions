// URN: component:application:app:App:frontend:presentation
// Runtime: vite
// Purpose: Route table — journeys render via <TrainView>, not direct screens

import { Routes, Route } from 'react-router-dom'
import { TrainView } from '@game/application/TrainView'

const PLAY_TRAIN = "3002-play-a-match"

export default function App() {
  return (
    <Routes>
      <Route path="/tournament/:code" element={<TrainView trainId={PLAY_TRAIN} />} />
    </Routes>
  )
}
