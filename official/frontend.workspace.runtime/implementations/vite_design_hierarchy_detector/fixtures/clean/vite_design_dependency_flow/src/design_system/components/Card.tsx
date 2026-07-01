import { Button } from "../primitives/Button";
import { spacing } from "../tokens/spacing";

export function Card({ title }: { title: string }) {
  return (
    <section style={{ gap: spacing.m }}>
      <h2>{title}</h2>
      <Button label="ok" />
    </section>
  );
}
