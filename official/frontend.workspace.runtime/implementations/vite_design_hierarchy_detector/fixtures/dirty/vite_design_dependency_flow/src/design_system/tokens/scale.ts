// VIOLATION: a token file reaching UP into the primitives layer.
import { Button } from "../primitives/Button";

export const scale = { base: Button.name.length } as const;
