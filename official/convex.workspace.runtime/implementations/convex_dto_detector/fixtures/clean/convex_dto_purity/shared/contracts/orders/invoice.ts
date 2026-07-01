// URN: component:shared:contracts:Invoice:backend:domain
// Runtime: convex
// Pure, immutable DTO: readonly data fields only, no methods.
export interface InvoiceDTO {
  readonly id: string
  readonly amount: number
  readonly currency: string
}
