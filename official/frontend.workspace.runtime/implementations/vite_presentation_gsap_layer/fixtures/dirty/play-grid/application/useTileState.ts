// DIRTY fixture — gsap is imported in the application layer, coupling business
// logic to a view-motion concern. Expected: 1 violation at the import.
import { gsap } from "gsap"; // ← coder.vite.presentation-gsap-layer

// The hook hands the motion library down to whatever it returns; the offence is
// the import living in `application/` at all — animation belongs in presentation.
export function useTileState() {
  return { motion: gsap, ready: true };
}
