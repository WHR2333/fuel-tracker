// Add fuel record page — four-way linked calculation between 加油量 / 单价 /
// 机显金额 / 实付金额.
//
// Layout changes per v2 spec:
//   - Header: back button + title + save button (no bottom save button)
//   - Vehicle selector: locked to the vehicle that was active when entering
//   - 单价×加油量=机显金额 on one line, with input fields directly below
//   - 实付金额独立一行

import * as React from "react";
import { useNavigate } from "react-router-dom";
import { records as api } from "@/lib/api";
import type { FuelRecord, FuelRecordCreate, FullTank, Vehicle } from "@/lib/types";
import { fuelLabel, num, nowDatetimeLocal } from "@/lib/format";
import { pushToast } from "@/components/toast-host";
import { notifyDataChanged } from "@/lib/stores";
import { cardTitle, AppIcon } from "@/components/app-icon";
import { Lightbulb } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { vehicles as vApi } from "@/lib/api";

const FUEL_OPTS = ["92", "95", "98", "0"];
const r3 = (n: number) => Math.round(n * 1000) / 1000;

const initial = (): FuelRecordCreate => ({
  recordDate: nowDatetimeLocal(),
  odometer: 0,
  liters: 0,
  price: 0,
  pumpAmount: 0,
  paidAmount: 0,
  fullTank: "yes",
  station: "",
  fuelType: "92",
  note: "",
  light: false,
});

