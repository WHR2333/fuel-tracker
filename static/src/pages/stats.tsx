// Stats page — 6 sub-tabs + a date-range picker that scopes every tab.
// Mirrors v4 sec-stats minus the purpose tab (removed per v5 design).

import * as React from "react";
import { useNavigate } from "react-router-dom";
import { records as recApi } from "@/lib/api";
import type { FuelRecord } from "@/lib/types";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { ChipFilter } from "@/components/chip-filter";
import { CompareBar } from "@/components/compare-bar";
import { ScoreRing } from "@/components/score-ring";
import { cardTitle, AppIcon } from "@/components/app-icon";
import { EmptyState } from "@/components/empty-state";
import {
  dateRangePresets,
  filterByDateRange,
  fmtLiters,
  fmtMoney,
  fmtOdo,
  num,
  REF_CONSUMPTION,
} from "@/lib/format";
import {
  calcBehavior,
  calcMonthly,
  calcStationStats,
  calcStats,
  calcYearly,
  calcOverview,
  calcFuelTypeStats,
} from "@/lib/stats";
import { useActiveVehicle } from "@/lib/use-active-vehicle";

type Tab = "overview" | "monthly" | "yearly" | "fuelType" | "station" | "trend" | "behavior" | "compare";
const TABS: { value: Tab; label: string; icon: string }[] = [
  { value: "overview", label: "总览", icon: "trend-up" },
  { value: "monthly", label: "月度", icon: "calendar" },
  { value: "yearly", label: "年度", icon: "calendar-days" },
  { value: "fuelType", label: "油品", icon: "fuel" },
  { value: "station", label: "加油站", icon: "store" },
  { value: "trend", label: "趋势", icon: "chart-line" },
  { value: "behavior", label: "行为", icon: "brain" },
  { value: "compare", label: "对比", icon: "refresh" },
];

interface RangeState {
  /** Selected preset key — `custom` means user picked their own start/end. */
  presetKey: string;
  start: string | null;
  end: string | null;
}

export function StatsPage() {
  const { vehicle, loading } = useActiveVehicle();
  const navigate = useNavigate();
  const [tab, setTab] = React.useState<Tab>("overview");
  const [records, setRecords] = React.useState<FuelRecord[]>([]);
  const [dataLoading, setDataLoading] = React.useState(true);
  const presets = React.useMemo(() => dateRangePresets(), []);
  const [range, setRange] = React.useState<RangeState>(() => {
    const first = presets[0];
    return { presetKey: first.label, start: first.start, end: first.end };
  });
  const [showCustom, setShowCustom] = React.useState(false);
  const [dateError, setDateError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!vehicle) return;
    setDataLoading(true);
    recApi.list(vehicle.id).then(setRecords).finally(() => setDataLoading(false));
  }, [vehicle?.id]);

  if (loading) return <EmptyState text="加载中…" />;
  if (!vehicle) {
    return (
      <EmptyState text="请先添加车辆">
        <button className="btn btn-primary" style={{ maxWidth: 200, margin: "12px auto 0" }} onClick={() => navigate("/vehicles")}>去添加</button>
      </EmptyState>
    );
  }

  const filtered = filterByDateRange(records, range.start, range.end);
  const rangeLabel =
    range.presetKey === "custom"
      ? `${range.start ?? "—"} → ${range.end ?? "—"}`
      : range.presetKey;

  const applyPreset = (key: string) => {
    const p = presets.find((x) => x.label === key);
    if (!p) return;
    setRange({ presetKey: p.label, start: p.start, end: p.end });
    setShowCustom(false);
  };
  const applyCustom = () => {
    const s = range.start;
    const e = range.end;
    if ((s && !e) || (!s && e)) {
      setDateError("开始和结束日期必须同时填写");
      return;
    }
    if (s && e && s > e) {
      setDateError("开始日期不能晚于结束日期");
      return;
    }
    setDateError(null);
    setRange((r) => ({ ...r, presetKey: "custom" }));
    setShowCustom(false);
  };

  return (
    <div>
      {/* Date-range picker — applies to every tab below. */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-title">{cardTitle("calendar", "时间范围")}</div>
        <ChipFilter
          options={[...presets.map((p) => ({ value: p.label, label: p.label })), { value: "custom", label: "自定义" }]}
          value={range.presetKey}
          onChange={(v) => {
            if (v === "custom") {
              setShowCustom(true);
            } else {
              applyPreset(v);
            }
          }}
        />
        {showCustom || range.presetKey === "custom" ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>开始</label>
              <input className="form-input" type="date" value={range.start ?? ""} onChange={(e) => { setDateError(null); setRange((r) => ({ ...r, start: e.target.value || null })); }} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>结束</label>
              <input className="form-input" type="date" value={range.end ?? ""} onChange={(e) => { setDateError(null); setRange((r) => ({ ...r, end: e.target.value || null })); }} />
            </div>
            {dateError ? (
              <div style={{ fontSize: 12, color: "var(--red)", gridColumn: "1 / span 2" }}>{dateError}</div>
            ) : null}
            <button className="btn btn-primary" style={{ gridColumn: "1 / span 2" }} onClick={applyCustom}>
              应用
            </button>
          </div>
        ) : null}
        <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 6 }}>
          当前: <strong>{rangeLabel}</strong> · {filtered.length} 条记录
        </div>
      </div>

      <ChipFilter options={TABS} value={tab} onChange={setTab} />

      {dataLoading ? (
        <EmptyState text="加载中…" />
      ) : (
        <>
          {tab === "overview" ? <OverviewTab records={filtered} /> : null}
          {tab === "monthly" ? <MonthlyTab records={filtered} /> : null}
          {tab === "yearly" ? <YearlyTab records={filtered} /> : null}
          {tab === "fuelType" ? <FuelTypeTab records={filtered} /> : null}
          {tab === "station" ? <StationTab records={filtered} /> : null}
          {tab === "trend" ? <TrendTab records={filtered} /> : null}
          {tab === "behavior" ? <BehaviorTab records={filtered} /> : null}
          {tab === "compare" ? <CompareTab records={filtered} vehicle={vehicle.model} /> : null}
        </>
      )}
    </div>
  );
}

