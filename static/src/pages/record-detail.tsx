// Fuel record detail / edit page at /records/:rid. Replaces the inline
// EditSheet that used to live on the now-deleted /records list page.
//
// The form uses the same four-way amount linkage as the Add page: changing
// 加油量 / 单价 / 机显金额 re-derives the others so the form is never
// inconsistent. 实付金额 is independent — it may differ from pump after
// a discount.

import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { records as api } from "@/lib/api";
import type { FuelRecord, FuelRecordCreate, FullTank } from "@/lib/types";
import {
  fuelLabel,
  num,
} from "@/lib/format";
import { useActiveVehicle } from "@/lib/use-active-vehicle";
import { pushToast } from "@/components/toast-host";
import { cardTitle, AppIcon } from "@/components/app-icon";
import { Lightbulb } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { notifyDataChanged } from "@/lib/stores";

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const FUEL_OPTS = ["92", "95", "98", "0"];

export function RecordDetailPage() {
  const { rid } = useParams<{ rid: string }>();
  const navigate = useNavigate();
  const { vehicle, loading } = useActiveVehicle();
  const [record, setRecord] = React.useState<FuelRecord | null>(null);
  const [form, setForm] = React.useState<FuelRecordCreate | null>(null);
  const [fetching, setFetching] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

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
          // datetime-local input needs YYYY-MM-DDTHH:mm; append T00:00 if the
          // backend only sent a date (YYYY-MM-DD).
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
  if (!vehicle) {
    return <EmptyState text="请先添加车辆" />;
  }
  if (!record || !form) {
    return (
      <EmptyState text="记录不存在或已删除">
        <button className="btn btn-outline" style={{ maxWidth: 200, margin: "12px auto 0" }} onClick={() => navigate("/")}>
          返回总览
        </button>
      </EmptyState>
    );
  }

  const liters = num(form.liters);
  const price = num(form.price);

  const setLiters = (v: number) => {
    const nl = r3(v), np = r3(nl * price);
    setForm((f) => f ? { ...f, liters: nl, pumpAmount: np, paidAmount: np } : f);
  };
  const setPrice = (v: number) => {
    const np = r3(v), npmp = r3(liters * np);
    setForm((f) => f ? { ...f, price: np, pumpAmount: npmp, paidAmount: npmp } : f);
  };
  const setPump = (v: number) => {
    const np = r3(v), nl = price > 0 ? r3(np / price) : liters;
    setForm((f) => f ? { ...f, pumpAmount: np, liters: nl, paidAmount: np } : f);
  };
  const setPaid = (v: number) => setForm((f) => f ? { ...f, paidAmount: r3(v) } : f);
  const update = <K extends keyof FuelRecordCreate>(k: K, v: FuelRecordCreate[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      await api.update(record.id, {
        ...form,
        pumpAmount: num(form.pumpAmount) || null,
        paidAmount: num(form.paidAmount) || null,
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
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, flex: 1 }}>加油明细</h2>
        <button
          type="button"
          className="btn btn-danger"
          style={{ width: "auto", padding: "6px 12px", fontSize: 13, flexShrink: 0 }}
          onClick={remove}
        >
          删除
        </button>
        <button
          className="btn btn-primary"
          style={{ width: "auto", padding: "6px 12px", fontSize: 13, flexShrink: 0 }}
          disabled={saving}
          onClick={() => save()}
        >
          {saving ? "修改中…" : "修改"}
        </button>
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
            <input className="form-input" type="number" step="0.1" value={form.odometer} onChange={(e) => update("odometer", parseFloat(e.target.value) || 0)} />
          </div>
          <div className="form-group">
            <label>加油量 L</label>
            <input className="form-input" type="number" step="0.01" value={form.liters} onChange={(e) => setLiters(parseFloat(e.target.value) || 0)} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>单价 元/L</label>
            <input className="form-input" type="number" step="0.01" value={form.price} onChange={(e) => setPrice(parseFloat(e.target.value) || 0)} />
          </div>
          <div className="form-group">
            <label>机显金额 ¥</label>
            <input className="form-input" type="number" step="0.01" value={form.pumpAmount || ""} onChange={(e) => setPump(parseFloat(e.target.value) || 0)} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>实付金额 ¥</label>
            <input className="form-input" type="number" step="0.01" value={form.paidAmount || ""} onChange={(e) => setPaid(parseFloat(e.target.value) || 0)} />
            {num(form.paidAmount) > 0 && num(form.pumpAmount) > 0 && Math.abs(num(form.paidAmount) - num(form.pumpAmount)) > 0.01 ? (
              <div className="autofill-hint" style={{ color: "var(--orange)" }}>
                <Lightbulb size={12} /> 实付与机显差额 ¥{(num(form.paidAmount) - num(form.pumpAmount)).toFixed(2)}
              </div>
            ) : null}
          </div>
          <div className="form-group">
            <label>油品</label>
            <select className="form-input" value={form.fuelType} onChange={(e) => update("fuelType", e.target.value)}>
              {FUEL_OPTS.map((o) => <option key={o} value={o}>{fuelLabel(o)}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label>加油站</label>
          <input className="form-input" value={form.station} onChange={(e) => update("station", e.target.value)} />
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
            <input
              type="checkbox"
              checked={form.light === true}
              onChange={(e) => update("light", e.target.checked)}
              style={{ width: 18, height: 18 }}
            />
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