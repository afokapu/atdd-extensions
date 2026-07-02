// NO-DESIGN-LAYER fixture (the FRG consumer case): real Convex feature code with
// api/application layers but NO domain.ts foundation AND no `design/` layer marker
// anywhere in the scanned tree. If the design rules were IN SCOPE this would fire
// coder.convex.design-foundations (upper layer, missing domain foundation). Because
// there is no design layer, the detector is OUT OF SCOPE and emits ZERO violations.
import { query } from "../_generated/server";
import { v } from "convex/values";
import { totalUseCase } from "./application";

export const total = query({
  args: { a: v.number(), b: v.number() },
  handler: async (_ctx, a) => totalUseCase(a.a, a.b),
});
