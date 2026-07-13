// Record status labels for the list page.
// Each record gets a status based on its position in the sequence
// and its fullTank / skippedPrevious flags.

import type { FuelRecord } from "./types";
import { num } from "./format";

export interface RecordStatus {
  /** Short label text. */
  label: string;
  /** CSS color variable name. */
  color: "accent2" | "accent" | "text2" | "orange";
  /** Dot + text color (inline style). */
  dot: string;
  textColor: string;
  /** Longer tooltip. */
  tip: string;
}

const COLORS = {
  accent2: { dot: "var(--accent2)", textColor: "var(--accent2)" },   // green
  accent:  { dot: "var(--accent)",  textColor: "var(--accent)" },     // blue
  text2:   { dot: "var(--text2)",   textColor: "var(--text2)" },      // gray
  orange:  { dot: "var(--orange)",  textColor: "var(--orange)" },     // orange
};

/**
 * Compute status for record at `index` within an odometer-sorted array.
 */
export function getRecordStatus(sorted: FuelRecord[], index: number): RecordStatus {
  const r = sorted[index];
  const prev = index > 0 ? sorted[index - 1] : null;
  const next = index < sorted.length - 1 ? sorted[index + 1] : null;

  const isFull = r.fullTank === "yes";
  const prevFull = prev?.fullTank === "yes";
  const nextFull = next?.fullTank === "yes";
  const skipped = r.skippedPrevious === true;

  // 1. Valid consumption record: this full + prev full + not skipped
  if (isFull && prevFull && !skipped) {
    return {
      label: "已计入单次油耗",
      color: "accent2",
      ...COLORS.accent2,
      tip: "本次油耗已纳入单次油耗计算",
    };
  }

  // 2. Baseline / start point: this full, but next is non-full or no next
  if (isFull && (!next || !nextFull)) {
    return {
      label: "当前为油耗计算起点",
      color: "accent",
      ...COLORS.accent,
      tip: "等待下次加满跳枪后计算油耗",
    };
  }

  // 3. Settled (merged): this full, prev is non-full → merged settlement
  if (isFull && !prevFull) {
    // Count how many consecutive non-full records before this one.
    let count = 0;
    for (let j = index - 1; j >= 0; j--) {
      if (sorted[j].fullTank !== "yes") count++;
      else break;
    }
    return {
      label: count > 0 ? `已合并结算之前（${count}次）加油` : "已计入单次油耗",
      color: "orange",
      ...COLORS.orange,
      tip: count > 0
        ? `本次加满跳枪结算了之前${count}次未满加油的累计量`
        : "本次油耗已纳入单次油耗计算",
    };
  }

  // 4. Non-full: accumulating
  if (!isFull) {
    return {
      label: "未参与计算，油量已累积",
      color: "text2",
      ...COLORS.text2,
      tip: "本次未加满跳枪，不参与单次油耗计算，油量累计到下次加满",
    };
  }

  // Fallback
  return {
    label: "",
    color: "text2",
    ...COLORS.text2,
    tip: "",
  };
}

/**
 * Count consecutive non-full records ending at `index` (inclusive).
 */
export function countConsecutiveNonFull(sorted: FuelRecord[], index: number): number {
  let count = 0;
  for (let i = index; i >= 0; i--) {
    if (sorted[i].fullTank !== "yes") count++;
    else break;
  }
  return count;
}

/**
 * Check if the latest valid consumption pair is older than `days` days.
 */
export function consumptionStale(sorted: FuelRecord[], days: number = 30): boolean {
  if (sorted.length < 2) return false;
  // Find the most recent record that would produce a valid consumption.
  for (let i = sorted.length - 1; i > 0; i--) {
    const r = sorted[i];
    if (r.fullTank !== "yes" || r.skippedPrevious) continue;
    // Find previous full tank.
    for (let j = i - 1; j >= 0; j--) {
      if (sorted[j].fullTank === "yes") {
        const lastDate = new Date(r.recordDate).getTime();
        const now = Date.now();
        return (now - lastDate) > days * 86400000;
      }
    }
  }
  return true; // no valid pair at all
}
