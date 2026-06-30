// A domain module that has leaked infrastructure inward — three distinct
// violations, one per line:
import { v } from "convex/values";
import { internal } from "../_generated/api";

export type Vote = { choice: "yes" | "no" };

// references the Convex request context — domain code must be pure
export const persist = (ctx) => null;

export const argsShape = v;
export const ref = internal;
