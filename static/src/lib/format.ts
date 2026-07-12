// Formatting + label helpers shared by every page. Mirrors v4's display
// conventions so a v4 user sees the same Chinese strings + same precision.

import type { FuelRecord, MaintenanceRecord, Trigger, Vehicle } from "./types";

export const num = (v: number | string | null | undefined): number => {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
};

export const fmtMoney = (v: number | string | null | undefined) => `¥${num(v).toFixed(2)}`;
export const fmtLiters = (v: number | string) => `${num(v).toFixed(2)} 升`;
export const fmtOdo = (v: number | string) => `${Math.round(num(v))} 公里`;
export const fmtL100 = (v: number | string) => `${num(v).toFixed(2)}`;

// --- fuel labels / colors ---

export const FUEL_LABELS: Record<string, { label: string; color: string }> = {
  "92": { label: "92#", color: "#3b82f6" },
  "95": { label: "95#", color: "#10b981" },
  "98": { label: "98#", color: "#f59e0b" },
  "0": { label: "柴油", color: "#8b5cf6" },
};

export const fuelLabel = (t: string) => FUEL_LABELS[t]?.label ?? t;
export const fuelColor = (t: string) => FUEL_LABELS[t]?.color ?? "#64748b";

// --- maintenance presets (12 items + an "other" filler) ---
// iconKey maps to a Lucide icon name so the UI can render <MaintIcon name={preset.iconKey} />.

export interface MaintPreset {
  key: string;
  iconKey: string;
  emoji: string;
  name: string;
  defaultKm: number;
  defaultMonth: number;
}

export const MAINT_PRESETS: MaintPreset[] = [
  { key: "oil", iconKey: "droplets", emoji: "🛢️", name: "机油", defaultKm: 5000, defaultMonth: 6 },
  { key: "oilFilter", iconKey: "circle-dot", emoji: "🔘", name: "机滤", defaultKm: 5000, defaultMonth: 6 },
  { key: "airFilter", iconKey: "wind", emoji: "🌬️", name: "空滤", defaultKm: 15000, defaultMonth: 12 },
  { key: "acFilter", iconKey: "wind", emoji: "❄️", name: "空调滤", defaultKm: 15000, defaultMonth: 12 },
  { key: "tire", iconKey: "circle", emoji: "🛞", name: "轮胎", defaultKm: 40000, defaultMonth: 36 },
  { key: "brake", iconKey: "octagon", emoji: "🛑", name: "刹车片", defaultKm: 40000, defaultMonth: 24 },
  { key: "coolant", iconKey: "thermometer", emoji: "🧊", name: "防冻液", defaultKm: 40000, defaultMonth: 24 },
  { key: "transmission", iconKey: "cog", emoji: "🔩", name: "变速箱油", defaultKm: 60000, defaultMonth: 36 },
  { key: "gearOil", iconKey: "cog", emoji: "⚙️", name: "齿轮油", defaultKm: 60000, defaultMonth: 36 },
  { key: "belt", iconKey: "circle", emoji: "🔗", name: "皮带", defaultKm: 80000, defaultMonth: 48 },
  { key: "spark", iconKey: "zap", emoji: "⚡", name: "火花塞", defaultKm: 30000, defaultMonth: 24 },
  { key: "battery", iconKey: "battery-full", emoji: "🔋", name: "电瓶", defaultKm: 0, defaultMonth: 36 },
  { key: "wash", iconKey: "spray-can", emoji: "🧹", name: "节气门清洗", defaultKm: 20000, defaultMonth: 12 },
  { key: "align", iconKey: "ruler", emoji: "📐", name: "四轮定位", defaultKm: 10000, defaultMonth: 12 },
  { key: "other", iconKey: "wrench", emoji: "🔧", name: "其他", defaultKm: 0, defaultMonth: 0 },
];

export const maintPreset = (key: string): MaintPreset =>
  MAINT_PRESETS.find((p) => p.key === key) ?? MAINT_PRESETS[MAINT_PRESETS.length - 1];

/** Resolve the user-visible name for a maintenance record. */
export const maintName = (r: { maintType: string; customName?: string }): string => {
  const custom = (r.customName ?? "").trim();
  if (custom) return custom;
  return maintPreset(r.maintType).name;
};

// --- trigger labels ---

export const TRIGGER_LABELS: Record<Trigger, string> = {
  date: "按时间",
  odo: "按里程",
  either: "时间或里程 (任一)",
  none: "不提醒",
};

// --- reference car models for the Stats → Compare tab ---

