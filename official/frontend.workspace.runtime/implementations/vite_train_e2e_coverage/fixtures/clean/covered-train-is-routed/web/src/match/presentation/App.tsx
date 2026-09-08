// The router renders the train the spec claims to cover, so the spec exercises a
// rendered surface rather than a null branch.
import { TrainView } from "./TrainView";

const RESOLVE_TRAIN = "9007-resolve-match";

export function App({ route }: { route: string }) {
  if (route === "/match/resolve") return <TrainView trainId={RESOLVE_TRAIN} />;
  return null;
}
