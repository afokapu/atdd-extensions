import { spacing, radii } from "../tokens/spacing";

export function Button({ label }: { label: string }) {
  return <button style={{ padding: spacing.m, borderRadius: radii.md }}>{label}</button>;
}
