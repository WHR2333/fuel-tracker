// Horizontal compare bar — label + filled track + optional value.
// Used on the Stats → Compare tab, the Overview → fuel-type breakdown,
// and the Maintenance → cost stats (where amounts are hidden per design).

import * as React from "react";

interface Props {
  label: React.ReactNode;
  value: number;
  pct: number;
  color?: string;
  unit?: string;
  formatValue?: (v: number) => string;
  hideValue?: boolean;
}

export function CompareBar({ label, value, pct, color = "var(--accent)", unit, formatValue, hideValue }: Props) {
  const width = Math.max(0, Math.min(100, pct));
  const valueText = hideValue ? "" : (formatValue ? formatValue(value) : value.toFixed(2));
  return (
    <div className="compare-bar">
      <span className="compare-label">{label}</span>
      <div className="compare-track">
        <div className="compare-fill" style={{ width: `${width}%`, background: color }} />
      </div>
      {hideValue ? null : (
        <span className="compare-value">{valueText}{unit ? ` ${unit}` : ""}</span>
      )}
    </div>
  );
}