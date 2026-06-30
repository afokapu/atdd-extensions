// VIOLATION: an exported React component that no other file in the codebase ever
// imports — dead, disconnected UI (orphan).
export function OrphanCard({ title }: { title: string }) {
  return <section className="card">{title}</section>
}
