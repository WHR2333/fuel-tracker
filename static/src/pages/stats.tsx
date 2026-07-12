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
} from "@/lib/stats";
import { useActiveVehicle } from "@/lib/use-active-vehicle";

type Tab = "monthly" | "yearly" | "station" | "behavior" | "compare";
const TABS: { value: Tab; label: string; icon: string }[] = [
  { value: "monthly", label: "月度", icon: "calendar" },
  { value: "yearly", label: "年度", icon: "calendar-days" },
  { value: "station", label: "加油站", icon: "store" },
  { value: "behavior", label: "行为分析", icon: "brain" },
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
  const [tab, setTab] = React.useState<Tab>("monthly");
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
          {tab === "monthly" ? <MonthlyTab records={filtered} /> : null}
          {tab === "yearly" ? <YearlyTab records={filtered} /> : null}
          {tab === "station" ? <StationTab records={filtered} /> : null}
          {tab === "behavior" ? <BehaviorTab records={filtered} /> : null}
          {tab === "compare" ? <CompareTab records={filtered} vehicle={vehicle.model} /> : null}
        </>
      )}
    </div>
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