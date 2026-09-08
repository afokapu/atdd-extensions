// BUG: the spec claims to cover train 9007-resolve-match, and no route renders it.
// `page.goto('/match/resolve')` reaches the null branch, so the spec passes while
// asserting against nothing rendered.
import { TrainView } from "./TrainView";

const OTHER_TRAIN = "9008-review-match";

export function App({ route }: { route: string }) {
  if (route === "/match/review") return <TrainView trainId={OTHER_TRAIN} />;
  return null;
}
