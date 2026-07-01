// ANTI-PATTERN: a "token" file that imports react, renders a widget, and branches.
import React from "react";

export const spacing = { s: 8, m: 16 } as const;

export function ThemeBadge({ dark }: { dark: boolean }) {
  if (dark) {
    return <span className="dark">tokens are not widgets</span>;
  }
  return <span>light</span>;
}
