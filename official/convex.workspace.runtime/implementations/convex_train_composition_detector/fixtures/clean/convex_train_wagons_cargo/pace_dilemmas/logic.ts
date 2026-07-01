// URN: component:pace-dilemmas:reducer:domain:backend:domain
// Runtime: convex
// Clean: imports stay within the wagon (./) and shared layers (../shared) only.
import { pairFragments } from './application/pair'
import { Cargo } from '../shared/cargo'

export function pace(cargo: Cargo) {
  return pairFragments(cargo.get('fragments'))
}
