// Frontend-only stats layer. The backend's /analytics endpoint returns just
// a monthly aggregate; everything else (avgConsumption, stdDev, station
// ranking, anomaly detection, behavior score, etc.) is computed here from
// the raw records + maintenance the page already has.
//
// The functions are pure: same input → same output, no I/O, no React. That
// keeps unit-testing trivial and lets us memoize at the page level.

import type {
  FuelRecord,
  MaintenanceRecord,
  Trigger,
  Vehicle,
} from "./types";
import {
  MAINT_PRESETS,
  MaintPreset,
  ReminderItem,
  ReminderStatus,
  maintName,
  maintPreset,
  num,
} from "./format";

// --- types ---

export interface ConsumptionPoint {
  date: string;
  odometer: number;
  liters: number;
  price: number;
  l_per_100: number; // computed consumption
  isAnomaly: boolean;
  /** Number of preceding non-full records merged into this calculation. */
  mergedCount: number;
  /** Total liters consumed in this segment (current + intermediates). */
  totalLiters: number;
}

export interface Stats {
  count: number;
  totalFuel: number;
  totalCost: number;
  totalDist: number;
  avgConsumption: number; // L/100km
  avgPrice: number; // ¥/L
  best: number; // min L/100km
  worst: number;
  costPerKm: number;
  consumptions: ConsumptionPoint[]; // valid full-tank entries only
}

export interface CostPrediction {
  nextFillDays: number;
  nextFillCost: number;
  yearlyCost: number;
}

// --- helpers ---

interface ConResult {
  l_per_100: number;
  /** Total liters consumed since the previous full tank (inclusive of intermediates). */
  totalLiters: number;
}

/**
 * Two-full-tank method (两次加满法).
 *
 * Given the current record (sorted[i]) which must be full tank, scan
 * backwards to find the PREVIOUS full tank record.  Distance and
 * consumption are computed against that previous full tank.
 *
 * ALL liters from the previous full tank up to and including the current
 * record are summed — this covers intermediate non-full fills whose fuel
 * was consumed in the same segment.
 *
 * skippedPrevious: if true, there were unrecorded fill-ups before this
 * one — so this record cannot be the endpoint of a consumption segment.
 * It CAN serve as the baseline for the NEXT segment.
 *
 * Returns null if:
 *   - current record is not full tank
 *   - current record has skippedPrevious set (unknown baseline)
 *   - no previous full tank exists
 *   - distance ≤ 0 or consumption is out of range
 */
const validCon = (sorted: FuelRecord[], i: number): ConResult | null => {
  const r = sorted[i];
  if (r.fullTank !== "yes") return null;
  if (r.skippedPrevious) return null;
  // Sum all liters from previous full tank to current (inclusive).
  let totalLiters = num(r.liters);
  for (let j = i - 1; j >= 0; j--) {
    totalLiters += num(sorted[j].liters);
    if (sorted[j].fullTank === "yes") {
      const dist = num(r.odometer) - num(sorted[j].odometer);
      if (dist <= 0) return null;
      const l_per_100 = (totalLiters / dist) * 100;
      if (!Number.isFinite(l_per_100) || l_per_100 <= 0 || l_per_100 >= 50) return null;
      return { l_per_100, totalLiters };
    }
  }
  return null; // no previous full tank found
};

// --- main entry ---

export const calcStats = (records: FuelRecord[]): Stats | null => {
  const sorted = [...records].sort((a, b) => num(a.odometer) - num(b.odometer));
  if (sorted.length === 0) return null;

  const consumptions: ConsumptionPoint[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const result = validCon(sorted, i);
    if (result == null) continue;
    // Count non-full records between prev full tank and current.
    let merged = 0;
    for (let j = i - 1; j >= 0; j--) {
      if (sorted[j].fullTank === "yes") break;
      merged++;
    }
    consumptions.push({
      date: sorted[i].recordDate,
      odometer: num(sorted[i].odometer),
      liters: num(sorted[i].liters),
      price: num(sorted[i].price),
      l_per_100: result.l_per_100,
      isAnomaly: false, // backfilled below
      mergedCount: merged,
      totalLiters: result.totalLiters,
    });
  }

  const conValues = consumptions.map((c) => c.l_per_100);
  const avgCon = conValues.length
    ? conValues.reduce((a, b) => a + b, 0) / conValues.length
    : 0;
  // Anomaly = >120% of mean AND non-zero mean. v4 threshold.
  for (const c of consumptions) {
    c.isAnomaly = avgCon > 0 && c.l_per_100 > avgCon * 1.2;
  }

  const totalFuel = sorted.reduce((s, r) => s + num(r.liters), 0);
  const totalCost = sorted.reduce((s, r) => s + num(r.totalCost), 0);
  const totalDist =
    sorted.length >= 2 ? num(sorted[sorted.length - 1].odometer) - num(sorted[0].odometer) : 0;
  const avgPrice = totalFuel > 0 ? totalCost / totalFuel : 0;
  const best = conValues.length ? Math.min(...conValues) : 0;
  const worst = conValues.length ? Math.max(...conValues) : 0;
  const costPerKm = totalDist > 0 ? totalCost / totalDist : 0;

  return {
    count: sorted.length,
    totalFuel,
    totalCost,
    totalDist,
    avgConsumption: avgCon,
    avgPrice,
    best,
    worst,
    costPerKm,
    consumptions,
  };
};

