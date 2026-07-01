// URN: component:shared:contracts:Invoice:backend:domain
// Runtime: convex
// Placed in contracts/ (placement OK) but impure: carries a method member and a
// mutable (non-readonly) field.
export interface InvoiceDTO {
  readonly id: string
  amount: number
  total(): number
}
