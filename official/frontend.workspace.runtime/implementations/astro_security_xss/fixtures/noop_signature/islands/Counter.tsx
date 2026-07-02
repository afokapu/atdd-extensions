// A pure Vite/React island `.tsx` with NO sibling `.astro` file in the tree.
// It DOES contain a real XSS sink — `dangerouslySetInnerHTML`. If the Astro
// security-xss detector scanned `.tsx` here it WOULD flag this line; the fact
// that it emits ZERO proves the file-signature guard no-oped (no `.astro` in tree).
import { useState } from "react";

export function Counter({ markup }: { markup: string }) {
  const [n, setN] = useState(0);
  return (
    <button onClick={() => setN(n + 1)} dangerouslySetInnerHTML={{ __html: markup }} />
  );
}
