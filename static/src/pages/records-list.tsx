// Records list page at /records-list.
//
// Features:
//   - Back button + page title at top
//   - Info bar (year picker + 3 stats in Chinese units)
//   - Global collapse/expand all toggle (top-right)
//   - Per-card collapse/expand (collapsed: just date + consumption + odometer)
//   - Gap rows between consecutive cards
//   - Click entire card to navigate to detail page

import * as React from "react";
import { useNavigate } from "react-router-dom";
import { records as api, vehicles as vApi } from "@/lib/api";
import type { FuelRecord, Vehicle } from "@/lib/types";
import { cardTitle, AppIcon } from "@/components/app-icon";
import { EmptyState } from "@/components/empty-state";
import { pushToast } from "@/components/toast-host";
import { fuelLabel, num } from "@/lib/format";
import { useActiveVehicleVersion, useDataVersion } from "@/lib/stores";
import { getRecordStatus, consumptionStale } from "@/lib/record-status";
import type { RecordStatus } from "@/lib/record-status";
import { Plus } from "lucide-react";

const CURRENT_YEAR = new Date().getFullYear();

export function RecordsListPage() {
  const navigate = useNavigate();
  const [records, setRecords] = React.useState<FuelRecord[]>([]);
  const [vehicles, setVehicles] = React.useState<Vehicle[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem("fuel.activeVehicleId") : null,
  );
  const [loading, setLoading] = React.useState(true);
  const [year, setYear] = React.useState<string>("all");
  const [allCollapsed, setAllCollapsed] = React.useState(false);
  const useDataVer = useDataVersion();
  const useActiveVer = useActiveVehicleVersion();

  const reload = React.useCallback(async () => {
    setLoading(true);
    try {
      const [vs, id] = await Promise.all([vApi.list(), Promise.resolve(localStorage.getItem("fuel.activeVehicleId"))]);
      setVehicles(vs);
      const cur = id && vs.find((v) => v.id === id) ? id : vs[0]?.id ?? null;
      setActiveId(cur);
      if (cur) {
        const rs = await api.list(cur);
        setRecords([...rs].sort((a, b) => num(b.odometer) - num(a.odometer)));
      } else {
        setRecords([]);
      }
    } catch (e) {
      pushToast((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { reload(); }, [reload, useActiveVer]);

  const active = vehicles.find((v) => v.id === activeId) ?? null;

  const scoped = year === "all"
    ? records
    : records.filter((r) => (r.recordDate ?? "").slice(0, 4) === year);

  // Info bar aggregates.
  const totalCost = scoped.reduce((s, r) => s + num(r.paidAmount ?? r.totalCost), 0);
  const byDate = [...scoped].sort((a, b) => a.recordDate.localeCompare(b.recordDate));
  const distance = byDate.length >= 2 ? num(byDate[byDate.length - 1].odometer) - num(byDate[0].odometer) : 0;
  const avgCon = avgConsumption(scoped);

  // Build card items with inter-card gaps.
  const cards = scoped;
  const items: Array<
    | { kind: "card"; record: FuelRecord; con?: number; status?: RecordStatus }
    | { kind: "gap"; id: string; km: number; estFuel: number | null; estCost: number | null }
  > = [];

  // Compute per-record consumption (needs sorted-by-odometer list, which is
  // the reverse of our display order). Build a map first.
  const sortedAsc = [...scoped].sort((a, b) => num(a.odometer) - num(b.odometer));
  const conMap = new Map<string, number>();
  const statusMap = new Map<string, RecordStatus>();
  for (let i = 0; i < sortedAsc.length; i++) {
    statusMap.set(sortedAsc[i].id, getRecordStatus(sortedAsc, i));
  }
  for (let i = 1; i < sortedAsc.length; i++) {
    const cur = sortedAsc[i];
    if (cur.fullTank !== "yes") continue;
    if (cur.skippedPrevious) continue;
    // Sum all liters from prev full tank to current (inclusive).
    let totalLiters = num(cur.liters);
    let segStart = i; // track where this segment starts
    for (let j = i - 1; j >= 0; j--) {
      totalLiters += num(sortedAsc[j].liters);
      segStart = j;
      if (sortedAsc[j].fullTank === "yes") {
        const dist = num(cur.odometer) - num(sortedAsc[j].odometer);
        if (dist > 0) {
          const c = (totalLiters / dist) * 100;
          if (c > 0 && c < 50) {
            // Assign this consumption to the full record AND all preceding
            // non-full records in the same segment.
            conMap.set(cur.id, c);
            for (let k = j + 1; k < i; k++) {
              conMap.set(sortedAsc[k].id, c);
            }
          }
        }
        break;
      }
    }
  }

  for (let i = 0; i < cards.length; i++) {
    items.push({ kind: "card", record: cards[i], con: conMap.get(cards[i].id), status: statusMap.get(cards[i].id) });
    const next = cards[i + 1];
    if (next) {
      const km = Math.round(num(cards[i].odometer) - num(next.odometer));
      const price = num(cards[i].price);
      // Use settled consumption rate for gap estimation if available.
      const con = conMap.get(cards[i].id) ?? conMap.get(next.id);
      const estFuel = con != null && km > 0 ? (con * km) / 100 : null;
      const estCost = estFuel != null && price > 0 ? estFuel * price : null;
      items.push({
        kind: "gap",
        id: `${cards[i].id}-${next.id}`,
        km,
        estFuel,
        estCost,
      });
    }
  }

  React.useEffect(() => {
    document.title = active ? `加油记录 · ${active.name} - 省油的灯` : "加油记录 - 省油的灯";
    return () => { document.title = "省油的灯"; };
  }, [active?.name]);

  return (
    <div>
      {/* Back button + page title + collapse toggle + add button */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <button
          className="btn btn-outline"
          style={{ width: "auto", padding: "6px 12px", fontSize: 13, flexShrink: 0 }}
          onClick={() => navigate(-1)}
        >
          ← 返回
        </button>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, flex: 1 }}>
          {active ? `加油记录 · ${active.name}` : "加油记录"}
        </h2>
        <button
          className="btn btn-outline"
          style={{ width: "auto", padding: "6px 12px", fontSize: 13, flexShrink: 0 }}
          onClick={() => setAllCollapsed((c) => !c)}
          title={allCollapsed ? "展开全部" : "收起全部"}
        >
          {allCollapsed ? "▼" : "▲"}
        </button>
        <button
          className="btn btn-primary"
          style={{ width: "auto", padding: "6px 12px", fontSize: 13, flexShrink: 0 }}
          onClick={() => navigate("/add")}
          title="新增加油"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* Info bar */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <YearPicker year={year} onChange={setYear} records={records} />
          <div style={{ display: "flex", gap: 12, fontSize: 14, fontWeight: 600 }}>
            <span>{num(totalCost).toFixed(2)}元</span>
            <span style={{ color: "var(--text2)" }}>·</span>
            <span>{Math.round(num(distance))}公里</span>
            <span style={{ color: "var(--text2)" }}>·</span>
            <span style={{ color: "var(--accent)" }}>{avgCon != null ? `${avgCon.toFixed(2)}升/百公里` : "—"}</span>
          </div>
        </div>
      </div>

      {/* Stale consumption banner */}
      {consumptionStale(records) && records.length >= 2 ? (
        <div style={{
          marginBottom: 10, padding: "8px 12px", borderRadius: 8,
          background: "color-mix(in srgb, var(--orange) 12%, transparent)",
          color: "var(--orange)", fontSize: 13,
        }}>
          ⚠ 油耗曲线暂无更新，建议加满跳枪一次以恢复数据
        </div>
      ) : null}

      {loading ? (
        <EmptyState text="加载中…" />
      ) : cards.length === 0 ? (
        <EmptyState text={year === "all" ? "还没有加油记录" : `${year} 年没有加油记录`}>
          <button className="btn btn-primary" style={{ maxWidth: 200, margin: "12px auto 0" }} onClick={() => navigate("/add")}>
            去加油
          </button>
        </EmptyState>
      ) : (
        <div>
          {items.map((it) =>
            it.kind === "card" ? (
              <RecordCard
                key={it.record.id}
                record={it.record}
                con={it.con}
                status={it.status}
                collapsed={allCollapsed}
                onNavigate={() => navigate(`/records/${it.record.id}`)}
              />
            ) : (
              <GapRow key={it.id} km={it.km} estFuel={it.estFuel} estCost={it.estCost} />
            ),
          )}
        </div>
      )}
    </div>
  );
}

function YearPicker({ year, onChange, records }: { year: string; onChange: (y: string) => void; records: FuelRecord[] }) {
  const years = React.useMemo(() => {
    const set = new Set<string>();
    for (const r of records) {
      const y = (r.recordDate ?? "").slice(0, 4);
      if (y) set.add(y);
    }
    return ["all", ...Array.from(set).sort((a, b) => b.localeCompare(a))];
  }, [records]);
  return (
    <select
      className="form-input"
      value={year}
      onChange={(e) => onChange(e.target.value)}
      style={{ width: "auto", padding: "4px 10px", fontSize: 13 }}
    >
      {years.map((y) => (
        <option key={y} value={y}>{y === "all" ? "全部" : `${y}年`}</option>
      ))}
    </select>
  );
}

function RecordCard({ record, con, status, collapsed: globalCollapsed, onNavigate }: {
  record: FuelRecord;
  con?: number;
  status?: RecordStatus;
  collapsed: boolean;
  onNavigate: () => void;
}) {
  const [localCollapsed, setLocalCollapsed] = React.useState(false);
  const collapsed = globalCollapsed || localCollapsed;

  const date = (record.recordDate ?? "").slice(0, 10);
  const year = parseInt(date.slice(0, 4), 10);
  const dateLabel = year === CURRENT_YEAR ? date.slice(5) : date;
  const conText = con != null ? `${con.toFixed(2)}升/百公里` : null;
  const odo = Math.round(num(record.odometer));
  const cost = num(record.paidAmount ?? record.totalCost).toFixed(2);
  const price = num(record.price).toFixed(2);
  const liters = `+${num(record.liters).toFixed(2)}升`;
  const fullTank = record.fullTank === "yes";

  return (
    <div className="card" style={{ marginBottom: 6, padding: "10px 14px" }}>
      {/* Header row: date + consumption + odometer + collapse toggle */}
      <div
        style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
        onClick={onNavigate}
      >
        <span style={{ fontSize: 15, fontWeight: 700, flexShrink: 0 }}>{dateLabel}</span>
        {conText ? (
          <span style={{ fontSize: 13, color: "var(--accent)", flexShrink: 0 }}>{conText}</span>
        ) : null}
        <span style={{ fontSize: 13, color: "var(--text2)", flex: 1 }}>{odo}公里</span>
        <button
          className="btn btn-outline"
          style={{ width: "auto", padding: "2px 8px", fontSize: 12, flexShrink: 0 }}
          onClick={(e) => { e.stopPropagation(); setLocalCollapsed((c) => !c); }}
        >
          {collapsed ? "▼" : "▲"}
        </button>
      </div>

      {/* Status label */}
      {status?.label ? (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, fontSize: 11 }}>
          <span style={{
            width: 8, height: 8, borderRadius: "50%",
            background: status.dot, flexShrink: 0,
          }} />
          <span style={{ color: status.textColor }}>{status.label}</span>
        </div>
      ) : null}

      {/* Expanded details */}
      {!collapsed ? (
        <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6, fontSize: 13 }}>
          <Pill>{cost}元</Pill>
          <Pill>{price}元/升</Pill>
          <Pill highlight>{liters}</Pill>
          <Pill>{fuelLabel(record.fuelType)}</Pill>
          {fullTank ? <Pill>加满</Pill> : null}
          {record.light ? <Pill highlight>亮灯</Pill> : null}
        </div>
      ) : null}
    </div>
  );
}

