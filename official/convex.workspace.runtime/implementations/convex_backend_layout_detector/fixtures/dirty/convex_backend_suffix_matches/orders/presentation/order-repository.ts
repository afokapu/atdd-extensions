// URN: component:orders:order:OrderRepository:backend:presentation
// Runtime: convex
// Suffix '-repository' is an INTEGRATION component type, but this file lives under
// presentation/ — the filename advertises the wrong layer.
export async function findOrder(id: string): Promise<unknown> {
  return { id }
}
