// Maintenance detail / edit page at /maintenance/:mid — also handles the
// "new" pseudo-id (the maintenance list "+ 添加" button navigates here
// with mid="new") so the same form covers add + edit without a second route.

import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { maintenance as api, vehicles as vApi } from "@/lib/api";
import type { MaintenanceCreate, MaintenanceRecord, Trigger } from "@/lib/types";
import {
  MAINT_PRESETS,
  TRIGGER_LABELS,
  maintPreset,
  num,
  todayISO,
} from "@/lib/format";
import { MaintIcon } from "@/components/maint-icon";
import { useActiveVehicle } from "@/lib/use-active-vehicle";
import { pushToast } from "@/components/toast-host";
import { cardTitle, AppIcon } from "@/components/app-icon";
import { EmptyState } from "@/components/empty-state";
import { notifyDataChanged } from "@/lib/stores";

export function MaintDetailPage() {
  const { mid } = useParams<{ mid: string }>();
  const navigate = useNavigate();
  const { vehicle, loading } = useActiveVehicle();
  const isNew = mid === "new" || !mid;

  const [record, setRecord] = React.useState<MaintenanceRecord | null>(null);
  const [maintType, setMaintType] = React.useState("oil");
  const [customName, setCustomName] = React.useState("");
  const [trigger, setTrigger] = React.useState<Trigger>("either");
  const [recordDate, setRecordDate] = React.useState(todayISO());
  const [odometer, setOdometer] = React.useState("0");
  const [cost, setCost] = React.useState("0");
  const [nextDate, setNextDate] = React.useState("");
  const [nextOdo, setNextOdo] = React.useState("");
  const [note, setNote] = React.useState("");
  const [fetching, setFetching] = React.useState(!isNew);
  const [saving, setSaving] = React.useState(false);

  // When opening an existing record, scan every vehicle for it.
  React.useEffect(() => {
    if (isNew || !mid) return;
    setFetching(true);
    vApi.list().then(async (vs) => {
      for (const v of vs) {
        try {
          const rs = await api.list(v.id);
          const found = rs.find((r) => r.id === mid);
          if (found) {
            setRecord(found);
            setMaintType(found.maintType || "oil");
            setCustomName(found.customName ?? "");
            setTrigger(found.trigger || "either");
            setRecordDate(found.recordDate);
            setOdometer(String(num(found.odometer)));
            setCost(String(num(found.cost)));
            setNextDate(found.nextDate ?? "");
            setNextOdo(found.nextOdo != null ? String(num(found.nextOdo)) : "");
            setNote(found.note);
            setFetching(false);
            return;
          }
        } catch { /* keep scanning */ }
      }
      setFetching(false);
    }).catch((e) => { pushToast((e as Error).message); setFetching(false); });
  }, [mid, isNew]);

  // Update page title — MUST be before any early return to satisfy Rules of Hooks.
  React.useEffect(() => {
    document.title = isNew ? "添加保养 - 省点油" : "保养明细 - 省点油";
    return () => { document.title = "省点油"; };
  }, [isNew]);

  if (loading || fetching) return <EmptyState text="加载中…" />;
  if (!isNew && !record) {
    return (
      <EmptyState text="保养记录不存在或已删除">
        <button className="btn btn-outline" style={{ maxWidth: 200, margin: "12px auto 0" }} onClick={() => navigate("/maintenance")}>
          返回保养
        </button>
      </EmptyState>
    );
  }

  const preset = maintPreset(maintType);

  const save = async () => {
    setSaving(true);
    try {
      const payload: MaintenanceCreate = {
        maintType,
        customName: customName.trim(),
        trigger,
        recordDate,
        odometer: parseFloat(odometer) || 0,
        item: "",
        cost: parseFloat(cost) || 0,
        note,
        nextDate: nextDate || null,
        nextOdo: nextOdo ? parseFloat(nextOdo) : null,
      };
      if (isNew) {
        if (!vehicle) { pushToast("未找到车辆"); return; }
        await api.create(vehicle.id, payload);
        pushToast("已添加");
      } else {
        await api.update(record!.id, payload);
        pushToast("已更新");
      }
      notifyDataChanged();
      navigate("/maintenance");
    } catch (e) {
      pushToast((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!record) return;
    if (!confirm(`删除 ${record.recordDate} 的保养记录？`)) return;
    try {
      await api.remove(record.id);
      pushToast("已删除");
      notifyDataChanged();
      navigate("/maintenance");
    } catch (e) {
      pushToast((e as Error).message);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <button
          className="btn btn-outline"
          style={{ width: "auto", padding: "6px 12px", fontSize: 13, flexShrink: 0 }}
          onClick={() => navigate(-1)}
        >
          ← 返回
        </button>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, flex: 1 }}>{isNew ? "添加保养" : "保养明细"}</h2>
        {!isNew ? (
          <button
            type="button"
            className="btn btn-danger"
            style={{ width: "auto", padding: "6px 12px", fontSize: 13, flexShrink: 0 }}
            onClick={remove}
          >
            删除
          </button>
        ) : null}
        <button
          className="btn btn-primary"
          style={{ width: "auto", padding: "6px 16px", fontSize: 13, flexShrink: 0 }}
          disabled={saving}
          onClick={() => save()}
        >
          {saving ? "保存中…" : isNew ? "添加" : "修改"}
        </button>
      </div>
      <div className="card">
        <form onSubmit={(e) => { e.preventDefault(); save(); }}>
        <MaintTypePicker value={maintType} onChange={setMaintType} />
        <div className="form-group">
          <label>自定义名称（可选，覆盖默认名）</label>
          <input className="form-input" value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder={preset.name} />
        </div>
        <div className="form-group">
          <label>提醒规则</label>
          <select className="form-input" value={trigger} onChange={(e) => setTrigger(e.target.value as Trigger)}>
            {(Object.keys(TRIGGER_LABELS) as Trigger[]).map((k) => (
              <option key={k} value={k}>{TRIGGER_LABELS[k]}</option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>保养日期</label>
            <input className="form-input" type="date" value={recordDate} onChange={(e) => setRecordDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label>当时里程 km</label>
            <input className="form-input" type="number" value={odometer} onChange={(e) => setOdometer(e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label>费用 元</label>
          <input className="form-input" type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>下次保养日期</label>
            <input className="form-input" type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label>下次保养里程</label>
            <input className="form-input" type="number" placeholder="可选" value={nextOdo} onChange={(e) => setNextOdo(e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label>备注（选填）</label>
          <input className="form-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="品牌、型号等" />
        </div>
      </form>
      </div>
    </div>
  );
}

// Custom picker — native <select> can't render SVG icons inside <option>,
// so we build a simple scrollable button grid that shows the Lucide icon
// alongside each preset name.
function MaintTypePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="form-group">
      <label>保养项目</label>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
        {MAINT_PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            className="btn btn-outline"
            style={{
              width: "100%",
              padding: "8px 4px",
              fontSize: 11,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              borderRadius: 10,
              borderColor: value === p.key ? "var(--accent)" : undefined,
              color: value === p.key ? "var(--accent)" : undefined,
              background: value === p.key ? "rgba(59,130,246,0.08)" : undefined,
            }}
            onClick={() => onChange(p.key)}
          >
            <span style={{ fontSize: 22, lineHeight: 1 }}>{p.emoji}</span>
            <span>{p.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}