function OverviewTab({ records }: { records: FuelRecord[] }) {
  const ov = calcOverview(records);
  if (!ov) return <EmptyState text="该时间范围内没有数据" />;

  const items = [
    { label: "记录总数", value: String(ov.totalRecords), unit: "条" },
    { label: "满箱次数", value: String(ov.fullCount), unit: "次" },
    { label: "加满率", value: ov.fullRate.toFixed(0), unit: "%" },
    { label: "总花费", value: ov.paidCost.toFixed(2), unit: "元" },
    { label: "总加油量", value: ov.totalFuel.toFixed(2), unit: "升" },
    { label: "总里程", value: Math.round(ov.totalDist), unit: "km" },
    { label: "平均油耗", value: ov.avgConsumption > 0 ? ov.avgConsumption.toFixed(2) : "—", unit: "L/100km", highlight: true },
    { label: "平均单价", value: ov.avgPrice.toFixed(2), unit: "¥/L" },
    { label: "每公里费用", value: ov.costPerKm > 0 ? ov.costPerKm.toFixed(3) : "—", unit: "元/km" },
    { label: "最低油耗", value: ov.bestCon > 0 ? ov.bestCon.toFixed(2) : "—", unit: "L/100km" },
    { label: "最高油耗", value: ov.worstCon > 0 ? ov.worstCon.toFixed(2) : "—", unit: "L/100km" },
    { label: "最低单价", value: ov.cheapestPrice > 0 ? ov.cheapestPrice.toFixed(2) : "—", unit: "¥/L" },
    { label: "最高单价", value: ov.mostExpensivePrice > 0 ? ov.mostExpensivePrice.toFixed(2) : "—", unit: "¥/L" },
    { label: "首次加油", value: ov.firstDate, unit: "" },
    { label: "最近加油", value: ov.lastDate, unit: "" },
    { label: "记录跨度", value: String(ov.spanDays), unit: "天" },
  ];

  return (
    <div className="card">
      <div className="card-title">{cardTitle("trend-up", "总览")}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: "14px 8px" }}>
        {items.map((it) => (
          <div key={it.label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "var(--text2)", marginBottom: 2 }}>{it.label}</div>
            <div style={{ fontSize: it.highlight ? 20 : 16, fontWeight: 700, color: it.highlight ? "var(--accent)" : "var(--text)", lineHeight: 1.2 }}>
              {it.value}
              {it.unit ? <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text2)", marginLeft: 2 }}>{it.unit}</span> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FuelTypeTab({ records }: { records: FuelRecord[] }) {
  const data = calcFuelTypeStats(records);
  if (data.length === 0) return <EmptyState text="该时间范围内没有数据" />;

  const chartData = data
    .filter((d) => d.avgConsumption > 0)
    .map((d) => ({ type: d.fuelType, con: Number(d.avgConsumption.toFixed(2)) }));

  return (
    <>
      <div className="card">
        <div className="card-title">{cardTitle("fuel", "油品统计")}</div>
        <table className="data-table">
          <thead>
            <tr>
              <th>油品</th><th>次数</th><th>总花费</th><th>总加油量</th><th>平均单价</th><th>平均油耗</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.fuelType}>
                <td>{d.fuelType}</td>
                <td>{d.count}</td>
                <td>{fmtMoney(d.totalCost)}</td>
                <td>{fmtLiters(d.totalFuel)}</td>
                <td>¥{d.avgPrice.toFixed(2)}/L</td>
                <td>{d.avgConsumption > 0 ? `${d.avgConsumption.toFixed(2)} L` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {chartData.length > 0 ? (
        <div className="card">
          <div className="card-title">{cardTitle("fuel", "各油品平均油耗")}</div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis dataKey="type" tick={{ fontSize: 12, fill: "var(--chart-label)" }} />
                <YAxis tick={{ fontSize: 11, fill: "var(--chart-label)" }} />
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="con" fill="var(--accent)" radius={[4, 4, 0, 0]} name="L/100km" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}
    </>
  );
}

function TrendTab({ records }: { records: FuelRecord[] }) {
  const monthly = calcMonthly(records);
  const stats = calcStats(records);

  // Per-trip consumption scatter data (full-full pairs only).
  const tripData = (stats?.consumptions ?? []).map((c) => ({
    date: c.date.slice(0, 7),
    con: Number(c.l_per_100.toFixed(2)),
    merged: c.mergedCount,
  }));

  // Count consecutive non-full records at the end for stale hint.
  const sortedAsc = [...records].sort((a, b) => num(a.odometer) - num(b.odometer));
  let trailingNonFull = 0;
  for (let i = sortedAsc.length - 1; i >= 0; i--) {
    if (sortedAsc[i].fullTank !== "yes") trailingNonFull++;
    else break;
  }

  const costData = monthly.map((m) => ({
    month: m.month.slice(2),
    cost: Number(m.totalCost.toFixed(2)),
  }));

  if (tripData.length === 0 && costData.length === 0) {
    return <EmptyState text="该时间范围内没有数据" />;
  }

  return (
    <>
      {/* Consecutive non-full hint */}
      {trailingNonFull >= 3 ? (
        <div style={{
          marginBottom: 10, padding: "8px 12px", borderRadius: 8,
          background: "color-mix(in srgb, var(--orange) 12%, transparent)",
          color: "var(--orange)", fontSize: 13,
        }}>
          ⚠ 已连续{trailingNonFull}次未加满，油耗曲线暂无新数据点
        </div>
      ) : null}

      {tripData.length > 0 ? (
        <div className="card">
          <div className="card-title">{cardTitle("chart-line", "单次油耗趋势")}</div>
          <div style={{ height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={tripData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--chart-label)" }} />
                <YAxis tick={{ fontSize: 11, fill: "var(--chart-label)" }} />
                <Tooltip
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                  formatter={(value: number, _name: string, props: { payload?: { merged?: number } }) => {
                    const m = props.payload?.merged ?? 0;
                    return [
                      m > 0 ? `${value} L/100km（合并结算，含之前${m}次未满加油）` : `${value} L/100km`,
                      "油耗",
                    ];
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="con"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  dot={(props: { cx?: number; cy?: number; payload?: { merged?: number } }) => {
                    const { cx, cy, payload } = props;
                    const isMerged = (payload?.merged ?? 0) > 0;
                    return (
                      <circle
                        key={`dot-${cx}-${cy}`}
                        cx={cx} cy={cy} r={isMerged ? 5 : 3}
                        fill={isMerged ? "var(--orange)" : "var(--accent)"}
                        stroke={isMerged ? "var(--orange)" : "var(--accent)"}
                      />
                    );
                  }}
                  name="L/100km"
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}
      {costData.length > 0 ? (
        <div className="card">
          <div className="card-title">{cardTitle("chart-line", "月度费用趋势")}</div>
          <div style={{ height: 260 }}>
            <ResponsiveContainer>
              <AreaChart data={costData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--chart-label)" }} />
                <YAxis tick={{ fontSize: 11, fill: "var(--chart-label)" }} />
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="cost" stroke="var(--accent2)" fill="var(--accent2)" fillOpacity={0.15} name="元" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}
    </>
  );
}

function MonthlyTab({ records }: { records: FuelRecord[] }) {
  const monthly = calcMonthly(records);
  const chartData = monthly.map((m) => ({ month: m.month.slice(2), cost: Number(m.totalCost.toFixed(2)) }));
  if (monthly.length === 0) return <EmptyState text="该时间范围内没有数据" />;
  return (
    <div className="card">
      <div className="card-title">{cardTitle("calendar", "月度统计")}</div>
      <div style={{ height: 260 }}>
        <ResponsiveContainer>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--chart-label)" }} />
            <YAxis tick={{ fontSize: 11, fill: "var(--chart-label)" }} />
            <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
            <Bar dataKey="cost" fill="var(--accent)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>月份</th><th>加油</th><th>花费</th><th>环比</th><th>油耗</th><th>里程</th>
          </tr>
        </thead>
        <tbody>
          {monthly.map((m) => (
            <tr key={m.month}>
              <td>{m.month}</td>
              <td>{m.count}</td>
              <td>{fmtMoney(m.totalCost)}</td>
              <td>
                {m.momPct == null ? "—" :
                  m.momPct > 0 ? <span style={{ color: "var(--red)" }}>↑ {m.momPct.toFixed(1)}%</span> :
                  m.momPct < 0 ? <span style={{ color: "var(--accent2)" }}>↓ {(-m.momPct).toFixed(1)}%</span> :
                  "→ 0%"}
              </td>
              <td>{m.distance > 0 ? `${m.l_per_100km.toFixed(2)} L` : "—"}</td>
              <td>{m.distance > 0 ? fmtOdo(m.distance) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function YearlyTab({ records }: { records: FuelRecord[] }) {
  const yearly = calcYearly(records);
  if (yearly.length === 0) return <EmptyState text="该时间范围内没有数据" />;
  return (
    <div className="card">
      <div className="card-title">{cardTitle("calendar", "年度统计")}</div>
      <table className="data-table">
        <thead>
          <tr>
            <th>年份</th><th>加油</th><th>花费</th><th>加油量</th><th>油耗</th><th>里程</th>
          </tr>
        </thead>
        <tbody>
          {yearly.map((y) => (
            <tr key={y.year}>
              <td>{y.year}</td>
              <td>{y.count}</td>
              <td>{fmtMoney(y.totalCost)}</td>
              <td>{fmtLiters(y.totalFuel)}</td>
              <td>{y.distance > 0 ? `${y.l_per_100km.toFixed(2)} L` : "—"}</td>
              <td>{y.distance > 0 ? fmtOdo(y.distance) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StationTab({ records }: { records: FuelRecord[] }) {
  const stations = calcStationStats(records);
  if (stations.length === 0) return <EmptyState text="该时间范围内没有数据" />;
  const cheapest = stations.find((s) => s.cheapest);
  return (
    <>
      {cheapest ? (
        <div className="reminder-card">
          <div className="reminder-title">{cardTitle("store", "最便宜的加油站")}</div>
          <div className="reminder-info">
            <div className="reminder-value" style={{ color: "var(--accent2)" }}>¥{cheapest.avgPrice.toFixed(2)}/L</div>
            <div>{cheapest.name} · {cheapest.count} 次加油</div>
          </div>
        </div>
      ) : null}
      <div className="card">
        <div className="card-title">{cardTitle("store", "加油站统计")}</div>
        {stations.map((s) => (
          <div key={s.name} className={`station-item${s.cheapest ? " cheapest" : ""}`}>
            <span>{s.cheapest ? "🥇" : <AppIcon name="store" size={16} strokeWidth={1} />}</span>
            <span className="station-name">{s.name}</span>
            <span className="station-count">{s.count} 次 · {fmtMoney(s.totalCost)}</span>
            <span className="station-price">¥{s.avgPrice.toFixed(2)}/L</span>
          </div>
        ))}
      </div>
    </>
  );
}

function BehaviorTab({ records }: { records: FuelRecord[] }) {
  const stats = calcStats(records);
  const conValues = stats?.consumptions.map((c) => c.l_per_100) ?? [];
  const beh = calcBehavior(records, conValues);
  if (!beh) return <EmptyState text="需要 ≥3 条满箱记录才能分析" />;

  return (
    <div className="card">
      <div className="card-title">{cardTitle("brain", "驾驶行为分析")}</div>
      <ScoreRing score={beh.score} />
      <div className="stat-grid">
        <div className="stat-tile">
          <div className="stat-value">{beh.avgGapDays.toFixed(1)}</div>
          <div className="stat-label">平均加油间隔 (天)</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value green">{beh.fullRate.toFixed(0)}%</div>
          <div className="stat-label">加满率</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value orange">{beh.stdDev.toFixed(2)}</div>
          <div className="stat-label">油耗标准差</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value purple">{(beh.cv * 100).toFixed(1)}%</div>
          <div className="stat-label">变异系数</div>
        </div>
      </div>
      <div style={{ marginTop: 12, fontSize: 13, lineHeight: 1.6, color: "var(--text2)" }}>
        {beh.tip}
      </div>
    </div>
  );
}

function CompareTab({ records, vehicle }: { records: FuelRecord[]; vehicle: string }) {
  const stats = calcStats(records);
  const myCon = stats?.avgConsumption ?? 0;

  const initialKey = React.useMemo(() => {
    if (!vehicle) return REF_CONSUMPTION[0].key;
    const found = REF_CONSUMPTION.find((m) => vehicle.includes(m.key));
    return found?.key ?? REF_CONSUMPTION[0].key;
  }, [vehicle]);
  const [selected, setSelected] = React.useState(initialKey);
  React.useEffect(() => setSelected(initialKey), [initialKey]);

  const ref = REF_CONSUMPTION.find((m) => m.key === selected)!;
  const max = Math.max(myCon, ref.l_per_100) * 1.3;
  const pct = (v: number) => (v / max) * 100;

  const monthly = calcMonthly(records).filter((m) => m.distance > 0);
  const maxMonthly = Math.max(1, ...monthly.map((m) => m.l_per_100km));

  return (
    <>
      <div className="card">
        <div className="card-title">{cardTitle("refresh", "同车型对比")}</div>
        <div className="form-group">
          <label>选择车型</label>
          <select className="form-input" value={selected} onChange={(e) => setSelected(e.target.value)}>
            {REF_CONSUMPTION.map((m) => (
              <option key={m.key} value={m.key}>{m.name} ({m.l_per_100} L/100km)</option>
            ))}
          </select>
        </div>
        {myCon > 0 ? (
          <div>
            <CompareBar label="我的车" value={myCon} pct={pct(myCon)} color="var(--accent)" unit="L" />
            <CompareBar label={ref.name} value={ref.l_per_100} pct={pct(ref.l_per_100)} color="var(--accent2)" unit="L" />
            <div style={{ marginTop: 12, fontSize: 13, color: "var(--text2)" }}>
              {myCon > ref.l_per_100
                ? `您的油耗比 ${ref.name} 参考值高 ${(myCon - ref.l_per_100).toFixed(2)} L/100km (${(((myCon - ref.l_per_100) / ref.l_per_100) * 100).toFixed(1)}%)`
                : `您的油耗比 ${ref.name} 参考值低 ${(ref.l_per_100 - myCon).toFixed(2)} L/100km (${(((ref.l_per_100 - myCon) / ref.l_per_100) * 100).toFixed(1)}%)`}
            </div>
          </div>
        ) : (
          <p style={{ fontSize: 13, color: "var(--text2)" }}>需要 ≥2 条满箱记录才能对比</p>
        )}
      </div>
      <div className="card">
        <div className="card-title">{cardTitle("calendar", "月度油耗对比")}</div>
        {monthly.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text2)" }}>该时间范围内没有数据</p>
        ) : (
          <div>
            {monthly.map((m) => (
              <CompareBar
                key={m.month}
                label={`${m.month.slice(5)}月`}
                value={m.l_per_100km}
                pct={(m.l_per_100km / maxMonthly) * 100}
                color={myCon > 0 && m.l_per_100km <= myCon ? "var(--accent2)" : "var(--orange)"}
                unit="L"
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}