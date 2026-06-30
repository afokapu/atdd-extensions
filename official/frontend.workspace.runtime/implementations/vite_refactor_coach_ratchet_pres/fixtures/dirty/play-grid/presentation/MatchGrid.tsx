// DIRTY fixture — a presentation component gutted to a stub during a ratchet pass:
// it still exports (structural validators stay green) but renders nothing, so the
// match-grid feature it used to draw has silently vanished. This is exactly the
// core #358 smell. Expected: 1 advisory violation at the empty return.
export function MatchGrid() {
  // TODO: the grid render was trimmed out; needs recorded smoke evidence.
  return null;
}
