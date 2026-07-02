// A pure Vite/React `.tsx` with NO `.astro` sibling. It DOES contain a silently
// swallowed catch — if the Astro logging detector scanned `.tsx` here it WOULD flag
// it; emitting ZERO proves the file-signature guard no-oped (no `.astro` in tree).
export async function loadScores(): Promise<number[]> {
  try {
    const res = await fetch("/api/scores");
    return await res.json();
  } catch (e) {
    return [];
  }
}