/** Most recent computed consumption, or null if not enough data. */
export const latestConsumption = (
  records: FuelRecord[],
): {
  date: string;
  odometer: number;
  l_per_100: number;
  costPerKm: number;
  days: number;
  distance: number;
  dailyAvg: number;
  liters: number;
  totalCost: number;
} | null => {
  const sorted = [...records].sort((a, b) => num(a.odometer) - num(b.odometer));
  for (let i = sorted.length - 1; i > 0; i--) {
    const c = validCon(sorted, i);
    if (c != null) {
      const cur = sorted[i];
      // Find the previous full tank record (跳枪).
      let prevIdx = i - 1;
      while (prevIdx >= 0 && sorted[prevIdx].fullTank !== "yes") prevIdx--;
      const prev = sorted[prevIdx];
      const dist = num(cur.odometer) - num(prev.odometer);
      const days = Math.max(1, Math.round(
        (new Date(cur.recordDate).getTime() - new Date(prev.recordDate).getTime()) / 86400000,
      ) + 1);
      // Sum costs from prev full tank to current (inclusive), matching totalLiters.
      let totalCost = 0;
      for (let k = prevIdx; k <= i; k++) {
        totalCost += num(sorted[k].totalCost);
      }
      return {
        date: cur.recordDate,
        odometer: num(cur.odometer),
        l_per_100: c.l_per_100,
        costPerKm: dist > 0 ? totalCost / dist : 0,
        days,
        distance: dist,
        dailyAvg: dist / days,
        liters: c.totalLiters,
        totalCost,
      };
    }
  }
  return null;
};

// --- cost prediction: simple linear projection ---
export const calcCostPrediction = (records: FuelRecord[]): CostPrediction | null => {
  if (records.length < 3) return null;
  const sorted = [...records].sort(
    (a, b) => new Date(a.recordDate).getTime() - new Date(b.recordDate).getTime(),
  );
  const first = new Date(sorted[0].recordDate).getTime();
  const last = new Date(sorted[sorted.length - 1].recordDate).getTime();
  const spanDays = Math.max(1, (last - first) / (1000 * 60 * 60 * 24));
  const totalCost = sorted.reduce((s, r) => s + num(r.totalCost), 0);
  const dailyCost = totalCost / spanDays;
  const avgGap = spanDays / (sorted.length - 1);
  const avgCost = totalCost / sorted.length;
  return {
    nextFillDays: Math.max(1, Math.round(avgGap)),
    nextFillCost: Math.round(avgCost * 100) / 100,
    yearlyCost: Math.round(dailyCost * 365 * 100) / 100,
  };
};

// --- standard deviation / CV ---

export const stdDev = (values: number[]): number => {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sq = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(sq);
};

// --- driving behavior score ---
// score = clamp(0, 100, round(100 - cv * 200)). Higher CV → worse.
export const calcBehaviorScore = (consumptions: number[]): number => {
  if (consumptions.length < 3) return 0;
  const mean = consumptions.reduce((a, b) => a + b, 0) / consumptions.length;
  if (mean <= 0) return 0;
  const cv = stdDev(consumptions) / mean;
  return Math.max(0, Math.min(100, Math.round(100 - cv * 200)));
};

// --- monthly buckets ---

export interface MonthlyBucket {
  month: string; // YYYY-MM
  count: number;
  totalCost: number;
  totalFuel: number;
  firstOdo: number;
  lastOdo: number;
  distance: number;
  l_per_100km: number;
  momPct: number | null; // month-over-month cost change %
}

