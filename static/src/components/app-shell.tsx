// Responsive shell wrapper. Picks one of three layouts based on viewport:
//   <768      phone    → bottom nav (5 Lucide icon tabs)
//   768–1023  tablet   → top tabs row (no sidebar, no bottom nav)
//   ≥1024     desktop  → left sidebar nav + right content
//
// All three layouts share the same <PageHeader> with theme toggle + the
// vehicle <select>, so the rest of the app renders inside the matching
// wrapper without caring which layout is active.
//
// Sub-pages like /records-list hide the tab bar entirely.

import * as React from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  CircleDollarSign,
  Plus,
  Wrench,
  User,
} from "lucide-react";
import { PageHeader } from "./page-header";
import { useMediaQuery } from "@/lib/use-media-query";
import type { Vehicle } from "@/lib/types";

// Routes that are "sub-pages" — the tab bar is hidden when inside them.
const HIDE_NAV_PREFIXES = ["/records-list", "/records/", "/maintenance/new", "/maintenance/"];

const TABS = [
  { to: "/", label: "总览", icon: LayoutDashboard, end: true },
  { to: "/expenses", label: "费用", icon: CircleDollarSign },
  { to: "/add", label: "加油", icon: Plus, raised: true },
  { to: "/maintenance", label: "保养", icon: Wrench },
  { to: "/vehicles", label: "我的", icon: User },
];

interface Props {
  vehicles: Vehicle[];
  activeVehicleId: string | null;
  onSelectVehicle: (id: string) => void;
}

function shouldHideNav(pathname: string): boolean {
  return HIDE_NAV_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

function NavLinks({ vertical }: { vertical?: boolean }) {
  return (
    <>
      {TABS.map((t) => {
        const Icon = t.icon;
        return (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              `nav-item${isActive ? " active" : ""}${t.raised ? " nav-item--raised" : ""}`
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  className="nav-icon"
                  size={22}
                  strokeWidth={1}
                  fill="none"
                />
                <span>{t.label}</span>
              </>
            )}
          </NavLink>
        );
      })}
    </>
  );
}

function PhoneLayout(props: Props) {
  const location = useLocation();
  const hideNav = shouldHideNav(location.pathname);
  return (
    <>
      <PageHeader vehicles={props.vehicles} activeId={props.activeVehicleId} onSelect={props.onSelectVehicle} />
      <main className="app-main" style={hideNav ? { paddingBottom: 16 } : undefined}><Outlet /></main>
      {!hideNav ? <nav className="bottom-nav"><NavLinks /></nav> : null}
    </>
  );
}

function TabletLayout(props: Props) {
  const location = useLocation();
  const hideNav = shouldHideNav(location.pathname);
  return (
    <>
      <PageHeader vehicles={props.vehicles} activeId={props.activeVehicleId} onSelect={props.onSelectVehicle} />
      <main className="app-main">
        {!hideNav ? (
          <nav className="tablet-tabs">
            {TABS.map((t) => {
              const Icon = t.icon;
              return (
                <NavLink
                  key={t.to}
                  to={t.to}
                  end={t.end}
                  className={({ isActive }) => `tablet-tab${isActive ? " active" : ""}`}
                >
                  {({ isActive }) => (
                    <>
                      <Icon size={16} strokeWidth={1} fill="none" style={{ marginRight: 6 }} />
                      {t.label}
                    </>
                  )}
                </NavLink>
              );
            })}
          </nav>
        ) : null}
        <Outlet />
      </main>
    </>
  );
}

function DesktopLayout(props: Props) {
  return (
    <>
      <PageHeader vehicles={props.vehicles} activeId={props.activeVehicleId} onSelect={props.onSelectVehicle} />
      <div className="desktop-shell">
        <aside className="desktop-sidebar"><NavLinks vertical /></aside>
        <main><Outlet /></main>
      </div>
    </>
  );
}

export function ResponsiveShell(props: Props) {
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const isTablet = useMediaQuery("(min-width: 768px)");
  if (isDesktop) return <DesktopLayout {...props} />;
  if (isTablet) return <TabletLayout {...props} />;
  return <PhoneLayout {...props} />;
}