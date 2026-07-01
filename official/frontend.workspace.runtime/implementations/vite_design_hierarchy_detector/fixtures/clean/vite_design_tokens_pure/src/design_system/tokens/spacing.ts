// Pure design tokens — spacing, radii, motion. Values only, no widgets, no logic.
export const spacing = {
  xs: 4,
  s: 8,
  m: 16,
  l: 24,
  xl: 32,
} as const;

export const radii = {
  sm: 4,
  md: 8,
  lg: 16,
} as const;

export const motion = {
  base: 250,
  fast: 120,
} as const;

export type Spacing = keyof typeof spacing;
