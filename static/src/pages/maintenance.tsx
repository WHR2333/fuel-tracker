// Maintenance page — reminder list + cost stats + history. The add/edit
// form has been lifted to its own route at /maintenance/:mid (maint-detail),
// so this page only lists things and links out to detail on click.

import * as React from "react";
import { useNavigate } from "react-router-dom";
import { maintenance as api, records as recApi } from "@/lib/api";
import type { MaintenanceRecord, FuelRecord } from "@/lib/types";
import { cardTitle, AppIcon } from "@/components/app-icon";
import { EmptyState } from "@/components/empty-state";
import { CompareBar } from "@/components/compare-bar";
import { MaintIcon } from "@/components/maint-icon";
import {
  fmtMoney,
  fmtOdo,
  maintName,
  maintPreset,
  num,
} from "@/lib/format";
import { calcReminders } from "@/lib/stats";
import { useActiveVehicle } from "@/lib/use-active-vehicle";
import { useDataVersion } from "@/lib/stores";
import { pushToast } from "@/components/toast-host";

export function MaintenancePage() {
  const { vehicle, loading } = useActiveVehicle();
  const navigate = useNavigate();
  const dataVer = useDataVersion();

  const [records, setRecords] = React.useState<MaintenanceRecord[]>([]);
  const [fuel, setFuel] = React.useState<FuelRecord[]>([]);

  const reload = React.useCallback(async (vid: string) => {
    const [m, f] = await Promise.all([api.list(vid), recApi.list(vid)]);
    setRecords(m);
    setFuel(f);
  }, []);

  React.useEffect(() => {
    if (vehicle) reload(vehicle.id);
  }, [vehicle?.id, reload, dataVer]);

  if (loading) return <EmptyState text="加载中…" />;
  if (!vehicle) return <EmptyState text="请先添加车辆" />;

  const currentOdo = fuel.length > 0
    ? Math.max(...fuel.map((r) => num(r.odometer)))
    : 0;

  const reminders = calcReminders(records, currentOdo);

  const totalCost = records.reduce((s, m) => s + num(m.cost), 0);
  const byName = new Map<string, number>();
  for (const r of records) {
    const k = maintName(r);
    byName.set(k, (byName.get(k) ?? 0) + num(r.cost));
  }
  const sortedByType = Array.from(byName.entries())
    .map(([k, v]) => ({ label: k, cost: v, emoji: maintPreset(records.find((r) => maintName(r) === k)?.maintType ?? "other").emoji }))
    .sort((a, b) => b.cost - a.cost);
  const maxTypeCost = Math.max(1, ...sortedByType.map((s) => s.cost));

  const history = [...records].sort((a, b) => b.recordDate.localeCompare(a.recordDate));

  // Removing now goes through the detail page so the per-record "编辑/删除"
  // buttons can stay there. The list page just navigates.
  return (
    <div>
      <div className="card">
        <div className="card-title">{cardTitle("wrench", "保养提醒")}</div>
        {reminders.length === 0 ? (
          <EmptyState text="—" />
        ) : (
          <div>
            {reminders.map((r, i) => (
              <div key={`${r.label}-${i}`} className="maint-item">
                <div className="maint-icon">{r.emoji || "📌"}</div>
                <div className="maint-info">
                  <div className="maint-name">{r.label}</div>
                  <div className="maint-detail">
                    {r.lastRecord
                      ? `上次 ${r.lastRecord.recordDate} · ${fmtOdo(r.lastRecord.odometer)}`
                      : `从未保养 · 当前里程 ${fmtOdo(currentOdo)}`}
                  </div>
                  <div className="maint-detail">
                    {r.trigger === "date" || r.trigger === "either" ? (
                      <span>触发: {r.daysLeft != null ? `${r.daysLeft} 天后` : "时间"}</span>
                    ) : null}
                    {r.trigger === "odo" || r.trigger === "either" ? (
                      <span>{r.trigger === "either" ? " · " : "触发: "}{r.kmLeft != null ? `${Math.round(r.kmLeft)} km 后` : "里程"}</span>
                    ) : null}
                  </div>
                </div>
                <span className={`maint-status maint-${r.status}`}>
                  {r.status === "overdue" ? "已到期" : r.status === "warn" ? "即将到期" : "正常"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-title">{cardTitle("money", "保养费用统计")}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          <div className="stat-tile">
            <div className="stat-label">累计费用</div>
            <div className="stat-value" style={{ fontSize: 28, color: "var(--orange)" }}>{fmtMoney(totalCost)}</div>
            <div className="stat-label">元</div>
          </div>
          <div className="stat-tile">
            <div className="stat-label">保养次数</div>
            <div className="stat-value" style={{ fontSize: 28, color: "var(--accent)" }}>{String(records.length)}</div>
            <div className="stat-label">次</div>
          </div>
          <div className="stat-tile">
            <div className="stat-label">保养类型</div>
            <div className="stat-value" style={{ fontSize: 28, color: "var(--accent)" }}>{String(sortedByType.length)}</div>
            <div className="stat-label">种</div>
          </div>
        </div>
        {sortedByType.length > 0 ? (
          <div style={{ marginTop: 12 }}>
            {sortedByType.map((s) => (
              <CompareBar
                key={s.label}
                label={<span>{s.emoji} {s.label}</span>}
                value={s.cost}
                pct={(s.cost / maxTypeCost) * 100}
                color="var(--orange)"
                hideValue
              />
            ))}
          </div>
        ) : null}
      </div>

      <div className="card">
        <div className="card-title" style={{ justifyContent: "space-between" }}>
          {cardTitle("file", "保养历史")}
          <button
            className="btn btn-outline"
            style={{ width: "auto", padding: "4px 10px", fontSize: 12 }}
            onClick={() => navigate(`/maintenance/new`)}
          >
            + 添加
          </button>
        </div>
        {history.length === 0 ? (
          <EmptyState text="—">
            <button className="btn btn-primary" style={{ maxWidth: 200, margin: "12px auto 0" }} onClick={() => navigate("/maintenance/new")}>
              添加保养
            </button>
          </EmptyState>
        ) : (
          <div>
            {history.map((m) => {
              const preset = maintPreset(m.maintType);
              return (
                <div key={m.id} className="maint-item" onClick={() => navigate(`/maintenance/${m.id}`)} style={{ cursor: "pointer" }}>
                  <div className="maint-icon">{preset.emoji}</div>
                  <div className="maint-info">
                    <div className="maint-name">{maintName(m)} {m.item && `· ${m.item}`}</div>
                    <div className="maint-detail">
                      {m.recordDate} · {fmtOdo(m.odometer)}
                      {m.nextOdo != null ? ` · 下次 ${fmtOdo(m.nextOdo)}` : ""}
                      {m.nextDate ? ` · 下次 ${m.nextDate}` : ""}
                      {m.note ? ` · ${m.note}` : ""}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontWeight: 700 }}>{fmtMoney(m.cost)}</div>
                    <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 4 }}>点击查看详情 →</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}