export const calcMonthly = (records: FuelRecord[]): MonthlyBucket[] => {
  const buckets = new Map<string, MonthlyBucket>();
  for (const r of [...records].sort(
    (a, b) => new Date(a.recordDate).getTime() - new Date(b.recordDate).getTime(),
  )) {
    const key = (r.recordDate ?? "").slice(0, 7);
    if (!key) continue;
    let b = buckets.get(key);
    if (!b) {
      b = {
        month: key,
        count: 0,
        totalCost: 0,
        totalFuel: 0,
        firstOdo: 0,
        lastOdo: 0,
        distance: 0,
        l_per_100km: 0,
        momPct: null,
      };
      buckets.set(key, b);
    }
    b.count += 1;
    b.totalCost += num(r.totalCost);
    b.totalFuel += num(r.liters);
    const odo = num(r.odometer);
    if (b.count === 1) b.firstOdo = odo;
    b.lastOdo = odo;
  }
  const arr = Array.from(buckets.values()).sort((a, b) => a.month.localeCompare(b.month));
  for (const b of arr) {
    b.distance = Math.max(0, b.lastOdo - b.firstOdo);
    b.l_per_100km = b.distance > 0 ? (b.totalFuel / b.distance) * 100 : 0;
  }
  for (let i = 1; i < arr.length; i++) {
    const prev = arr[i - 1].totalCost;
    arr[i].momPct = prev > 0 ? ((arr[i].totalCost - prev) / prev) * 100 : null;
  }
  return arr;
};

// --- yearly buckets (same shape, year key) ---

export const calcYearly = (records: FuelRecord[]) => {
  const buckets = new Map<string, { year: string; count: number; totalCost: number; totalFuel: number; distance: number }>();
  for (const r of records) {
    const y = (r.recordDate ?? "").slice(0, 4);
    if (!y) continue;
    let b = buckets.get(y);
    if (!b) {
      b = { year: y, count: 0, totalCost: 0, totalFuel: 0, distance: 0 };
      buckets.set(y, b);
    }
    b.count += 1;
    b.totalCost += num(r.totalCost);
    b.totalFuel += num(r.liters);
  }
  const byYear = new Map<string, { firstOdo: number; lastOdo: number }>();
  for (const r of [...records].sort(
    (a, b) => new Date(a.recordDate).getTime() - new Date(b.recordDate).getTime(),
  )) {
    const y = (r.recordDate ?? "").slice(0, 4);
    if (!y) continue;
    let pair = byYear.get(y);
    if (!pair) {
      pair = { firstOdo: num(r.odometer), lastOdo: num(r.odometer) };
      byYear.set(y, pair);
    } else {
      pair.lastOdo = num(r.odometer);
    }
  }
  return Array.from(buckets.values())
    .map((b) => {
      const odo = byYear.get(b.year);
      const dist = odo ? Math.max(0, odo.lastOdo - odo.firstOdo) : 0;
      return {
        ...b,
        distance: dist,
        l_per_100km: dist > 0 ? (b.totalFuel / dist) * 100 : 0,
      };
    })
    .sort((a, b) => a.year.localeCompare(b.year));
};

// --- station aggregations ---

export interface StationStat {
  name: string;
  count: number;
  totalCost: number;
  avgPrice: number; // ¥/L
  cheapest: boolean;
}

export const calcStationStats = (records: FuelRecord[]): StationStat[] => {
  const groups = new Map<string, { count: number; totalCost: number; totalLiters: number }>();
  for (const r of records) {
    const name = (r.station ?? "").trim() || "未记录";
    let g = groups.get(name);
    if (!g) {
      g = { count: 0, totalCost: 0, totalLiters: 0 };
      groups.set(name, g);
    }
    g.count += 1;
    g.totalCost += num(r.totalCost);
    g.totalLiters += num(r.liters);
  }
  const arr = Array.from(groups.entries()).map(([name, g]) => ({
    name,
    count: g.count,
    totalCost: g.totalCost,
    avgPrice: g.totalLiters > 0 ? g.totalCost / g.totalLiters : 0,
    cheapest: false,
  }));
  arr.sort((a, b) => b.count - a.count);
  const candidates = arr.filter((a) => a.name !== "未记录" && a.avgPrice > 0);
  if (candidates.length > 0) {
    const cheapest = candidates.reduce((m, x) => (x.avgPrice < m.avgPrice ? x : m));
    const found = arr.find((a) => a.name === cheapest.name);
    if (found) found.cheapest = true;
  }
  return arr;
};

// --- maintenance reminders ---
//
// Per-record trigger semantics:
//   "date"   → fire on next_date
//   "odo"    → fire on next_odo
//   "either" → fire when EITHER is reached (whichever comes first)
//   "none"   → no reminder (still listed, but always green)

