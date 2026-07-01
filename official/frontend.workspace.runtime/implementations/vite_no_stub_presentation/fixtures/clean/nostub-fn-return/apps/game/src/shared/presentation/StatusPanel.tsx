// URN: component:shared:status:StatusPanel:frontend:presentation
// Runtime: vite

export function StatusPanel({ label }: { label: string }) {
  return <div className="status">{label}</div>;
}
