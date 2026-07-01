// URN: component:orders:order:OrderApi:backend:presentation
// Runtime: convex
// presentation -> application is an allowed edge; @shared/domain resolves to the
// domain layer (presentation -> domain also allowed).
import { createOrder } from '../application/create-order'
import type { Money } from '@shared/domain/types'

export async function postOrder(subtotal: Money): Promise<void> {
  await createOrder(subtotal)
}
