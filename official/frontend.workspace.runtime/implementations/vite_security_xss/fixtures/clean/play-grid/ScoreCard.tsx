// Clean: renders untrusted content as TEXT — no HTML injection sink.
import { useEffect, useRef } from "react";

interface ScoreCardProps {
  playerName: string;
  summaryHtml: string;
}

export function ScoreCard({ playerName, summaryHtml }: ScoreCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      // Assigning textContent escapes markup — safe.
      ref.current.textContent = summaryHtml;
    }
  }, [summaryHtml]);

  // Reading innerHTML for a length check is not a sink (no assignment).
  const currentLength = ref.current?.innerHTML.length ?? 0;

  return (
    <section aria-label={`score for ${playerName}`}>
      <h3>{playerName}</h3>
      <div ref={ref} data-length={currentLength} />
    </section>
  );
}
