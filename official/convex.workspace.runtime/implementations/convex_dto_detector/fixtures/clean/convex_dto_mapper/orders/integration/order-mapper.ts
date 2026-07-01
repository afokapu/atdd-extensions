// URN: component:orders:order:OrderMapper:backend:integration
// Runtime: convex
// DTO<->domain mapper correctly placed in the integration layer.
import type { OrderDTO } from '@shared/contracts/orders/order'
import type { Order } from '../domain/order'

export function dtoToDomain(dto: OrderDTO): Order {
  return { id: dto.id, total: dto.total }
}
export function domainToDto(entity: Order): OrderDTO {
  return { id: entity.id, total: entity.total }
}
