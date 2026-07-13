// Module-level pub/sub stores for cross-page reactivity.
//
// Three channels:
//   vehiclesChanged — vehicle list mutated (add / delete / import / clear)
//                     ShellOutlet refetches and rebuilds the header dropdown.
//   activeVehicleVersion — user picked a different vehicle. Every data-fetching
//                     page subscribes and refetches on bump.
//   dataChanged     — anything CRUD'd (record / maintenance / import). The
//                     relevant page re-fetches; the global counter resets to
//                     zero so an unchanged bump still triggers a refetch.

import * as React from "react";
import { invalidate } from "./api-cache";

let vehicleVersion = 0;
let activeVersion = 0;
let dataVersion = 0;

const vehicleListeners = new Set<() => void>();
const activeListeners = new Set<() => void>();
const dataListeners = new Set<() => void>();

const notify = (set: Set<() => void>) => () => { for (const l of set) l(); };

export function notifyVehiclesChanged(): void {
  invalidate("vehicles");
  vehicleVersion += 1;
  for (const l of vehicleListeners) l();
}

export function notifyActiveVehicleChanged(): void {
  // Active vehicle change implies data should refetch on every page.
  activeVersion += 1;
  dataVersion += 1;
  for (const l of activeListeners) l();
  for (const l of dataListeners) l();
}

export function notifyDataChanged(): void {
  invalidate("records", "maintenance");
  dataVersion += 1;
  for (const l of dataListeners) l();
}

export function useVehiclesVersion(): number {
  return React.useSyncExternalStore(
    (cb) => { vehicleListeners.add(cb); return () => vehicleListeners.delete(cb); },
    () => vehicleVersion,
    () => 0,
  );
}

export function useActiveVehicleVersion(): number {
  return React.useSyncExternalStore(
    (cb) => { activeListeners.add(cb); return () => activeListeners.delete(cb); },
    () => activeVersion,
    () => 0,
  );
}

export function useDataVersion(): number {
  return React.useSyncExternalStore(
    (cb) => { dataListeners.add(cb); return () => dataListeners.delete(cb); },
    () => dataVersion,
    () => 0,
  );
}