// URN: component:shared:guarded:GuardedPanel:frontend:presentation
// Runtime: vite

export function GuardedPanel({ loading, items }: { loading: boolean; items: string[] }) {
  if (loading) return null;
  return (
    <ul className="items">
      {items.map((i) => (
        <li key={i}>{i}</li>
      ))}
    </ul>
  );
}
