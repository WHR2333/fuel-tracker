// Top-level routes. <ShellOutlet> is the layout root and owns the shared
// vehicles list (header dropdown + every page). It re-fetches whenever
// vehiclesChanged fires (i.e. add / delete / import / clear), so the
// dropdown stays in sync without a hard reload.
//
// Detail routes /records/:rid and /maintenance/:mid replace the previously
// inline edit sheets on the now-removed /records tab and the /maintenance
// list page. /stats is reachable from the overview "进入 →" card but is no
// longer in the top nav.

import * as React from "react";
import { Navigate, createBrowserRouter, Outlet } from "react-router-dom";
import { ResponsiveShell } from "@/components/app-shell";
import { vehicles as api } from "@/lib/api";
import { isAuthenticated } from "@/lib/auth";
import type { Vehicle } from "@/lib/types";
import { LoginPage } from "@/pages/login";
import { OverviewPage } from "@/pages/overview";
import { AddPage } from "@/pages/add";
import { StatsPage } from "@/pages/stats";
import { MaintenancePage } from "@/pages/maintenance";
import { VehiclesPage } from "@/pages/vehicles";
import { ExpensesPage } from "@/pages/expenses";
import { RecordsListPage } from "@/pages/records-list";
import { RecordDetailPage } from "@/pages/record-detail";
import { MaintDetailPage } from "@/pages/maint-detail";
import { UsersPage } from "@/pages/users";
import { ToastHost } from "@/components/toast-host";
import { useVehiclesVersion, useActiveVehicleVersion, notifyActiveVehicleChanged } from "@/lib/stores";

/** Redirects to /login when no valid token exists. */
function RequireAuth() {
  return isAuthenticated() ? <Outlet /> : <Navigate to="/login" replace />;
}

function ShellOutlet() {
  // Subscribing to the vehicles-version pub/sub is what makes the header
  // dropdown refresh after a /vehicles mutation. The returned counter is
  // included in the reload effect's deps so a notification triggers a
  // re-fetch — without it, calling useVehiclesVersion() alone would only
  // cause a re-render but wouldn't re-run the effect.
  const vehiclesVer = useVehiclesVersion();
  const activeVer = useActiveVehicleVersion();

  const [vehicles, setVehicles] = React.useState<Vehicle[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem("fuel.activeVehicleId") : null,
  );

  // Sync activeId when another component (e.g. VehiclesPage card) changes it.
  React.useEffect(() => {
    const id = localStorage.getItem("fuel.activeVehicleId");
    setActiveId(id);
  }, [activeVer]);

  const reload = React.useCallback(async () => {
    try {
      const list = await api.list();
      setVehicles(list);
      if (list.length > 0) {
        if (!activeId || !list.find((v) => v.id === activeId)) {
          const first = list[0].id;
          setActiveId(first);
          localStorage.setItem("fuel.activeVehicleId", first);
        }
      } else {
        setActiveId(null);
        localStorage.removeItem("fuel.activeVehicleId");
      }
    } catch {
      /* network error — keep what we have */
    }
  }, [activeId]);

  React.useEffect(() => { reload(); }, [reload, vehiclesVer]);

  React.useEffect(() => {
    const handler = () => { if (!document.hidden) reload(); };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [reload]);

  const onSelect = React.useCallback((id: string) => {
    setActiveId(id);
    localStorage.setItem("fuel.activeVehicleId", id);
    notifyActiveVehicleChanged();
  }, []);

  return (
    <>
      <ResponsiveShell vehicles={vehicles} activeVehicleId={activeId} onSelectVehicle={onSelect} />
      <ToastHost />
    </>
  );
}

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    element: <RequireAuth />,
    children: [
      {
        path: "/",
        element: <ShellOutlet />,
        children: [
          { index: true, element: <OverviewPage /> },
          { path: "add", element: <AddPage /> },
          { path: "expenses", element: <ExpensesPage /> },
          { path: "maintenance", element: <MaintenancePage /> },
          { path: "maintenance/new", element: <MaintDetailPage /> },
          { path: "maintenance/:mid", element: <MaintDetailPage /> },
          { path: "vehicles", element: <VehiclesPage /> },
          { path: "stats", element: <StatsPage /> },
          { path: "users", element: <UsersPage /> },
          { path: "records/:rid", element: <RecordDetailPage /> },
          { path: "records-list", element: <RecordsListPage /> },
          { path: "*", element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
]);