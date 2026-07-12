// Vehicle dropdown — used by both the header and the records-list page.
// Two widths are exposed via the `compact` prop:
//   default — full width (header uses this)
//   compact — narrower, sits to the left of a sibling icon on overview
// The selected vehicle's model renders underneath in muted text.

import * as React from "react";
import type { Vehicle } from "@/lib/types";
import { vehicleLabel } from "@/lib/format";

interface Props {
  vehicles: Vehicle[];
  activeId: string | null;
  onSelect: (id: string) => void;
  compact?: boolean;
  centered?: boolean;
}

export function VehicleSelect({ vehicles, activeId, onSelect, compact, centered }: Props) {
  if (vehicles.length === 0) return null;
  const active = vehicles.find((v) => v.id === activeId) ?? vehicles[0];
  const modelText = active.model?.trim() ? active.model : `油箱 ${active.tank} L`;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginTop: 8,
        ...(centered ? { justifyContent: "center" } : undefined),
      }}
    >
      <select
        className="form-input"
        value={active.id}
        onChange={(e) => onSelect(e.target.value)}
        aria-label="选择车辆"
        style={{
          padding: "6px 10px",
          fontSize: 13,
          background: "var(--card2)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          color: "var(--text)",
          ...(compact ? { maxWidth: 200 } : undefined),
        }}
      >
        {vehicles.map((v) => (
          <option key={v.id} value={v.id}>
            {vehicleLabel(v)}
          </option>
        ))}
      </select>
      <span style={{ fontSize: 12, color: "var(--text2)", whiteSpace: "nowrap" }}>
        {modelText}
      </span>
    </div>
  );
}