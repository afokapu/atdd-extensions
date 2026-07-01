// URN: component:orders:pricing:Pricing:backend:domain
// Runtime: convex
// Organized under a component-type directory (`services/`) instead of a layer dir.
export function priceOrder(subtotal: number, taxRate: number): number {
  return Math.round(subtotal * (1 + taxRate))
}
