// useActiveVehicle — single source of truth for the currently-selected
// vehicle. All pages subscribe to this instead of doing their own fetch.
// `setActive` updates localStorage + broadcasts via the stores module so
// every page refetches in lockstep.
//
// The hook also subscribes to `useVehiclesVersion()` so that when the
// vehicle list changes (edit / add / delete / import / clear), the active
// vehicle object is automatically re-fetched and the UI stays in sync.

import * as React from "react";
import { vehicles as api } from "./api";
import type { Vehicle } from "./types";
import {
  notifyActiveVehicleChanged,
  notifyDataChanged,
  useVehiclesVersion,
  useDataVersion,
} from "./stores";

const KEY = "fuel.activeVehicleId";

export function useActiveVehicle(): {
  vehicle: Vehicle | null;
  loading: boolean;
  error: string | null;
  setActive: (id: string) => void;
  refresh: () => Promise<void>;
} {
  const vehiclesVer = useVehiclesVersion();
  const dataVer = useDataVersion();
  const [vehicle, setVehicle] = React.useState<Vehicle | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.list();
      if (list.length === 0) {
        setVehicle(null);
        return;
      }
      const saved = localStorage.getItem(KEY);
      const found = saved ? list.find((v) => v.id === saved) : undefined;
      const chosen = found ?? list[0];
      localStorage.setItem(KEY, chosen.id);
      setVehicle(chosen);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-fetch on mount, on vehicle-list change (vehiclesVer), and on
  // data change (dataVer) — the latter covers the case where records are
  // added/deleted and we need fresh vehicle stats.
  React.useEffect(() => {
    load();
  }, [load, vehiclesVer, dataVer]);

  const setActive = React.useCallback((id: string) => {
    localStorage.setItem(KEY, id);
    notifyActiveVehicleChanged();
    load();
  }, [load]);

  return { vehicle, loading, error, setActive, refresh: load };
}