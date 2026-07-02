// NO-DESIGN-LAYER fixture. `deadHelper` is exported but imported by nothing and is
// not a Convex API entry — it WOULD fire coder.convex.design-orphan-export if the
// design rules were in scope. With no design layer present, the detector no-ops.
export function totalUseCase(a: number, b: number): number {
  return a + b;
}

export function deadHelper(x: number): number {
  return x * 2;
}
