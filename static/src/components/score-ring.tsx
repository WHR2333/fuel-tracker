// SVG score ring used on the Stats → Behavior tab.
// score in [0,100], color buckets match v4 (≥80 green, ≥60 blue, ≥40 orange, <40 red).

interface Props {
  score: number;
  size?: number;
}

export function ScoreRing({ score, size = 120 }: Props) {
  const r = 45;
  const c = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, score)) / 100) * c;

  const color =
    score >= 80 ? "#10b981"
    : score >= 60 ? "#3b82f6"
    : score >= 40 ? "#f59e0b"
    : "#ef4444";

  return (
    <div className="score-ring" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--border)" strokeWidth="8" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
        />
      </svg>
      <div className="score-text">
        <div className="score-num" style={{ color }}>{score}</div>
        <div className="score-label">驾驶评分</div>
      </div>
    </div>
  );
}