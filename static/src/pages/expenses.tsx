// 费用统计 — independent tab between 加油 and 保养. Aggregates the two
// cost-bearing sources (fuel + maintenance) into one place:
//   - Top total + breakdown by category (油费 / 保养)
//   - Monthly cost trend (bar chart) combining both
//   - Pie chart of category share
//   - Top spending stations (from fuel records)
//   - Top maintenance items by cost
//   - Date-range picker to scope everything

import * as React from "react";
import { useNavigate } from "react-router-dom";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { ChipFilter } from "@/components/chip-filter";
import { CompareBar } from "@/components/compare-bar";
import { cardTitle, AppIcon } from "@/components/app-icon";
import { EmptyState } from "@/components/empty-state";
import {
  dateRangePresets,
  filterByDateRange,
  fmtMoney,
  maintName,
  num,
} from "@/lib/format";
import {
  calcMonthly,
  calcStationStats,
} from "@/lib/stats";
import { records as recApi, maintenance as maintApi } from "@/lib/api";
import type { FuelRecord, MaintenanceRecord } from "@/lib/types";
import { useActiveVehicle } from "@/lib/use-active-vehicle";

interface RangeState {
  presetKey: string;
  start: string | null;
  end: string | null;
}

export function ExpensesPage() {
  const { vehicle, loading } = useActiveVehicle();
  const navigate = useNavigate();
  const [fuel, setFuel] = React.useState<FuelRecord[]>([]);
  const [maint, setMaint] = React.useState<MaintenanceRecord[]>([]);
  const [loadingData, setLoadingData] = React.useState(true);
  const presets = React.useMemo(() => dateRangePresets(), []);
  const [range, setRange] = React.useState<RangeState>(() => {
    const first = presets[0];
    return { presetKey: first.label, start: first.start, end: first.end };
  });
  const [showCustom, setShowCustom] = React.useState(false);

  React.useEffect(() => {
    if (!vehicle) return;
    setLoadingData(true);
    Promise.all([recApi.list(vehicle.id), maintApi.list(vehicle.id)])
      .then(([f, m]) => { setFuel(f); setMaint(m); })
      .finally(() => setLoadingData(false));
  }, [vehicle?.id]);

  if (loading) return <EmptyState text="加载中…" />;
  if (!vehicle) {
    return (
      <EmptyState text="请先添加车辆">
        <button className="btn btn-primary" style={{ maxWidth: 200, margin: "12px auto 0" }} onClick={() => navigate("/vehicles")}>
          去添加
        </button>
      </EmptyState>
    );
  }

  const fuelScoped = filterByDateRange(fuel, range.start, range.end);
  const maintScoped = filterByDateRange(maint, range.start, range.end);

  const fuelTotal = fuelScoped.reduce((s, r) => s + num(r.paidAmount ?? r.pumpAmount ?? r.totalCost), 0);
  const maintTotal = maintScoped.reduce((s, r) => s + num(r.cost), 0);
  const grandTotal = fuelTotal + maintTotal;

  const applyPreset = (key: string) => {
    const p = presets.find((x) => x.label === key);
    if (!p) return;
    setRange({ presetKey: p.label, start: p.start, end: p.end });
    setShowCustom(false);
  };
  const applyCustom = () => {
    setRange({ presetKey: "custom", start: range.start, end: range.end });
    setShowCustom(false);
  };

  // --- monthly trend: bucket by YYYY-MM and merge both sources ---
  const monthly = new Map<string, { fuel: number; maint: number }>();
  for (const r of fuelScoped) {
    const k = (r.recordDate ?? "").slice(0, 7);
    if (!k) continue;
    let b = monthly.get(k) ?? { fuel: 0, maint: 0 };
    b.fuel += num(r.paidAmount ?? r.pumpAmount ?? r.totalCost);
    monthly.set(k, b);
  }
  for (const m of maintScoped) {
    const k = (m.recordDate ?? "").slice(0, 7);
    if (!k) continue;
    let b = monthly.get(k) ?? { fuel: 0, maint: 0 };
    b.maint += num(m.cost);
    monthly.set(k, b);
  }
  const monthlyArr = Array.from(monthly.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-12) // last 12 months
    .map(([month, v]) => ({ month: month.slice(2), fuel: Number(v.fuel.toFixed(2)), maint: Number(v.maint.toFixed(2)), total: Number((v.fuel + v.maint).toFixed(2)) }));

  // --- category pie ---
  const pieData = [
    { name: "油费", value: Number(fuelTotal.toFixed(2)), color: "#3b82f6" },
    { name: "保养", value: Number(maintTotal.toFixed(2)), color: "#f59e0b" },
  ].filter((d) => d.value > 0);

  // --- top stations ---
  const stations = calcStationStats(fuelScoped).slice(0, 5);

  // --- top maintenance items by cost (resolved name) ---
  const byName = new Map<string, number>();
  for (const m of maintScoped) {
    const k = maintName(m);
    byName.set(k, (byName.get(k) ?? 0) + num(m.cost));
  }
  const topMaint = Array.from(byName.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const maxMaint = Math.max(1, ...topMaint.map((x) => x[1]));

  const rangeLabel =
    range.presetKey === "custom"
      ? `${range.start ?? "—"} → ${range.end ?? "—"}`
      : range.presetKey;

  return (
    <div>
      {/* Date range picker */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-title">{cardTitle("calendar", "时间范围")}</div>
        <ChipFilter
          options={[...presets.map((p) => ({ value: p.label, label: p.label })), { value: "custom", label: "自定义" }]}
          value={range.presetKey}
          onChange={(v) => {
            if (v === "custom") setShowCustom(true);
            else applyPreset(v);
          }}
        />
        {showCustom || range.presetKey === "custom" ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>开始</label>
              <input className="form-input" type="date" value={range.start ?? ""} onChange={(e) => setRange((r) => ({ ...r, start: e.target.value || null }))} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>结束</label>
              <input className="form-input" type="date" value={range.end ?? ""} onChange={(e) => setRange((r) => ({ ...r, end: e.target.value || null }))} />
            </div>
            <button className="btn btn-primary" style={{ gridColumn: "1 / span 2" }} onClick={applyCustom}>应用</button>
          </div>
        ) : null}
        <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 6 }}>
          当前: <strong>{rangeLabel}</strong> · 油费 {fuelScoped.length} 条 · 保养 {maintScoped.length} 条
        </div>
      </div>

      {loadingData ? (
        <EmptyState text="加载中…" />
      ) : grandTotal === 0 ? (
        <EmptyState text="该时间范围内没有费用记录">
          <button className="btn btn-primary" style={{ maxWidth: 200, margin: "12px auto 0" }} onClick={() => navigate("/add")}>
            去加油
          </button>
        </EmptyState>
      ) : (
        <>
          {/* Top totals */}
          <div className="card" style={{ textAlign: "center" }}>
            <div className="card-title" style={{ justifyContent: "center" }}>{cardTitle("money", "费用合计")}</div>
            <div style={{ fontSize: 40, fontWeight: 800, color: "var(--orange)" }}>
              {fmtMoney(grandTotal)}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
              <div className="stat-tile">
                <div className="stat-value blue" style={{ fontSize: 22 }}>{fmtMoney(fuelTotal)}</div>
                <div className="stat-label">油费</div>
              </div>
              <div className="stat-tile">
                <div className="stat-value orange" style={{ fontSize: 22 }}>{fmtMoney(maintTotal)}</div>
                <div className="stat-label">保养</div>
              </div>
            </div>
          </div>

          {/* Monthly trend */}
          <div className="card">
            <div className="card-title">{cardTitle("trend-up", "月度费用趋势")}</div>
            {monthlyArr.length === 0 ? (
              <EmptyState text="—" />
            ) : (
              <div style={{ height: 240 }}>
                <ResponsiveContainer>
                  <BarChart data={monthlyArr}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--chart-label)" }} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--chart-label)" }} />
                    <Tooltip
                      contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                      formatter={(v: number) => `¥${v.toFixed(2)}`}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="fuel" name="油费" stackId="a" fill="#3b82f6" />
                    <Bar dataKey="maint" name="保养" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Category pie */}
          <div className="card">
            <div className="card-title">{cardTitle("chart", "分类占比")}</div>
            <div style={{ height: 200 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={(d) => `${d.name} ¥${d.value.toFixed(0)}`}>
                    {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top stations */}
          {stations.length > 0 ? (
            <div className="card">
              <div className="card-title">{cardTitle("store", "油站花费排行")}</div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>油站</th>
                    <th className="text-right">次数</th>
                    <th className="text-right">实付</th>
                    <th className="text-right">均价</th>
                  </tr>
                </thead>
                <tbody>
                  {stations.map((s) => (
                    <tr key={s.name}>
                      <td>{s.cheapest ? "🥇 " : ""}{s.name}</td>
                      <td className="text-right">{s.count}</td>
                      <td className="text-right">{fmtMoney(s.totalCost)}</td>
                      <td className="text-right">¥{s.avgPrice.toFixed(2)}/L</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {/* Top maintenance items */}
          {topMaint.length > 0 ? (
            <div className="card">
              <div className="card-title">{cardTitle("wrench", "保养项目花费排行")}</div>
              <div>
                {topMaint.map(([label, cost]) => (
                  <CompareBar
                    key={label}
                    label={label}
                    value={cost}
                    pct={(cost / maxMaint) * 100}
                    color="var(--orange)"
                    unit="¥"
                    formatValue={(v) => v.toFixed(2)}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}