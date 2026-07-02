// NO-DESIGN-LAYER fixture (the FRG consumer case): real feature/component code in a
// plain src/features tree with NO design_system/ layer (no tokens/, primitives/,
// components/ under a design system). The hierarchy rules (dependency-flow,
// tokens-pure, wagons-import) PRESUPPOSE a design system, so they are OUT OF SCOPE
// here and emit ZERO violations.
import { formatMoney } from "./money";

export function Cart({ cents }: { cents: number }) {
  return <div className="cart">{formatMoney(cents)}</div>;
}
