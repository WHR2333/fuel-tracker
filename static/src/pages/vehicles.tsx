// Vehicles page — list (with edit button) + add/edit sheet + data mgmt.
// Edits go through the same <VehicleSheet> in either add or edit mode.
// Every mutating action notifies the global stores so the header dropdown
// + other pages refresh.

import * as React from "react";
import { vehicles as api, admin } from "@/lib/api";
import type { Vehicle, ExportPayload } from "@/lib/types";
import { BottomSheet } from "@/components/bottom-sheet";
import { cardTitle, AppIcon } from "@/components/app-icon";
import { EmptyState } from "@/components/empty-state";
import { num, vehicleLabel } from "@/lib/format";
import { useActiveVehicle } from "@/lib/use-active-vehicle";
import { pushToast } from "@/components/toast-host";
import { notifyVehiclesChanged, notifyActiveVehicleChanged, notifyDataChanged } from "@/lib/stores";

export function VehiclesPage() {
  const [list, setList] = React.useState<Vehicle[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<Vehicle | null>(null);
  const { vehicle: activeVehicle, setActive, refresh } = useActiveVehicle();

  const reload = React.useCallback(async () => {
    setLoading(true);
    try {
      setList(await api.list());
    } catch (e) {
      pushToast((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { reload(); }, [reload]);

  const clearAll = async () => {
    if (!confirm("确定清空所有数据？此操作不可撤销！")) return;
    if (!confirm("再次确认：清空所有车辆、加油记录、保养记录？")) return;
    try {
      for (const v of list) {
        await api.remove(v.id);
      }
      pushToast("已清空");
      await reload();
      await refresh();
      notifyVehiclesChanged();
      notifyDataChanged();
    } catch (e) {
      pushToast((e as Error).message);
    }
  };

  const remove = async (v: Vehicle) => {
    if (!confirm(`删除车辆 "${v.name}"?关联的加油/保养记录会一并删除。`)) return;
    try {
      await api.remove(v.id);
      pushToast("已删除");
      await reload();
      await refresh();
      notifyVehiclesChanged();
      notifyDataChanged();
    } catch (e) {
      pushToast((e as Error).message);
    }
  };

  return (
    <div>
      <div className="card">
        <div className="card-title">{cardTitle("car", "我的车辆")}</div>
        {loading ? (
          <EmptyState text="加载中…" />
        ) : list.length === 0 ? (
          <EmptyState text="还没有车辆，点击下方添加。" />
        ) : (
          <div>
            {list.map((v) => (
              <div
                key={v.id}
                className={`vehicle-card${v.id === activeVehicle?.id ? " selected" : ""}`}
                onClick={() => setActive(v.id)}
              >
                <div className="vehicle-card-icon"><AppIcon name="car" size={32} strokeWidth={1} /></div>
                <div className="vehicle-card-info">
                  <div className="vehicle-card-name">{v.name}</div>
                  <div className="vehicle-card-plate">{v.plate || "未设置车牌"} · {v.model || "未知车型"}</div>
                  <div className="vehicle-card-stats">油箱 {num(v.tank)} L · {vehicleLabel(v)}</div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    className="btn btn-outline"
                    style={{ padding: "6px 10px", fontSize: 12 }}
                    onClick={(e) => { e.stopPropagation(); setEditing(v); }}
                  >
                    编辑
                  </button>
                  <button
                    className="btn btn-danger"
                    style={{ padding: "6px 10px", fontSize: 12 }}
                    onClick={(e) => { e.stopPropagation(); remove(v); }}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <button className="btn btn-outline" style={{ width: "100%", marginTop: 12 }} onClick={() => setAdding(true)}>
          + 添加车辆
        </button>
      </div>

      <div className="card">
        <div className="card-title">{cardTitle("wrench", "数据管理")}</div>
        <div className="btn-row">
          <button className="btn btn-outline" onClick={handleExportTxt}>导出数据</button>
          <label className="btn btn-outline" style={{ cursor: "pointer" }}>
            导入数据
            <input
              type="file"
              accept=".txt"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImportTxt(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="btn btn-danger" style={{ width: "100%" }} onClick={clearAll}>清空所有数据</button>
        </div>
      </div>

      <VehicleSheet
        open={adding || !!editing}
        editing={editing}
        onClose={() => { setAdding(false); setEditing(null); }}
        onSaved={async () => {
          setAdding(false);
          setEditing(null);
          await reload();
          await refresh();
          notifyVehiclesChanged();
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// TXT export / import — human-readable, round-trippable.
// Format:
//   # 省点油 数据导出
//   # 导出时间: 2026-07-12T...
//   # 车辆数: 1  加油数: 3  保养数: 1
//   ---
//   [车辆]
//   id=xxx
//   name=测试
//   plate=A1
//   tank=50
//   model=雅阁
//
//   [加油记录]
//   id=xxx
//   vehicle_id=xxx
//   record_date=2026-07-11
//   odometer=12300
//   liters=35
//   price=7.88
//   total_cost=275.80
//   pump_amount=275.80
//   paid_amount=275.80
//   full_tank=yes
//   station=中石化
//   fuel_type=92
//   note=
//   light=false
//
//   [保养记录]
//   ...
//   ---
//   (next vehicle block or EOF)

function handleExportTxt() {
  admin.export().then((data) => {
    const lines: string[] = [];
    lines.push("# 省点油 数据导出");
    lines.push(`# 导出时间: ${new Date().toISOString()}`);
    lines.push(`# 车辆数: ${data.vehicles.length}  加油数: ${data.records.length}  保养数: ${data.maint.length}`);
    lines.push("---");

    for (const v of data.vehicles) {
      lines.push("[车辆]");
      const fields: Record<string, unknown> = v as unknown as Record<string, unknown>;
      for (const [k, val] of Object.entries(fields)) {
        lines.push(`${k}=${val === null || val === undefined ? "" : String(val)}`);
      }
      lines.push("");
    }

    for (const r of data.records) {
      lines.push("[加油记录]");
      const fields: Record<string, unknown> = r as unknown as Record<string, unknown>;
      for (const [k, val] of Object.entries(fields)) {
        lines.push(`${k}=${val === null || val === undefined ? "" : String(val)}`);
      }
      lines.push("");
    }

    for (const m of data.maint) {
      lines.push("[保养记录]");
      const fields: Record<string, unknown> = m as unknown as Record<string, unknown>;
      for (const [k, val] of Object.entries(fields)) {
        lines.push(`${k}=${val === null || val === undefined ? "" : String(val)}`);
      }
      lines.push("");
    }

    lines.push("---");
    const blob = new Blob([lines.join("\n")], { type: "text/plain; charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `省点油_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    pushToast("已导出");
  }).catch((e) => pushToast((e as Error).message));
}

function parseTxtBlocks(text: string): { vehicles: Record<string, unknown>[]; records: Record<string, unknown>[]; maint: Record<string, unknown>[] } {
  const vehicles: Record<string, unknown>[] = [];
  const records: Record<string, unknown>[] = [];
  const maint: Record<string, unknown>[] = [];

  let currentBlock: Record<string, unknown> | null = null;
  let currentType: string | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line === "---") continue;

    if (line === "[车辆]") {
      if (currentBlock && currentType) pushBlock(currentType, currentBlock);
      currentType = "vehicle";
      currentBlock = {};
      continue;
    }
    if (line === "[加油记录]") {
      if (currentBlock && currentType) pushBlock(currentType, currentBlock);
      currentType = "record";
      currentBlock = {};
      continue;
    }
    if (line === "[保养记录]") {
      if (currentBlock && currentType) pushBlock(currentType, currentBlock);
      currentType = "maint";
      currentBlock = {};
      continue;
    }

    const eq = line.indexOf("=");
    if (eq < 0 || !currentBlock) continue;
    const key = line.slice(0, eq);
    const val = line.slice(eq + 1);
    currentBlock[key] = val === "" ? null : val;
  }
  // flush last block
  if (currentBlock && currentType) pushBlock(currentType, currentBlock);

  function pushBlock(type: string, block: Record<string, unknown>) {
    if (type === "vehicle") vehicles.push(block);
    else if (type === "record") records.push(block);
    else if (type === "maint") maint.push(block);
  }

  return { vehicles, records, maint };
}

function handleImportTxt(file: File) {
  file.text().then((text) => {
    const blocks = parseTxtBlocks(text);
    if (blocks.vehicles.length === 0 && blocks.records.length === 0 && blocks.maint.length === 0) {
      pushToast("文件格式不对，没有识别到数据");
      return;
    }
    // Convert raw key=value maps into the shape admin.import expects.
    const payload: ExportPayload = {
      version: "v5",
      exportedAt: new Date().toISOString(),
      vehicles: blocks.vehicles as unknown as ExportPayload["vehicles"],
      records: blocks.records as unknown as ExportPayload["records"],
      maint: blocks.maint as unknown as ExportPayload["maint"],
    };
    return admin.import(payload);
  }).then((counts) => {
    if (!counts) return;
    pushToast(`已导入：${counts.vehicles} 车 / ${counts.records} 加油 / ${counts.maint} 保养`);
    // Reload everything by triggering the stores.
    notifyVehiclesChanged();
    notifyDataChanged();
  }).catch((e) => pushToast((e as Error).message));
}

function VehicleSheet({
  open, editing, onClose, onSaved,
}: {
  open: boolean;
  editing: Vehicle | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = React.useState("我的车");
  const [plate, setPlate] = React.useState("");
  const [tank, setTank] = React.useState("50");
  const [model, setModel] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setPlate(editing.plate);
      setTank(String(num(editing.tank)));
      setModel(editing.model);
    } else {
      setName("我的车");
      setPlate("");
      setTank("50");
      setModel("");
    }
  }, [open, editing]);

  const submit = async () => {
    try {
      const payload = {
        name: name.trim() || "我的车",
        plate: plate.trim(),
        tank: parseFloat(tank) || 50,
        model: model.trim(),
      };
      if (editing) {
        await api.update(editing.id, payload);
        pushToast("已更新");
      } else {
        await api.create(payload);
        pushToast("已添加");
      }
      onSaved();
    } catch (e) {
      pushToast((e as Error).message);
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={editing ? "编辑车辆" : "添加车辆"}
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={submit}>保存</button>
        </>
      }
    >
      <div className="form-group">
        <label>车辆名称</label>
        <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="我的爱车" />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>车牌号</label>
          <input className="form-input" value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="京A12345" />
        </div>
        <div className="form-group">
          <label>油箱容量 L</label>
          <input className="form-input" type="number" value={tank} onChange={(e) => setTank(e.target.value)} placeholder="50" />
        </div>
      </div>
      <div className="form-group">
        <label>车型（选填）</label>
        <input className="form-input" value={model} onChange={(e) => setModel(e.target.value)} placeholder="丰田卡罗拉 2023" />
      </div>
    </BottomSheet>
  );
}