// URN: component:resolve-dilemmas:choose-option:OptionValidator:backend:domain
// Runtime: convex
// Purpose: Validate a chosen option against the currently open dilemma

export interface Option { id: string }

export function validateOption(o: Option, open: string[]): boolean {
  return open.includes(o.id)
}
