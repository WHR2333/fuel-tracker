// Fuel record detail / edit page at /records/:rid.
//
// Same blur-based rules as Add page:
//   - Fill any 2 of 单价 / 加油量 / 机显金额 → auto-calculate the 3rd on blur
//   - 金额修约: round to 0.01 元 (分)
//   - 实付金额 is independent

import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { records as api } from "@/lib/api";
import type { FuelRecord, FuelRecordCreate, FullTank } from "@/lib/types";
import { fuelLabel, num } from "@/lib/format";
import { useActiveVehicle } from "@/lib/use-active-vehicle";
import { pushToast } from "@/components/toast-host";
import { Lightbulb } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { notifyDataChanged } from "@/lib/stores";

const r2 = (n: number) => Math.round(n * 100) / 100;
const pn = (s: string): number => { const n = parseFloat(s); return isNaN(n) ? NaN : n; };
const FUEL_OPTS = ["92", "95", "98", "0"];

export function RecordDetailPage() {
  const { rid } = useParams<{ rid: string }>();
  const navigate = useNavigate();
  const { vehicle, loading } = useActiveVehicle();
  const [record, setRecord] = React.useState<FuelRecord | null>(null);
  const [form, setForm] = React.useState<FuelRecordCreate | null>(null);
  const [fetching, setFetching] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [editing, setEditing] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!vehicle || !rid) return;
    setFetching(true);
    api.list(vehicle.id).then((rs) => {
      const found = rs.find((r) => r.id === rid) ?? null;
      setRecord(found);
      if (found) {
        const total = num(found.totalCost);
        const pump = num(found.pumpAmount) || total;
        const paid = num(found.paidAmount) || pump;
        setForm({
          recordDate: found.recordDate.length <= 10 ? `${found.recordDate}T00:00` : found.recordDate,
          odometer: num(found.odometer),
          liters: num(found.liters),
          price: num(found.price),
          pumpAmount: pump,
          paidAmount: paid,
          fullTank: found.fullTank,
          station: found.station,
          fuelType: found.fuelType,
          note: found.note,
          light: found.light === true,
        });
      }
      setFetching(false);
    }).catch((e) => {
      pushToast((e as Error).message);
      setFetching(false);
    });
  }, [vehicle?.id, rid]);

  React.useEffect(() => {
    document.title = "明细 - 省点油";
    return () => { document.title = "省点油"; };
  }, []);

  if (loading || fetching) return <EmptyState text="加载中…" />;
  if (!vehicle) return <EmptyState text="请先添加车辆" />;
  if (!record || !form) {
    return (
      <EmptyState text="记录不存在或已删除">
        <button className="btn btn-outline" style={{ maxWidth: 200, margin: "12px auto 0" }} onClick={() => navigate("/")}>返回总览</button>
      </EmptyState>
    );
  }

  // ---------- helpers ----------

  const displayVal = (key: string, val: number | string | null) =>
    key in editing ? editing[key] : (Number(val) || "");

  const handleFocus = (key: string, val: number | string | null) => {
    const n = Number(val) || 0;
    setEditing((e) => ({ ...e, [key]: n ? String(n) : "" }));
  };

  const handlePriceBlur = (key: "liters" | "price" | "pumpAmount", raw: string) => {
    const parsed = r2(pn(raw));
    const value = isNaN(parsed) ? 0 : parsed;
    setForm((f) => {
      if (!f) return f;
      const next = { ...f, [key]: value };
      const l = Number(next.liters) || 0;
      const p = Number(next.price) || 0;
      const m = Number(next.pumpAmount) || 0;
      const hasL = l > 0, hasP = p > 0, hasM = m > 0;
      const count = (hasL ? 1 : 0) + (hasP ? 1 : 0) + (hasM ? 1 : 0);
      if (count === 2) {
        if (!hasL && hasP && hasM) next.liters = r2(m / p);
        if (!hasP && hasL && hasM) next.price = r2(m / l);
        if (!hasM && hasL && hasP) next.pumpAmount = r2(l * p);
      }
      return next;
    });
    setEditing((e) => { const n = { ...e }; delete n[key]; return n; });
  };

  const handleSimpleBlur = (key: "odometer" | "paidAmount", raw: string) => {
    const parsed = r2(pn(raw));
    setForm((f) => f ? { ...f, [key]: isNaN(parsed) ? 0 : parsed } : f);
    setEditing((e) => { const n = { ...e }; delete n[key]; return n; });
  };

  const update = <K extends keyof FuelRecordCreate>(k: K, v: FuelRecordCreate[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  // ---------- actions ----------

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      await api.update(record.id, {
        ...form,
        pumpAmount: pn(String(form.pumpAmount)) || null,
        paidAmount: pn(String(form.paidAmount)) || null,
      });
      pushToast("已更新");
      notifyDataChanged();
      navigate("/");
    } catch (e) {
      pushToast((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm(`删除 ${record.recordDate} 的加油记录？`)) return;
    try {
      await api.remove(record.id);
      pushToast("已删除");
      notifyDataChanged();
      navigate("/");
    } catch (e) {
      pushToast((e as Error).message);
    }
  };

  // ---------- render ----------

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <button className="btn btn-outline" style={{ width: "auto", padding: "6px 12px", fontSize: 13, flexShrink: 0 }} onClick={() => navigate(-1)}>← 返回</button>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, flex: 1 }}>加油明细</h2>
        <button type="button" className="btn btn-danger" style={{ width: "auto", padding: "6px 12px", fontSize: 13, flexShrink: 0 }} onClick={remove}>删除</button>
        <button className="btn btn-primary" style={{ width: "auto", padding: "6px 12px", fontSize: 13, flexShrink: 0 }} disabled={saving} onClick={() => save()}>{saving ? "修改中…" : "修改"}</button>
      </div>
      <div className="card">
        <form onSubmit={(e) => { e.preventDefault(); save(); }}>
          <div className="form-group">
            <label>日期</label>
            <input className="form-input" type="datetime-local" value={form.recordDate} onChange={(e) => update("recordDate", e.target.value)} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>里程表 km</label>
              <input
                className="form-input" type="number" step="0.1"
                value={displayVal("odometer", form.odometer)}
                onFocus={() => handleFocus("odometer", form.odometer)}
                onChange={(e) => setEditing((ed) => ({ ...ed, odometer: e.target.value }))}
                onBlur={(e) => handleSimpleBlur("odometer", e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>油品</label>
              <select className="form-input" value={form.fuelType} onChange={(e) => update("fuelType", e.target.value)}>
                {FUEL_OPTS.map((o) => <option key={o} value={o}>{fuelLabel(o)}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
              <label style={{ margin: 0 }}>单价 × 加油量 = 机显金额</label>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <input
                className="form-input" type="number" step="0.01"
                value={displayVal("price", form.price)}
                placeholder="单价 ¥"
                onFocus={() => handleFocus("price", form.price)}
                onChange={(e) => setEditing((ed) => ({ ...ed, price: e.target.value }))}
                onBlur={(e) => handlePriceBlur("price", e.target.value)}
              />
              <input
                className="form-input" type="number" step="0.01"
                value={displayVal("liters", form.liters)}
                placeholder="加油量 L"
                onFocus={() => handleFocus("liters", form.liters)}
                onChange={(e) => setEditing((ed) => ({ ...ed, liters: e.target.value }))}
                onBlur={(e) => handlePriceBlur("liters", e.target.value)}
              />
              <input
                className="form-input" type="number" step="0.01"
                value={displayVal("pumpAmount", Number(form.pumpAmount) || 0)}
                placeholder="机显金额 ¥"
                onFocus={() => handleFocus("pumpAmount", Number(form.pumpAmount) || 0)}
                onChange={(e) => setEditing((ed) => ({ ...ed, pumpAmount: e.target.value }))}
                onBlur={(e) => handlePriceBlur("pumpAmount", e.target.value)}
              />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>实付金额 ¥</label>
              <input
                className="form-input" type="number" step="0.01"
                value={displayVal("paidAmount", Number(form.paidAmount) || 0)}
                placeholder="通常 = 机显"
                onFocus={() => handleFocus("paidAmount", Number(form.paidAmount) || 0)}
                onChange={(e) => setEditing((ed) => ({ ...ed, paidAmount: e.target.value }))}
                onBlur={(e) => handleSimpleBlur("paidAmount", e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>加油站</label>
              <input className="form-input" value={form.station} onChange={(e) => update("station", e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label>是否加满</label>
            <select className="form-input" value={form.fullTank} onChange={(e) => update("fullTank", e.target.value as FullTank)}>
              <option value="yes">加满</option>
              <option value="no">未加满</option>
            </select>
          </div>
          <div className="form-group">
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={form.light === true} onChange={(e) => update("light", e.target.checked)} style={{ width: 18, height: 18 }} />
              <Lightbulb size={16} strokeWidth={1} /> 油量表灯亮
            </label>
          </div>
          <div className="form-group">
            <label>备注</label>
            <input className="form-input" value={form.note} onChange={(e) => update("note", e.target.value)} />
          </div>
        </form>
      </div>
    </div>
  );
}
