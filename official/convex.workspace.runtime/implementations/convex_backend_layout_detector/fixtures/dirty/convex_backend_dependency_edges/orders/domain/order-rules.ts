// URN: component:orders:order:OrderRules:backend:domain
// Runtime: convex
// Domain importing from application inverts the dependency direction:
// domain -> application is NOT an allowed edge.
import { applyTax } from '../application/tax-policy'

export function totalWithTax(subtotal: number): number {
  return applyTax(subtotal)
}
