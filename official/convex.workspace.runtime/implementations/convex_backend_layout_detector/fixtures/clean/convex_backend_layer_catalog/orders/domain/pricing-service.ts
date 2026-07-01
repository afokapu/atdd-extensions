// URN: component:orders:pricing:Pricing:backend:domain
// Runtime: convex
// Correctly placed under the canonical `domain/` layer; component type ('service')
// is expressed as the file SUFFIX, not as a directory.
import type { Money } from '@shared/domain/types'

export function priceOrder(subtotal: Money, taxRate: number): Money {
  return Math.round(subtotal * (1 + taxRate)) as Money
}
