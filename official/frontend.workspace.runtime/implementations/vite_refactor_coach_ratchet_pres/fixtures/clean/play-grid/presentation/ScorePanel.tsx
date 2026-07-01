// CLEAN fixture — a presentation component that still renders real markup. There
// is nothing trimmed away here. Expected: 0 violations.
export function ScorePanel({ score }: { score: number }) {
  return (
    <div className="score-panel">
      <span className="score-panel__label">Score</span>
      <strong className="score-panel__value">{score}</strong>
    </div>
  );
}