const daysBetween = (a: Date, b: Date) =>
  Math.ceil((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));

const dateDueStatus = (daysLeft: number | null): ReminderStatus => {
  if (daysLeft == null) return "ok";
  if (daysLeft < 0) return "overdue";
  if (daysLeft < 30) return "warn";
  return "ok";
};

const odoDueStatus = (kmLeft: number | null, defaultKm: number): ReminderStatus => {
  if (kmLeft == null || defaultKm === 0) return "ok";
  if (kmLeft < 0) return "overdue";
  if (kmLeft < defaultKm * 0.15) return "warn";
  return "ok";
};

const STATUS_RANK: Record<ReminderStatus, number> = { overdue: 0, warn: 1, ok: 2 };

export const calcReminders = (
  records: MaintenanceRecord[],
  currentOdo: number,
): ReminderItem[] => {
  // Walk each preset + each custom-named record. Build one reminder per
  // (preset OR custom-name) with the latest matching record as the source.
  const groups = new Map<string, MaintenanceRecord>();
  for (const r of records) {
    const key = r.customName?.trim()
      ? `custom:${r.customName.trim().toLowerCase()}`
      : r.maintType || "other";
    const existing = groups.get(key);
    if (
      !existing ||
      new Date(r.recordDate).getTime() > new Date(existing.recordDate).getTime()
    ) {
      groups.set(key, r);
    }
  }

  const out: ReminderItem[] = [];
  for (const [, latest] of groups) {
    const trigger: Trigger = latest.trigger || "either";
    if (trigger === "none") {
      out.push({
        label: maintName(latest),
        iconKey: maintPreset(latest.maintType).iconKey,
        emoji: maintPreset(latest.maintType).emoji,
        status: "ok",
        kmLeft: null,
        daysLeft: null,
        lastRecord: latest,
        trigger,
      });
      continue;
    }
    const preset = maintPreset(latest.maintType);
    const baseOdo = num(latest.odometer);
    const nextOdo = latest.nextOdo != null ? num(latest.nextOdo) : baseOdo + preset.defaultKm;
    const kmLeft = nextOdo - currentOdo;
    let daysLeft: number | null = null;
    if (preset.defaultMonth > 0) {
      const lastDate = new Date(latest.recordDate);
      const due = new Date(lastDate);
      due.setMonth(due.getMonth() + preset.defaultMonth);
      daysLeft = daysBetween(new Date(), due);
    }

    let dateStatus: ReminderStatus = "ok";
    let odoStatus: ReminderStatus = "ok";
    if (trigger === "date" || trigger === "either") dateStatus = dateDueStatus(daysLeft);
    if (trigger === "odo" || trigger === "either") odoStatus = odoDueStatus(kmLeft, preset.defaultKm);

    let status: ReminderStatus = "ok";
    if (trigger === "date") status = dateStatus;
    else if (trigger === "odo") status = odoStatus;
    else status = STATUS_RANK[dateStatus] < STATUS_RANK[odoStatus] ? dateStatus : odoStatus;

    out.push({
      label: maintName(latest),
      iconKey: preset.iconKey,
      emoji: preset.emoji,
      status,
      kmLeft,
      daysLeft,
      lastRecord: latest,
      trigger,
    });
  }
  return out.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]);
};

// --- behavior stats (avg gap days, full tank rate, stddev, CV) ---

export interface BehaviorStats {
  avgGapDays: number;
  fullRate: number;
  stdDev: number;
  cv: number;
  score: number;
  tip: string;
}

export const calcBehavior = (
  records: FuelRecord[],
  consumptions: number[],
): BehaviorStats | null => {
  if (records.length < 2 || consumptions.length < 3) return null;
  const sorted = [...records].sort(
    (a, b) => new Date(a.recordDate).getTime() - new Date(b.recordDate).getTime(),
  );
  let totalGap = 0;
  let gapCount = 0;
  for (let i = 1; i < sorted.length; i++) {
    const gap =
      daysBetween(new Date(sorted[i - 1].recordDate), new Date(sorted[i].recordDate));
    if (gap > 0 && gap < 120) {
      totalGap += gap;
      gapCount += 1;
    }
  }
  const avgGapDays = gapCount > 0 ? totalGap / gapCount : 0;
  const fullRate = (records.filter((r) => r.fullTank === "yes").length / records.length) * 100;
  const sd = stdDev(consumptions);
  const mean = consumptions.length ? consumptions.reduce((a, b) => a + b, 0) / consumptions.length : 0;
  const cv = mean > 0 ? sd / mean : 0;
  const score = calcBehaviorScore(consumptions);

  let tip = "继续保持当前驾驶习惯。";
  if (score >= 80) tip = "油耗稳定性优秀,继续保持。";
  else if (score >= 60) tip = "油耗波动可控,可关注急加速/急刹车。";
  else if (score >= 40) tip = "油耗波动较大,建议平稳驾驶。";
  else tip = "油耗波动很大,强烈建议改善驾驶习惯。";
  if (fullRate < 70) tip += " 加满率较低,会影响油耗计算准确性。";
  if (avgGapDays > 0 && avgGapDays < 5) tip += " 加油频率较高。";
  if (avgGapDays > 20) tip += " 加油间隔较长。";

  return { avgGapDays, fullRate, stdDev: sd, cv, score, tip };
};

