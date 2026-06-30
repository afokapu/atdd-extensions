// CLEAN fixture — gsap lives in the shared animation-commons module, which is its
// one sanctioned home. Expected: 0 violations.
import { gsap } from "gsap";

/** Fade a node in over `duration` seconds. The single auditable animation seam. */
export function fadeIn(target: Element, duration = 0.3): void {
  gsap.to(target, { opacity: 1, duration });
}
