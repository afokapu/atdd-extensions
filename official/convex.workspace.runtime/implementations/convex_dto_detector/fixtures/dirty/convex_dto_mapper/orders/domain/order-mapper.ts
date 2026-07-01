// URN: component:orders:order:OrderMapper:backend:domain
// Runtime: convex
// DTO<->domain mapper living in the domain layer instead of integration/.
import type { OrderDTO } from '@shared/contracts/orders/order'
import type { Order } from './order'

export function dtoToDomain(dto: OrderDTO): Order {
  return { id: dto.id, total: dto.total }
}
export function domainToDto(entity: Order): OrderDTO {
  return { id: entity.id, total: entity.total }
}
