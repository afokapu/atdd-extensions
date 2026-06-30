// Root component. Imports Button (so Button is connected) and is itself imported
// by main.tsx (so App is connected). No orphan components in this tree.
import { Button } from './Button'

export default function App() {
  return <Button label="play" />
}
