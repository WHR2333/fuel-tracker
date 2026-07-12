// Top-of-page header shared by all 3 responsive layouts. Holds the app
// title, theme toggle, a compact vehicle <select> (left-aligned), and a
// notepad icon (right) that navigates to /records-list.
//
// On sub-pages (/records-list, /records/:rid, /add, /maintenance/*),
// the vehicle dropdown + notepad icon are hidden — those pages manage
// their own title bar.

import * as React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { FileText, Fuel, Sun, Moon } from "lucide-react";
import { VehicleSelect } from "./vehicle-select";
import type { Vehicle } from "@/lib/types";

const THEME_KEY = "fuel.theme";
const HIDE_DASHBOARD_ROUTES = ["/records-list", "/records/", "/add", "/maintenance/new", "/maintenance/"];

function shouldHideDashboard(pathname: string): boolean {
  return HIDE_DASHBOARD_ROUTES.some((p) => pathname === p || pathname.startsWith(p));
}

interface Props {
  activeId: string | null;
  onSelect: (id: string) => void;
  vehicles: Vehicle[];
}

export function PageHeader({ activeId, onSelect, vehicles }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const hideDashboard = shouldHideDashboard(location.pathname);
  const [theme, setTheme] = React.useState<string>(() => {
    if (typeof window === "undefined") return "light";
    return document.documentElement.dataset.theme ?? "light";
  });

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem(THEME_KEY, next);
  };

  React.useEffect(() => {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) {
      document.documentElement.dataset.theme = saved;
      setTheme(saved);
    }
  }, []);

  return (
    <header className="app-header">
      <div className="header-top">
        <h1
          style={{ cursor: location.pathname !== "/" ? "pointer" : undefined }}
          onClick={() => { if (location.pathname !== "/") navigate("/"); }}
        >
          <Fuel size={20} strokeWidth={1} style={{ marginRight: 6 }} />
          省点油
        </h1>
        <button
          className="theme-toggle"
          onClick={toggleTheme}
          title="切换主题"
          aria-label="切换主题"
        >
          {theme === "dark" ? <Sun size={20} strokeWidth={1} /> : <Moon size={20} strokeWidth={1} />}
        </button>
      </div>
      {!hideDashboard && vehicles.length > 0 ? (
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginTop: 12, gap: 12 }}>
          <div style={{ flex: "0 0 auto" }}>
            <VehicleSelect vehicles={vehicles} activeId={activeId} onSelect={onSelect} compact />
          </div>
          <button
            className="btn btn-outline"
            style={{ width: "auto", padding: "8px 14px", flexShrink: 0, marginTop: 4 }}
            onClick={() => navigate("/records-list")}
            title="加油记录"
            aria-label="加油记录"
          >
            <FileText size={20} strokeWidth={1} />
          </button>
        </div>
      ) : null}
    </header>
  );
}