// --- overview summary ---

export interface OverviewSummary {
  totalRecords: number;
  fullCount: number;
  fullRate: number;
  totalCost: number;
  totalFuel: number;
  totalDist: number;
  avgConsumption: number;
  avgPrice: number;
  costPerKm: number;
  bestCon: number;
  worstCon: number;
  cheapestPrice: number;
  mostExpensivePrice: number;
  firstDate: string;
  lastDate: string;
  spanDays: number;
}

export const calcOverview = (records: FuelRecord[]): OverviewSummary | null => {
  if (records.length === 0) return null;
  const stats = calcStats(records);
  if (!stats) return null;

  const sorted = [...records].sort((a, b) => num(a.odometer) - num(b.odometer));
  const fullRecords = records.filter((r) => r.fullTank === "yes");
  const prices = records.map((r) => num(r.price)).filter((p) => p > 0);

  const byDate = [...records].sort(
    (a, b) => new Date(a.recordDate).getTime() - new Date(b.recordDate).getTime(),
  );
  const firstDate = byDate[0].recordDate.slice(0, 10);
  const lastDate = byDate[byDate.length - 1].recordDate.slice(0, 10);
  const spanDays = Math.max(1, Math.round(
    (new Date(lastDate).getTime() - new Date(firstDate).getTime()) / 86400000,
  ) + 1);

  return {
    totalRecords: records.length,
    fullCount: fullRecords.length,
    fullRate: (fullRecords.length / records.length) * 100,
    totalCost: stats.totalCost,
    totalFuel: stats.totalFuel,
    totalDist: stats.totalDist,
    avgConsumption: stats.avgConsumption,
    avgPrice: stats.avgPrice,
    costPerKm: stats.costPerKm,
    bestCon: stats.best,
    worstCon: stats.worst,
    cheapestPrice: prices.length ? Math.min(...prices) : 0,
    mostExpensivePrice: prices.length ? Math.max(...prices) : 0,
    firstDate,
    lastDate,
    spanDays,
  };
};

// --- fuel type stats ---

export interface FuelTypeStat {
  fuelType: string;
  count: number;
  totalCost: number;
  totalFuel: number;
  avgPrice: number;
  avgConsumption: number;
}

export const calcFuelTypeStats = (records: FuelRecord[]): FuelTypeStat[] => {
  const groups = new Map<string, FuelRecord[]>();
  for (const r of records) {
    const key = r.fuelType || "未知";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const result: FuelTypeStat[] = [];
  for (const [fuelType, recs] of groups) {
    const totalFuel = recs.reduce((s, r) => s + num(r.liters), 0);
    const totalCost = recs.reduce((s, r) => s + num(r.totalCost), 0);

    // Calculate avg consumption for this fuel type using full tank method.
    const sorted = [...recs].sort((a, b) => num(a.odometer) - num(b.odometer));
    const consumptions: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].fullTank !== "yes") continue;
      if (sorted[i].skippedPrevious) continue;
      // Sum all liters from prev full tank to current (inclusive).
      let totalLiters = num(sorted[i].liters);
      for (let j = i - 1; j >= 0; j--) {
        totalLiters += num(sorted[j].liters);
        if (sorted[j].fullTank === "yes") {
          const dist = num(sorted[i].odometer) - num(sorted[j].odometer);
          if (dist > 0) consumptions.push((totalLiters / dist) * 100);
          break;
        }
      }
    }
    const avgConsumption = consumptions.length
      ? consumptions.reduce((a, b) => a + b, 0) / consumptions.length
      : 0;

    result.push({
      fuelType,
      count: recs.length,
      totalCost,
      totalFuel,
      avgPrice: totalFuel > 0 ? totalCost / totalFuel : 0,
      avgConsumption,
    });
  }

  return result.sort((a, b) => b.count - a.count);
};