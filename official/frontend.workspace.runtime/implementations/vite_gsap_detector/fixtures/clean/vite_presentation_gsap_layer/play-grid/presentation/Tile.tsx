// CLEAN fixture — gsap is imported and used inside the presentation layer, which
// is its sanctioned home. Expected: 0 violations.
import { gsap } from "gsap";

export function Tile() {
  const onMount = (el: HTMLDivElement | null) => {
    if (el) gsap.to(el, { scale: 1, duration: 0.2 });
  };
  return <div ref={onMount} className="tile" />;
}
