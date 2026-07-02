// NO-DESIGN-LAYER fixture helper — plain feature code, no design system.
export function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