function Pill({ children, highlight }: { children: React.ReactNode; highlight?: boolean }) {
  return (
    <span style={{
      padding: "2px 8px",
      background: highlight ? "rgba(245, 158, 11, 0.12)" : "var(--card2)",
      borderRadius: 6,
      color: highlight ? "var(--orange)" : "var(--text)",
      fontWeight: 500,
    }}>
      {children}
    </span>
  );
}

function GapRow({ km, estFuel, estCost }: { km: number; estFuel: number | null; estCost: number | null }) {
  return (
    <div style={{
      textAlign: "center",
      fontSize: 12,
      color: "var(--text2)",
      padding: "3px 0",
      marginBottom: 2,
    }}>
      {estFuel != null && estCost != null
        ? `预估用油 ${estFuel.toFixed(2)}升 · ¥${estCost.toFixed(2)} · 跑${km}公里`
        : `跑${km}公里 · 下次加满后计算`}
    </div>
  );
}

function avgConsumption(records: FuelRecord[]): number | null {
  const sorted = [...records].sort((a, b) => num(a.odometer) - num(b.odometer));
  const cs: number[] = [];
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
          if (c > 0 && c < 50) cs.push(c);
        }
        break;
      }
    }
  }
  if (cs.length === 0) return null;
  return cs.reduce((a, b) => a + b, 0) / cs.length;
}

import { notifyDataChanged } from "@/lib/stores";