export function AddPage() {
  const navigate = useNavigate();
  // Lock to the active vehicle at mount time — do NOT re-fetch when the
  // global vehicle changes, per spec.
  const [vehicle, setVehicle] = React.useState<Vehicle | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [form, setForm] = React.useState<FuelRecordCreate>(initial());
  const [last, setLast] = React.useState<FuelRecord | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    const vid = localStorage.getItem("fuel.activeVehicleId");
    if (!vid) { setLoading(false); return; }
    vApi.get(vid).then((v) => {
      setVehicle(v);
      return api.list(v.id);
    }).then((rs) => {
      if (rs.length > 0) {
        const sorted = [...rs].sort((a, b) => b.recordDate.localeCompare(a.recordDate));
        const latest = sorted[0];
        setLast(latest);
        const price = num(latest.price);
        setForm((f) => ({
          ...f,
          price: price > 0 ? Number(price.toFixed(2)) : f.price,
          station: latest.station || f.station,
          fuelType: latest.fuelType || f.fuelType,
        }));
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

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

  const liters = num(form.liters);
  const price = num(form.price);
  const pump = num(form.pumpAmount);
  const paid = num(form.paidAmount);

  // --- linked setters ---
  const setLiters = (v: number) => {
    const nl = r3(v), np = r3(nl * price);
    setForm((f) => ({ ...f, liters: nl, pumpAmount: np, paidAmount: np }));
  };
  const setPrice = (v: number) => {
    const np = r3(v), npmp = r3(liters * np);
    setForm((f) => ({ ...f, price: np, pumpAmount: npmp, paidAmount: npmp }));
  };
  const setPump = (v: number) => {
    const np = r3(v), nl = price > 0 ? r3(np / price) : liters;
    setForm((f) => ({ ...f, pumpAmount: np, liters: nl, paidAmount: np }));
  };
  const setPaid = (v: number) => setForm((f) => ({ ...f, paidAmount: r3(v) }));

  const doSave = async () => {
    setSubmitting(true);
    try {
      const payload: FuelRecordCreate = {
        ...form,
        odometer: num(form.odometer),
        liters: num(form.liters),
        price: num(form.price),
        pumpAmount: num(form.pumpAmount) || null,
        paidAmount: num(form.paidAmount) || null,
      };
      await api.create(vehicle.id, payload);
      pushToast("已添加");
      notifyDataChanged();
      setForm({ ...form, odometer: 0, liters: 0, pumpAmount: 0, paidAmount: 0, note: "", light: false });
    } catch (err) {
      pushToast((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const priceAutofilled = last != null && num(last.price) > 0 && num(form.price) === Number(num(last.price).toFixed(2));
  const stationAutofilled = last != null && !!last.station && form.station === last.station;

  // Formula string: 单价×加油量=机显金额
  const formula = price > 0 && liters > 0
    ? `${price.toFixed(2)} × ${liters.toFixed(2)} = ${pump.toFixed(2)}`
    : null;

  return (
    <div>
      {/* Header: back + title + save button */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <button
          className="btn btn-outline"
          style={{ width: "auto", padding: "6px 12px", fontSize: 13, flexShrink: 0 }}
          onClick={() => navigate(-1)}
        >
          ← 返回
        </button>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, flex: 1 }}>
          添加加油 · {vehicle.name}
        </h2>
        <button
          className="btn btn-primary"
          style={{ width: "auto", padding: "6px 16px", fontSize: 13, flexShrink: 0 }}
          disabled={submitting}
          onClick={() => doSave()}
        >
          {submitting ? "保存中…" : "保存"}
        </button>
      </div>

      <div className="card">
        <div className="form-group">
          <label>日期</label>
          <input className="form-input" type="datetime-local" value={form.recordDate} onChange={(e) => setForm((f) => ({ ...f, recordDate: e.target.value }))} required />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>里程表 km</label>
            <input
              className="form-input"
              type="number"
              step="0.1"
              value={form.odometer || ""}
              placeholder={last ? `上次: ${Math.round(num(last.odometer))}km` : "当前里程"}
              onChange={(e) => setForm((f) => ({ ...f, odometer: parseFloat(e.target.value) || 0 }))}
              required
            />
          </div>
          <div className="form-group">
            <label>油品</label>
            <select className="form-input" value={form.fuelType} onChange={(e) => setForm((f) => ({ ...f, fuelType: e.target.value }))}>
              {FUEL_OPTS.map((o) => <option key={o} value={o}>{fuelLabel(o)}</option>)}
            </select>
          </div>
        </div>

        {/* 单价×加油量=机显金额 — label row above, 3 inputs below, aligned */}
        <div className="form-group">
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
            <label style={{ margin: 0 }}>单价 × 加油量 = 机显金额</label>
            {formula ? <span style={{ fontSize: 12, color: "var(--accent)" }}>{formula}</span> : null}
            {priceAutofilled ? <div className="autofill-hint"><Lightbulb size={12} /> 自动填充上次价格</div> : null}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <input
              className="form-input"
              type="number"
              step="0.01"
              value={price || ""}
              placeholder="单价"
              onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
              required
            />
            <input
              className="form-input"
              type="number"
              step="0.01"
              value={liters || ""}
              placeholder="加油量 L"
              onChange={(e) => setLiters(parseFloat(e.target.value) || 0)}
              required
            />
            <input
              className="form-input"
              type="number"
              step="0.01"
              value={pump || ""}
              placeholder="机显金额"
              onChange={(e) => setPump(parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>实付金额 ¥</label>
            <input className="form-input" type="number" step="0.01" value={paid || ""} onChange={(e) => setPaid(parseFloat(e.target.value) || 0)} placeholder="通常 = 机显" />
            {paid > 0 && pump > 0 && Math.abs(paid - pump) > 0.01 ? (
              <div className="autofill-hint" style={{ color: "var(--orange)" }}>
                <Lightbulb size={12} /> 差额 ¥{(paid - pump).toFixed(2)}
              </div>
            ) : null}
          </div>
          <div className="form-group">
            <label>加油站（选填）</label>
            <input className="form-input" value={form.station} onChange={(e) => setForm((f) => ({ ...f, station: e.target.value }))} placeholder="中石化/中石油/..." />
            {stationAutofilled ? <div className="autofill-hint"><Lightbulb size={12} /> 自动填充上次加油站</div> : null}
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>是否加满</label>
            <select className="form-input" value={form.fullTank} onChange={(e) => setForm((f) => ({ ...f, fullTank: e.target.value as FullTank }))}>
              <option value="yes">加满</option>
              <option value="no">未加满</option>
            </select>
          </div>
          <div className="form-group">
            <label style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 24 }}>
              <input
                type="checkbox"
                checked={form.light === true}
                onChange={(e) => setForm((f) => ({ ...f, light: e.target.checked }))}
                style={{ width: 18, height: 18 }}
              />
              <Lightbulb size={16} strokeWidth={1} /> 油量表灯亮
            </label>
          </div>
        </div>

        <div className="form-group">
          <label>备注（选填）</label>
          <input className="form-input" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="路况、驾驶习惯等" />
        </div>
      </div>
    </div>
  );
}