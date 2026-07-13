// Add fuel record page.
//
// Rules:
//   - Fill any 2 of 单价 / 加油量 / 机显金额 → auto-calculate the 3rd on blur
//   - 金额修约: round to 0.01 元 (分)
//   - No real-time linking — compute only on blur
//   - 实付金额 is independent (user enters manually)

import * as React from "react";
import { useNavigate } from "react-router-dom";
import { records as api } from "@/lib/api";
import type { FuelRecord, FuelRecordCreate, FullTank, Vehicle } from "@/lib/types";
import { fuelLabel, nowDatetimeLocal } from "@/lib/format";
import { pushToast } from "@/components/toast-host";
import { notifyDataChanged } from "@/lib/stores";
import { Lightbulb } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { vehicles as vApi } from "@/lib/api";

const FUEL_OPTS = ["92", "95", "98", "0"];

/** Round to 0.01 元 (分). */
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Parse a numeric string; returns NaN if empty/invalid. */
const pn = (s: string): number => {
  const n = parseFloat(s);
  return isNaN(n) ? NaN : n;
};

/** Format number with thousand separators + 2 decimals for hint display. */
const fmtHint = (n: number) =>
  n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
  const [vehicle, setVehicle] = React.useState<Vehicle | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [form, setForm] = React.useState<FuelRecordCreate>(initial());
  const [last, setLast] = React.useState<FuelRecord | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  // Tracks which price fields are currently being edited (raw string).
  const [editing, setEditing] = React.useState<Record<string, string>>({});

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
        const price = pn(String(latest.price));
        setForm((f) => ({
          ...f,
          price: price > 0 ? r2(price) : f.price,
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

  // ---------- helpers ----------

  /** Return display value for a price input. */
  const displayVal = (key: string, val: number) =>
    key in editing ? editing[key] : (val || "");

  /** On focus: capture raw string for editing. */
  const handleFocus = (key: string, val: number) => {
    setEditing((e) => ({ ...e, [key]: val ? String(val) : "" }));
  };

  /**
   * On blur: parse → round → store → auto-calc the 3rd field.
   * Any 2 of (liters, price, pumpAmount) filled → compute the 3rd.
   */
  const handlePriceBlur = (key: "liters" | "price" | "pumpAmount", raw: string) => {
    const parsed = r2(pn(raw));
    const value = isNaN(parsed) ? 0 : parsed;

    setForm((f) => {
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
    setForm((f) => ({ ...f, [key]: isNaN(parsed) ? 0 : parsed }));
    setEditing((e) => { const n = { ...e }; delete n[key]; return n; });
  };

  // ---------- save ----------

  const doSave = async () => {
    setSubmitting(true);
    try {
      const payload: FuelRecordCreate = {
        ...form,
        odometer: pn(String(form.odometer)) || 0,
        liters: pn(String(form.liters)) || 0,
        price: pn(String(form.price)) || 0,
        pumpAmount: pn(String(form.pumpAmount)) || null,
        paidAmount: pn(String(form.paidAmount)) || null,
      };
      await api.create(vehicle.id, payload);
      pushToast("已添加");
      notifyDataChanged();
      setForm({ ...form, odometer: 0, liters: 0, price: 0, pumpAmount: 0, paidAmount: 0, note: "", light: false });
      setEditing({});
    } catch (err) {
      pushToast((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- render ----------

  const priceAutofilled = last != null && pn(String(last.price)) > 0 && form.price === r2(pn(String(last.price)));
  const stationAutofilled = last != null && !!last.station && form.station === last.station;

  // Hint for the amount field: show thousand-separated value
  const pumpVal = form.pumpAmount;
  const paidVal = form.paidAmount;

  return (
    <div>
      {/* Header */}
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
              value={displayVal("odometer", form.odometer)}
              placeholder={last ? `上次: ${Math.round(pn(String(last.odometer)))}km` : "当前里程"}
              onFocus={() => handleFocus("odometer", form.odometer)}
              onChange={(e) => setEditing((ed) => ({ ...ed, odometer: e.target.value }))}
              onBlur={(e) => handleSimpleBlur("odometer", e.target.value)}
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

        {/* 单价 / 加油量 / 机显金额 — fill any 2, blur to compute the 3rd */}
        <div className="form-group">
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
            <label style={{ margin: 0 }}>单价 × 加油量 = 机显金额</label>
            {priceAutofilled ? <div className="autofill-hint"><Lightbulb size={12} /> 自动填充上次价格</div> : null}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <input
              className="form-input"
              type="number"
              step="0.01"
              value={displayVal("price", form.price)}
              placeholder="单价 ¥"
              onFocus={() => handleFocus("price", form.price)}
              onChange={(e) => setEditing((ed) => ({ ...ed, price: e.target.value }))}
              onBlur={(e) => handlePriceBlur("price", e.target.value)}
              required
            />
            <input
              className="form-input"
              type="number"
              step="0.01"
              value={displayVal("liters", form.liters)}
              placeholder="加油量 L"
              onFocus={() => handleFocus("liters", form.liters)}
              onChange={(e) => setEditing((ed) => ({ ...ed, liters: e.target.value }))}
              onBlur={(e) => handlePriceBlur("liters", e.target.value)}
              required
            />
            <div>
              <input
                className="form-input"
                type="number"
                step="0.01"
                value={displayVal("pumpAmount", form.pumpAmount)}
                placeholder="机显金额 ¥"
                onFocus={() => handleFocus("pumpAmount", form.pumpAmount)}
                onChange={(e) => setEditing((ed) => ({ ...ed, pumpAmount: e.target.value }))}
                onBlur={(e) => handlePriceBlur("pumpAmount", e.target.value)}
              />
              {pumpVal > 0 && !("pumpAmount" in editing) ? (
                <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 2, paddingLeft: 2 }}>
                  ¥{fmtHint(pumpVal)}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>实付金额 ¥</label>
            <input
              className="form-input"
              type="number"
              step="0.01"
              value={displayVal("paidAmount", form.paidAmount)}
              placeholder="通常 = 机显"
              onFocus={() => handleFocus("paidAmount", form.paidAmount)}
              onChange={(e) => setEditing((ed) => ({ ...ed, paidAmount: e.target.value }))}
              onBlur={(e) => handleSimpleBlur("paidAmount", e.target.value)}
            />
            {paidVal > 0 && !("paidAmount" in editing) ? (
              <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 2, paddingLeft: 2 }}>
                ¥{fmtHint(paidVal)}
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
