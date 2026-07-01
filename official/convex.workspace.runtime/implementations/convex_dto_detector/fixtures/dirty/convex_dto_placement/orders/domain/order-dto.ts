// URN: component:orders:order:OrderDTO:backend:domain
// Runtime: convex
// A *DTO type declared inside a wagon's domain layer instead of the neutral
// contracts/ namespace — mis-placed cross-boundary type.
export interface OrderDTO {
  readonly id: string
  readonly total: number
}
