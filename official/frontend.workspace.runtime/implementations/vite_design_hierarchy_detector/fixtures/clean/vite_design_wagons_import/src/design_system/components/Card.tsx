// Design-system code imports only within the design system (and external libs).
import React from "react";
import { Button } from "../primitives/Button";

export function Card({ title }: { title: string }) {
  return (
    <section>
      <h2>{title}</h2>
      <Button label="ok" />
    </section>
  );
}