export const REF_CONSUMPTION: Array<{ key: string; name: string; l_per_100: number }> = [
  { key: "卡罗拉", name: "丰田卡罗拉", l_per_100: 6.5 },
  { key: "思域", name: "本田思域", l_per_100: 7.0 },
  { key: "轩逸", name: "日产轩逸", l_per_100: 6.8 },
  { key: "朗逸", name: "大众朗逸", l_per_100: 7.2 },
  { key: "宝来", name: "大众宝来", l_per_100: 7.0 },
  { key: "雅阁", name: "本田雅阁", l_per_100: 7.5 },
  { key: "凯美瑞", name: "丰田凯美瑞", l_per_100: 7.8 },
  { key: "迈腾", name: "大众迈腾", l_per_100: 8.0 },
  { key: "帕萨特", name: "大众帕萨特", l_per_100: 8.0 },
  { key: "天籁", name: "日产天籁", l_per_100: 7.5 },
  { key: "CR-V", name: "本田CR-V", l_per_100: 8.5 },
  { key: "RAV4", name: "丰田RAV4", l_per_100: 8.2 },
  { key: "途观", name: "大众途观", l_per_100: 9.0 },
  { key: "汉兰达", name: "丰田汉兰达", l_per_100: 10.0 },
  { key: "哈弗H6", name: "哈弗H6", l_per_100: 9.5 },
  { key: "Model 3", name: "Tesla Model 3", l_per_100: 15.0 },
  { key: "Model Y", name: "Tesla Model Y", l_per_100: 16.0 },
  { key: "秦PLUS", name: "比亚迪秦PLUS", l_per_100: 3.8 },
  { key: "宋PLUS", name: "比亚迪宋PLUS", l_per_100: 5.0 },
  { key: "奔驰C", name: "奔驰C级", l_per_100: 8.5 },
  { key: "宝马3", name: "宝马3系", l_per_100: 8.5 },
  { key: "奥迪A4", name: "奥迪A4", l_per_100: 8.0 },
  { key: "速腾", name: "大众速腾", l_per_100: 7.0 },
  { key: "飞度", name: "本田飞度", l_per_100: 5.5 },
  { key: "Polo", name: "大众Polo", l_per_100: 6.0 },
  { key: "缤智", name: "本田缤智", l_per_100: 7.0 },
  { key: "XR-V", name: "本田XR-V", l_per_100: 7.0 },
];

// --- today helpers ---

export const nowDatetimeLocal = (): string => {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
};

export const todayISO = (): string => new Date().toISOString().slice(0, 10);

// --- date range presets for the Stats page ---

export interface DateRange {
  label: string;
  start: string | null;
  end: string | null;
}

export const dateRangePresets = (): DateRange[] => {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const days = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    return iso(d);
  };
  const quarterStart = (() => {
    const m = today.getMonth();
    const startMonth = m - (m % 3);
    const d = new Date(today.getFullYear(), startMonth, 1);
    return iso(d);
  })();
  return [
    { label: "全部", start: null, end: null },
    { label: "最近 30 天", start: days(30), end: iso(today) },
    { label: "最近 90 天", start: days(90), end: iso(today) },
    { label: "上季度", start: quarterStart, end: iso(today) },
    { label: "今年", start: `${today.getFullYear()}-01-01`, end: iso(today) },
    { label: "去年", start: `${today.getFullYear() - 1}-01-01`, end: `${today.getFullYear() - 1}-12-31` },
  ];
};

export const filterByDateRange = <T extends { recordDate: string }>(
  records: T[],
  start: string | null,
  end: string | null,
): T[] => {
  return records.filter((r) => {
    const d = r.recordDate.slice(0, 10);
    if (start && d < start) return false;
    if (end && d > end) return false;
    return true;
  });
};

export const consumptionColor = (v: number): string => {
  if (v <= 8) return "#10b981";
  if (v <= 10) return "#3b82f6";
  return "#f59e0b";
};

export const recordMatchesSearch = (r: FuelRecord, q: string): boolean => {
  if (!q.trim()) return true;
  const lower = q.toLowerCase();
  return (
    (r.station ?? "").toLowerCase().includes(lower) ||
    (r.note ?? "").toLowerCase().includes(lower)
  );
};

// --- maintenance reminder types ---

export type ReminderStatus = "ok" | "warn" | "overdue";

export interface ReminderItem {
  label: string;
  iconKey: string;
  emoji: string;
  status: ReminderStatus;
  kmLeft: number | null;
  daysLeft: number | null;
  lastRecord?: MaintenanceRecord;
  trigger: Trigger;
}

// --- misc ---

export const vehicleLabel = (v: Vehicle | null | undefined): string => {
  if (!v) return "";
  return v.plate || v.name || v.id;
};