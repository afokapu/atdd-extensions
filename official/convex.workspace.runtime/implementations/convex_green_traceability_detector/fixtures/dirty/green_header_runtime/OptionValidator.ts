// URN: component:resolve-dilemmas:choose-option:OptionValidator:backend:domain
// Tested-By:
// - test:resolve-dilemmas:choose-option:WMBT-CONVEX-001-validates-option
// Purpose: Validate a chosen option against the currently open dilemma

export interface Option { id: string }

export function validateOption(o: Option, open: string[]): boolean {
  return open.includes(o.id)
}
