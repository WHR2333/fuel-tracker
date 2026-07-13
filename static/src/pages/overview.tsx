// Overview page — redesigned per v2 spec:
//   1. Latest consumption (big number)
//   2. Stats card (avg consumption / avg cost per km / total dist / total cost / refuel count) + time picker
//   3. Consumption trend area chart + time picker + click-to-inspect
//   4. Monthly cost bar chart + time picker
//   5. Yearly comparison line chart (this year vs last year) + time picker
//
// Removed from previous version: prediction card, recent records card,
// statistics entry card, fuel pie, cost breakdown, top-5 rank.
// Record editing/deleting is now only done inside /records/:rid detail page.

import * as React from "react";
import { useNavigate } from "react-router-dom";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { cardTitle, AppIcon } from "@/components/app-icon";
import { EmptyState } from "@/components/empty-state";
import { TimeRangePicker, type TimeRange } from "@/components/time-range-picker";
import { records as api } from "@/lib/api";
import type { FuelRecord } from "@/lib/types";
import { fmtL100, fmtLiters, fmtMoney, num } from "@/lib/format";
import { calcStats, latestConsumption } from "@/lib/stats";
import { Fuel } from "lucide-react";
import { useActiveVehicle } from "@/lib/use-active-vehicle";
import { useDataVersion } from "@/lib/stores";
import { pushToast } from "@/components/toast-host";

const todayISO = () => new Date().toISOString().slice(0, 10);

/** Two-line stat tile: label on top, value + unit below. */
function StatItem({ label, value, unit, highlight }: { label: string; value: string | number; unit: string; highlight?: boolean }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 11, color: "var(--text2)", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: highlight ? 22 : 18, fontWeight: 700, color: highlight ? "var(--accent)" : "var(--text)", lineHeight: 1.2 }}>
        {value}
        <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text2)", marginLeft: 2 }}>{unit}</span>
      </div>
    </div>
  );
}
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

const YEAR_ALL: TimeRange = { start: null, end: null };
const YEAR_1Y: TimeRange = { start: daysAgo(365), end: todayISO() };

function filterRange(records: FuelRecord[], r: TimeRange): FuelRecord[] {
  return records.filter((rec) => {
    const d = (rec.recordDate ?? "").slice(0, 10);
    if (r.start && d < r.start) return false;
    if (r.end && d > r.end) return false;
    return true;
  });
}

export function OverviewPage() {
  const { vehicle, loading } = useActiveVehicle();
  const navigate = useNavigate();
  const [records, setRecords] = React.useState<FuelRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = React.useState(true);
  const dataVer = useDataVersion();

  React.useEffect(() => {
    if (!vehicle) return;
    setLoadingRecords(true);
    api.list(vehicle.id).then(setRecords).catch((e) => pushToast((e as Error).message)).finally(() => setLoadingRecords(false));
  }, [vehicle?.id, dataVer]);

  // Each card has its own independent time range state.
  const [statsRange, setStatsRange] = React.useState<TimeRange>(YEAR_ALL);
  const [areaRange, setAreaRange] = React.useState<TimeRange>(YEAR_ALL);
  const [monthlyRange, setMonthlyRange] = React.useState<TimeRange>(YEAR_1Y);
  const [yearlyRange, setYearlyRange] = React.useState<TimeRange>(YEAR_ALL);

  // Shared state: which consumption point is selected in the area chart.
  const [selectedPoint, setSelectedPoint] = React.useState<{ date: string; l_per_100: number } | null>(null);

  if (loading) return <EmptyState text="加载中…" />;
  if (!vehicle) {
    return (
      <EmptyState text="还没有车辆，请到「车辆」页添加一辆。">
        <button className="btn btn-primary" style={{ maxWidth: 200, margin: "12px auto 0" }} onClick={() => navigate("/vehicles")}>
          去添加
        </button>
      </EmptyState>
    );
  }

  const latest = latestConsumption(records);

  return (
    <div>
      {/* ── Latest consumption ── */}
      <div className="card">
        <div className="card-title" style={{ justifyContent: "center" }}>
          <Fuel size={16} strokeWidth={1} /> 最近一次油耗
        </div>
        {latest ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))", gap: "12px 8px", marginTop: 8 }}>
            <StatItem label="油耗" value={latest.l_per_100.toFixed(2)} unit="L/100km" highlight />
            <StatItem label="每公里" value={latest.costPerKm.toFixed(3)} unit="元/km" />
            <StatItem label="行驶天数" value={String(latest.days)} unit="天" />
            <StatItem label="行驶距离" value={Math.round(latest.distance)} unit="km" />
            <StatItem label="日均行程" value={latest.dailyAvg.toFixed(1)} unit="km/天" />
            <StatItem label="燃油消耗" value={latest.liters.toFixed(2)} unit="升" />
            <StatItem label="油费支出" value={latest.totalCost.toFixed(2)} unit="元" />
          </div>
        ) : (
          <div style={{ fontSize: 14, color: "var(--text2)", padding: "12px 0", textAlign: "center" }}>
            需要 ≥2 条满箱记录才能计算最近油耗
          </div>
        )}
      </div>

      {/* ── Stats card ── */}
      <StatsCard records={records} range={statsRange} onRangeChange={setStatsRange} loading={loadingRecords} />

      {/* ── Consumption trend area chart ── */}
      <ConsumptionAreaCard records={records} range={areaRange} onRangeChange={setAreaRange} />

      {/* ── Monthly cost bar chart ── */}
      <MonthlyCostCard records={records} range={monthlyRange} onRangeChange={setMonthlyRange} />

      {/* ── Yearly comparison line chart ── */}
      <YearlyComparisonCard records={records} range={yearlyRange} onRangeChange={setYearlyRange} />

      {/* ── Stats entry card ── */}
      <div className="card">
        <div className="card-title" style={{ justifyContent: "space-between" }}>
          {cardTitle("trend-up", "详细统计")}
          <button
            className="btn btn-outline"
            style={{ width: "auto", padding: "4px 12px", fontSize: 12 }}
            onClick={() => navigate("/stats")}
          >
            进入 →
          </button>
        </div>
        <p style={{ fontSize: 13, color: "var(--text2)", margin: 0 }}>
          月度 / 年度 / 加油站 / 行为分析 / 对比，支持自定义时间范围
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stats card
// ─────────────────────────────────────────────────────────────────────────────

