// VIOLATION: design-system code reaching OUT into a feature wagon (two ways).
import React from "react";
import { fetchCart } from "../../features/checkout/api";
import { CartState } from "@/features/checkout/state";
import { Button } from "../primitives/Button";

export function BadCard() {
  return (
    <section>
      <Button label={String(fetchCart)} />
      <span>{String(CartState)}</span>
    </section>
  );
}
