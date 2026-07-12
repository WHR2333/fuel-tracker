// Time-range picker with preset + custom. Used by the overview's four
// stat cards and the records-list page. The picker surfaces as a small
// button; tapping opens a sheet-style menu with options.
//
// Each instance owns its own state — the four cards on overview keep
// their ranges independent.
//
// Custom-range validation:
//   - If one side is filled, both must be filled.
//   - Start must be <= end.

import * as React from "react";
import { CalendarDays } from "lucide-react";

const PRESETS = [
  { key: "3m", label: "最近 3 个月", days: 90 },
  { key: "6m", label: "最近半年", days: 180 },
  { key: "1y", label: "最近 1 年", days: 365 },
  { key: "all", label: "全部", days: null },
];

export interface TimeRange {
  start: string | null;
  end: string | null;
}

interface Props {
  value: TimeRange;
  onChange: (r: TimeRange) => void;
}

const todayISO = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

export function TimeRangePicker({ value, onChange }: Props) {
  const [open, setOpen] = React.useState(false);
  const [showCustom, setShowCustom] = React.useState(false);
  const [customStart, setCustomStart] = React.useState(value.start ?? "");
  const [customEnd, setCustomEnd] = React.useState(value.end ?? "");
  const [error, setError] = React.useState<string | null>(null);

  const matched = PRESETS.find((p) => {
    if (p.days == null) return value.start === null && value.end === null;
    return value.start === daysAgo(p.days) && value.end === todayISO();
  })?.key ?? (value.start || value.end ? "custom" : null);

  const apply = (key: string) => {
    if (key === "custom") {
      setCustomStart(value.start ?? "");
      setCustomEnd(value.end ?? "");
      setError(null);
      setShowCustom(true);
      return;
    }
    setShowCustom(false);
    const p = PRESETS.find((x) => x.key === key);
    if (!p) return;
    setError(null);
    if (p.days == null) {
      onChange({ start: null, end: null });
    } else {
      onChange({ start: daysAgo(p.days), end: todayISO() });
    }
    setOpen(false);
  };

  const validateAndApply = () => {
    const s = customStart || null;
    const e = customEnd || null;
    if ((s && !e) || (!s && e)) {
      setError("开始和结束日期必须同时填写");
      return;
    }
    if (s && e && s > e) {
      setError("开始日期不能晚于结束日期");
      return;
    }
    setError(null);
    onChange({ start: s, end: e });
    setOpen(false);
    setShowCustom(false);
  };

  const label = matched
    ? PRESETS.find((p) => p.key === matched)?.label ?? "自定义"
    : "自定义";

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        className="btn btn-outline"
        style={{ width: "auto", padding: "4px 10px", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}
        onClick={() => { setOpen((o) => !o); if (open) setShowCustom(false); }}
        aria-label="切换时间范围"
      >
        <CalendarDays size={14} />
        {label}
      </button>
      {open ? (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 90 }}
            onClick={() => { setOpen(false); setShowCustom(false); setError(null); }}
          />
          <div
            style={{
              position: "absolute",
              right: 0,
              top: "calc(100% + 4px)",
              zIndex: 100,
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: 8,
              minWidth: 180,
              boxShadow: "var(--shadow-lg)",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  className="btn btn-outline"
                  style={{ width: "100%", padding: "6px 10px", fontSize: 13, textAlign: "left" }}
                  onClick={() => apply(p.key)}
                >
                  {matched === p.key ? "✓ " : "  "}{p.label}
                </button>
              ))}
              <button
                className="btn btn-outline"
                style={{ width: "100%", padding: "6px 10px", fontSize: 13, textAlign: "left" }}
                onClick={() => apply("custom")}
              >
                {matched === "custom" ? "✓ " : "  "}自定义
              </button>
            </div>
            {showCustom || matched === "custom" ? (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text2)" }}>开始</label>
                    <input className="form-input" type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} style={{ padding: 6, fontSize: 12 }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: "var(--text2)" }}>结束</label>
                    <input className="form-input" type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} style={{ padding: 6, fontSize: 12 }} />
                  </div>
                </div>
                {error ? (
                  <div style={{ fontSize: 12, color: "var(--red)", marginTop: 6 }}>{error}</div>
                ) : null}
                <button className="btn btn-primary" style={{ marginTop: 6, padding: "6px 10px", fontSize: 13 }} onClick={validateAndApply}>
                  应用
                </button>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}