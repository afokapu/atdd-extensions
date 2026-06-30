// DIRTY fixture — a presentation component imports gsap directly instead of going
// through the shared animation-commons module. Expected: 1 violation at the import.
import { gsap } from "gsap"; // ← coder.vite.presentation-gsap-commons

// `animate` is handed the imported library; the offence is the import itself —
// presentation code must reach motion only via the shared animation-commons seam.
export function Board() {
  return <div ref={(el) => animate(el, gsap)} className="board" />;
}

function animate(el: Element | null, lib: typeof gsap) {
  if (el) lib.to(el, { opacity: 1, duration: 0.3 });
}
