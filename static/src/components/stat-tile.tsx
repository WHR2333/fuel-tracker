// Stat tile — one cell of the overview 8-tile grid.

interface Props {
  value: string | number;
  label: string;
  color?: "blue" | "green" | "orange" | "red" | "purple";
}

const COLOR_CLASS: Record<NonNullable<Props["color"]>, string> = {
  blue: "stat-value",
  green: "stat-value green",
  orange: "stat-value orange",
  red: "stat-value red",
  purple: "stat-value purple",
};

export function StatTile({ value, label, color = "blue" }: Props) {
  return (
    <div className="stat-tile">
      <div className={COLOR_CLASS[color]}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}