function StatsCard({ records, range, onRangeChange, loading }: { records: FuelRecord[]; range: TimeRange; onRangeChange: (r: TimeRange) => void; loading: boolean }) {
  const scoped = filterRange(records, range);
  const stats = calcStats(scoped);
  // avg fuel cost per km
  const avgCostPerKm = stats && stats.costPerKm > 0 ? stats.costPerKm : null;
  // avg km per day: total dist / span of dates in range
  const avgKmPerDay = (() => {
    if (scoped.length < 2) return null;
    const sorted = [...scoped].sort((a, b) => a.recordDate.localeCompare(b.recordDate));
    const first = new Date(sorted[0].recordDate).getTime();
    const last = new Date(sorted[sorted.length - 1].recordDate).getTime();
    const days = Math.max(1, (last - first) / (1000 * 60 * 60 * 24));
    return stats ? stats.totalDist / days : null;
  })();

  return (
    <div className="card">
      <div className="card-title" style={{ justifyContent: "space-between" }}>
        {cardTitle("chart", "统计数据")}
        <TimeRangePicker value={range} onChange={onRangeChange} />
      </div>
      {loading ? (
        <EmptyState text="加载中…" />
      ) : !stats || scoped.length === 0 ? (
        <EmptyState text="该时间范围内没有数据" />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          <MiniStat label="平均油耗" value={stats.avgConsumption.toFixed(2)} unit="升/百公里" color="var(--accent2)" />
          <MiniStat label="平均里程" value={avgKmPerDay != null ? avgKmPerDay.toFixed(1) : "—"} unit="公里/天" />
          <MiniStat label="平均油费" value={avgCostPerKm != null ? avgCostPerKm.toFixed(2) : "—"} unit="元/公里" color="var(--orange)" />
          <MiniStat label="累计行程" value={Math.round(num(stats.totalDist)).toLocaleString()} unit="公里" />
          <MiniStat label="累计油费" value={num(stats.totalCost).toFixed(1)} unit="元" color="var(--orange)" />
          <MiniStat label="加油次数" value={String(scoped.length)} unit="次" />
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, unit, color }: { label: string; value: string; unit: string; color?: string }) {
  return (
    <div className="stat-tile">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ fontSize: 28, color: color ?? "var(--accent)" }}>{value}</div>
      <div className="stat-label">{unit}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Consumption trend area chart
// ─────────────────────────────────────────────────────────────────────────────

function ConsumptionAreaCard({ records, range, onRangeChange }: {
  records: FuelRecord[];
  range: TimeRange;
  onRangeChange: (r: TimeRange) => void;
}) {
  const scoped = filterRange(records, range);
  const stats = calcStats(scoped);
  const data = (stats?.consumptions ?? []).map((c) => ({
    date: c.date,
    l_per_100: Number(c.l_per_100.toFixed(2)),
  }));

  return (
    <div className="card">
      <div className="card-title" style={{ justifyContent: "space-between" }}>
        {cardTitle("trend-down", "油耗变化趋势")}
        <TimeRangePicker value={range} onChange={onRangeChange} />
      </div>
      {data.length === 0 ? (
        <EmptyState text="需要 ≥2 条满箱记录" />
      ) : (
        <div style={{ height: 220 }}>
          <ResponsiveContainer>
            <AreaChart data={data}>
              <defs>
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--chart-label)" }} />
              <YAxis tick={{ fontSize: 10, fill: "var(--chart-label)" }} />
              <Tooltip
                contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                formatter={(v: number) => [`${v.toFixed(2)} L/100km`, "油耗"]}
                labelFormatter={(l: string) => `日期: ${l}`}
              />
              <Area type="monotone" dataKey="l_per_100" stroke="var(--accent)" strokeWidth={2} fill="url(#areaGrad)" dot={{ r: 3 }} activeDot={{ r: 5 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Monthly cost bar chart (Y = amount, one bar per YYYY-MM)
// ─────────────────────────────────────────────────────────────────────────────

function MonthlyCostCard({ records, range, onRangeChange }: { records: FuelRecord[]; range: TimeRange; onRangeChange: (r: TimeRange) => void }) {
  const scoped = filterRange(records, range);
  const buckets = new Map<string, number>();
  for (const r of scoped) {
    const k = (r.recordDate ?? "").slice(0, 7);
    if (!k) continue;
    buckets.set(k, (buckets.get(k) ?? 0) + num(r.paidAmount ?? r.totalCost));
  }
  const data = Array.from(buckets.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, cost]) => ({ month: month.slice(2), cost: Number(cost.toFixed(2)) }));

  return (
    <div className="card">
      <div className="card-title" style={{ justifyContent: "space-between" }}>
        {cardTitle("money", "油费月度统计")}
        <TimeRangePicker value={range} onChange={onRangeChange} />
      </div>
      {data.length === 0 ? (
        <EmptyState text="该时间范围内没有数据" />
      ) : (
        <div style={{ height: 220 }}>
          <ResponsiveContainer>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--chart-label)" }} />
              <YAxis tick={{ fontSize: 10, fill: "var(--chart-label)" }} />
              <Tooltip
                contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                formatter={(v: number) => [`¥${v.toFixed(2)}`, "油费"]}
              />
              <Bar dataKey="cost" name="油费" fill="var(--accent)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Yearly comparison line chart — this year vs last year, month-by-month
// ─────────────────────────────────────────────────────────────────────────────

function YearlyComparisonCard({ records, range, onRangeChange }: { records: FuelRecord[]; range: TimeRange; onRangeChange: (r: TimeRange) => void }) {
  const currentYear = new Date().getFullYear();
  const prevYear = currentYear - 1;

  // Build month-by-month consumption for both years, even if the range
  // picker limits the visible window — we still need the full year for
  // the "vs last year" comparison.
  const buildYearSeries = (year: number): Array<{ month: string; l_per_100: number | null }> => {
    const yearRecords = records.filter((r) => (r.recordDate ?? "").startsWith(String(year)));
    // Consecutive full-tank consumption for this year.
    const sorted = [...yearRecords].sort((a, b) => num(a.odometer) - num(b.odometer));
    const conByMonth = new Map<string, number[]>();
    for (let i = 1; i < sorted.length; i++) {
      const cur = sorted[i];
      if (cur.fullTank !== "yes") continue;
      if (cur.skippedPrevious) continue;
      let totalLiters = num(cur.liters);
      for (let j = i - 1; j >= 0; j--) {
        totalLiters += num(sorted[j].liters);
        if (sorted[j].fullTank === "yes") {
          const dist = num(cur.odometer) - num(sorted[j].odometer);
          if (dist > 0) {
            const c = (totalLiters / dist) * 100;
            if (c > 0 && c < 50) {
              const m = (cur.recordDate ?? "").slice(0, 7);
              if (!conByMonth.has(m)) conByMonth.set(m, []);
              conByMonth.get(m)!.push(c);
            }
          }
          break;
        }
      }
    }
    return Array.from({ length: 12 }, (_, i) => {
      const m = `${year}-${String(i + 1).padStart(2, "0")}`;
      const arr = conByMonth.get(m);
      const avg = arr && arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
      return { month: String(i + 1).replace(/^0/, ""), l_per_100: avg != null ? Number(avg.toFixed(2)) : null };
    });
  };

  const thisYear = buildYearSeries(currentYear);
  const lastYear = buildYearSeries(prevYear);

  // Merge into a single data array for the chart.
  const data = thisYear.map((t, i) => ({
    month: t.month,
    [String(currentYear)]: t.l_per_100,
    [String(prevYear)]: lastYear[i].l_per_100,
  }));

  const hasAny = data.some((d) => d[String(currentYear)] != null || d[String(prevYear)] != null);

  return (
    <div className="card">
      <div className="card-title" style={{ justifyContent: "space-between" }}>
        {cardTitle("trend-up", "油耗年度对比")}
        <TimeRangePicker value={range} onChange={onRangeChange} />
      </div>
      {!hasAny ? (
        <EmptyState text="还没有数据" />
      ) : (
        <div style={{ height: 240 }}>
          <ResponsiveContainer>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--chart-label)" }} />
              <YAxis tick={{ fontSize: 10, fill: "var(--chart-label)" }} />
              <Tooltip
                contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                formatter={(v: any) => v != null ? [`${Number(v).toFixed(2)} L/100km`, ""] : ["—", ""]}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey={String(currentYear)} name={`${currentYear} 年`} stroke="var(--accent)" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
              <Line type="monotone" dataKey={String(prevYear)} name={`${prevYear} 年`} stroke="var(--accent2)" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} strokeDasharray="5 3" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}