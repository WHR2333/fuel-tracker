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
import { fuelLabel, nowDatetimeLocal, num } from "@/lib/format";
import { pushToast } from "@/components/toast-host";
import { notifyDataChanged } from "@/lib/stores";
import { Lightbulb, SkipForward } from "lucide-react";
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
  light: true,
  skippedPrevious: false,
});

export function AddPage() {
  const navigate = useNavigate();
  const [vehicle, setVehicle] = React.useState<Vehicle | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [form, setForm] = React.useState<FuelRecordCreate>(initial());
  const [last, setLast] = React.useState<FuelRecord | null>(null);
  const [allRecords, setAllRecords] = React.useState<FuelRecord[]>([]);
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
      setAllRecords(rs);
      if (rs.length > 0) {
        const sorted = [...rs].sort((a, b) => num(b.odometer) - num(a.odometer));
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
  const displayVal = (key: string, val: number | string | null) =>
    key in editing ? editing[key] : (Number(val) || "");

  /** On focus: capture raw string for editing. */
  const handleFocus = (key: string, val: number | string | null) => {
    const n = Number(val) || 0;
    setEditing((e) => ({ ...e, [key]: n ? String(n) : "" }));
  };

  /**
   * On blur: parse → round → store → auto-calc linked field.
   *
   * Rules (always apply, not just when exactly 2 filled):
   *   改单价  → 基于总价反算油量  (oil = total ÷ price)
   *   改加油量 → 基于总价反算单价  (price = total ÷ oil)
   *   改机显金额 → 基于当前单价反算油量 (oil = total ÷ price)
   */
  const handlePriceBlur = (key: "liters" | "price" | "pumpAmount", raw: string) => {
    const parsed = r2(pn(raw));
    const value = isNaN(parsed) ? 0 : parsed;

    setForm((f) => {
      const next = { ...f, [key]: value };
      const l = Number(next.liters) || 0;
      const p = Number(next.price) || 0;
      const m = Number(next.pumpAmount) || 0;

      if (key === "price" && p > 0 && m > 0) {
        // 改单价 → 油量 = 总价 ÷ 单价
        next.liters = r2(m / p);
      } else if (key === "liters" && l > 0 && m > 0) {
        // 改油量 → 单价 = 总价 ÷ 油量
        next.price = r2(m / l);
      } else if (key === "pumpAmount" && m > 0 && p > 0) {
        // 改金额 → 油量 = 金额 ÷ 单价
        next.liters = r2(m / p);
      } else if (l > 0 && p > 0) {
        // 两个有值，第三个缺失 → 补全
        if (!m) next.pumpAmount = r2(l * p);
        else if (!p) next.price = r2(m / l);
        else if (!l) next.liters = r2(m / p);
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
    // Validate required fields.
    const odo = pn(String(form.odometer));
    const lit = pn(String(form.liters));
    const pri = pn(String(form.price));
    if (!odo || odo <= 0) { pushToast("请填写里程表"); return; }
    if (!lit || lit <= 0) { pushToast("请填写加油量"); return; }
    if (!pri || pri <= 0) { pushToast("请填写单价"); return; }
    if (form.recordDate && new Date(form.recordDate).getTime() > Date.now()) {
      pushToast("加油时间不能是未来时间");
      return;
    }

    setSubmitting(true);
    try {
      const payload: FuelRecordCreate = {
        ...form,
        odometer: odo,
        liters: lit,
        price: pri,
        pumpAmount: pn(String(form.pumpAmount)) || null,
        paidAmount: pn(String(form.paidAmount)) || null,
      };
      await api.create(vehicle.id, payload);
      pushToast("已添加");

      // Scenario hints after save.
      const isFull = form.fullTank === "yes";
      const prevFull = last?.fullTank === "yes";
      const hasHistory = allRecords.length > 0;

      if (!hasHistory && !isFull) {
        pushToast("首次加油建议加满跳枪，否则无法计算本次油耗");
      } else if (!isFull) {
        // Count consecutive non-full including this one.
        let consecNonFull = 1;
        for (let i = allRecords.length - 1; i >= 0; i--) {
          if (allRecords[i].fullTank !== "yes") consecNonFull++;
          else break;
        }
        pushToast("本次未加满，将不参与单次油耗计算，仅计入总账");
        if (consecNonFull >= 3) {
          pushToast(`您已连续${consecNonFull}次未加满，建议加满跳枪`);
        }
      } else if (isFull && !prevFull && hasHistory) {
        let merged = 0;
        for (let i = allRecords.length - 1; i >= 0; i--) {
          if (allRecords[i].fullTank !== "yes") merged++;
          else break;
        }
        if (merged > 0) {
          pushToast(`本次加满将结算之前（${merged}次）未满加油量`);
        }
      }

      notifyDataChanged();
      navigate("/");
    } catch (err) {
      pushToast((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- render ----------

  const priceAutofilled = last != null && pn(String(last.price)) > 0 && form.price === r2(pn(String(last.price)));
  const stationAutofilled = last != null && !!last.station && form.station === last.station;

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
          </div>
          <div className="form-group">
            <label>加油站（选填）</label>
            <input className="form-input" value={form.station} onChange={(e) => setForm((f) => ({ ...f, station: e.target.value }))} placeholder="中石化/中石油/..." />
            {stationAutofilled ? <div className="autofill-hint"><Lightbulb size={12} /> 自动填充上次加油站</div> : null}
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={form.fullTank === "yes"}
                onChange={(e) => setForm((f) => ({ ...f, fullTank: e.target.checked ? "yes" : "no" as FullTank }))}
                style={{ width: 18, height: 18 }}
              />
              加满跳枪
            </label>
          </div>
          <div className="form-group">
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={form.light === true}
                onChange={(e) => setForm((f) => ({ ...f, light: e.target.checked }))}
                style={{ width: 18, height: 18 }}
              />
              <Lightbulb size={16} strokeWidth={1} /> 油量表灯亮
            </label>
          </div>
          <div className="form-group">
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={form.skippedPrevious === true}
                onChange={(e) => setForm((f) => ({ ...f, skippedPrevious: e.target.checked }))}
                style={{ width: 18, height: 18 }}
              />
              <SkipForward size={16} strokeWidth={1} /> 上次加油没有记录
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
