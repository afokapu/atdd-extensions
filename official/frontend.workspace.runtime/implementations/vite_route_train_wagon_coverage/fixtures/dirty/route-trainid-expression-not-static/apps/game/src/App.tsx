// URN: component:application:app:App:frontend:presentation
// Runtime: vite
// Purpose: Route table — journeys render via <TrainView>, not direct screens

import { Routes, Route } from 'react-router-dom'
import { TrainView } from '@game/application/TrainView'

export default function App({ route }: { route: { trainId: string } }) {
  return (
    <Routes>
      <Route path="/dynamic" element={<TrainView trainId={route.trainId} />} />
    </Routes>
  )
}
