// Top-of-page header shared by all 3 responsive layouts. Holds the app
// title, theme toggle, a compact vehicle <select> (left-aligned), and a
// notepad icon (right) that navigates to /records-list.
//
// On sub-pages (/records-list, /records/:rid, /add, /maintenance/*),
// the vehicle dropdown + notepad icon are hidden — those pages manage
// their own title bar.

import * as React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { FileText, Fuel, Sun, Moon, LogOut, Users, KeyRound } from "lucide-react";
import { VehicleSelect } from "./vehicle-select";
import type { Vehicle } from "@/lib/types";
import { logout, isAdmin, getUsername } from "@/lib/auth";
import { users as usersApi } from "@/lib/api";
import { pushToast } from "./toast-host";

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

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  // Password change dialog
  const [showPwdChange, setShowPwdChange] = React.useState(false);
  const [oldPwd, setOldPwd] = React.useState("");
  const [newPwd, setNewPwd] = React.useState("");
  const [pwdLoading, setPwdLoading] = React.useState(false);
  const handleChangePwd = async () => {
    if (!oldPwd || !newPwd) return;
    setPwdLoading(true);
    try {
      await usersApi.changeMyPassword(oldPwd, newPwd);
      pushToast("密码已修改");
      setShowPwdChange(false); setOldPwd(""); setNewPwd("");
    } catch (e) { pushToast((e as Error).message); }
    finally { setPwdLoading(false); }
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
          省油的灯
        </h1>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {isAdmin() ? (
            <button
              className="theme-toggle"
              onClick={() => navigate("/users")}
              title="用户管理"
              aria-label="用户管理"
            >
              <Users size={20} strokeWidth={1} />
            </button>
          ) : null}
          <button
            className="theme-toggle"
            onClick={() => setShowPwdChange(true)}
            title="修改密码"
            aria-label="修改密码"
          >
            <KeyRound size={20} strokeWidth={1} />
          </button>
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            title="切换主题"
            aria-label="切换主题"
          >
            {theme === "dark" ? <Sun size={20} strokeWidth={1} /> : <Moon size={20} strokeWidth={1} />}
          </button>
          <button
            className="theme-toggle"
            onClick={handleLogout}
            title="退出登录"
            aria-label="退出登录"
          >
            <LogOut size={20} strokeWidth={1} />
          </button>
        </div>
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

      {/* Password change dialog */}
      {showPwdChange ? (
        <div style={{ marginTop: 10, padding: 12, background: "var(--card2)", borderRadius: 8, border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>修改密码</div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: "1 1 120px" }}>
              <label style={{ fontSize: 11, color: "var(--text2)" }}>当前密码</label>
              <input className="form-input" type="password" value={oldPwd} onChange={(e) => setOldPwd(e.target.value)} style={{ fontSize: 13, padding: "5px 8px" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: "1 1 120px" }}>
              <label style={{ fontSize: 11, color: "var(--text2)" }}>新密码</label>
              <input className="form-input" type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} style={{ fontSize: 13, padding: "5px 8px" }} />
            </div>
            <button className="btn btn-primary" style={{ width: "auto", padding: "6px 14px", fontSize: 12, whiteSpace: "nowrap" }} disabled={pwdLoading} onClick={handleChangePwd}>
              {pwdLoading ? "…" : "确定"}
            </button>
            <button className="btn btn-outline" style={{ width: "auto", padding: "6px 10px", fontSize: 12 }} onClick={() => { setShowPwdChange(false); setOldPwd(""); setNewPwd(""); }}>取消</button>
          </div>
        </div>
      ) : null}
    </header>
  );
}