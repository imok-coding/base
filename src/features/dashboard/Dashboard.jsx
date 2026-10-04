import { useEffect, useMemo } from "react";
import { Link, NavLink, Navigate, Route, Routes } from "react-router-dom";
import {
  CalendarDays,
  Inbox as InboxIcon,
  LayoutDashboard,
  Lock,
  Settings as SettingsIcon,
  Wrench,
} from "lucide-react";
import Empty from "../../components/ui/Empty";
import { useAuth } from "../auth/AuthContext";
import { useManga } from "../manga/MangaData";
import { MangaWorkspace } from "../manga/Workspace";
import { missingFields } from "../manga/model";
import { computeStats } from "./stats";
import { useDashboardWebhooks } from "./useDashboardWebhooks";
import { useSuggestions } from "./useSuggestions";
import Overview from "./sections/Overview";
import CalendarView from "./sections/CalendarView";
import Manager from "./sections/Manager";
import Inbox from "./sections/Inbox";
import Settings from "./sections/Settings";
import "../manga/manga.css";
import "./dashboard.css";

function DashboardInner() {
  const { library, wishlist, loading } = useManga();
  const stats = useMemo(() => computeStats(library, wishlist), [library, wishlist]);
  const suggestions = useSuggestions();
  const needsInfo = useMemo(() => library.filter((v) => missingFields(v).length).length, [library]);
  useDashboardWebhooks(stats, !loading);

  useEffect(() => {
    document.title = "Dashboard · Tyler's Collection";
  }, []);

  const tabs = [
    { to: "/dashboard", label: "Overview", icon: LayoutDashboard, end: true },
    { to: "/dashboard/calendar", label: "Calendar", icon: CalendarDays },
    { to: "/dashboard/manager", label: "Manager", icon: Wrench, badge: needsInfo },
    { to: "/dashboard/inbox", label: "Inbox", icon: InboxIcon, badge: suggestions.items.length },
    { to: "/dashboard/settings", label: "Settings", icon: SettingsIcon },
  ];

  return (
    <div className="page">
      <header className="page-header" style={{ marginBottom: 12 }}>
        <div>
          <div className="page-eyebrow">Admin</div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-sub">Reading stats, release calendar and collection upkeep.</p>
        </div>
      </header>

      <nav className="dash-tabs" aria-label="Dashboard sections">
        <div className="segmented">
          {tabs.map(({ to, label, icon: Icon, end, badge }) => (
            <NavLink key={label} to={to} end={end}>
              <Icon />
              {label}
              {badge > 0 && <span className="dash-tab-badge tabular">{badge > 99 ? "99+" : badge}</span>}
            </NavLink>
          ))}
        </div>
      </nav>

      {loading ? (
        <div className="kpis">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="kpi skeleton" style={{ height: 96 }} />
          ))}
        </div>
      ) : (
        <Routes>
          <Route index element={<Overview stats={stats} />} />
          <Route path="calendar" element={<CalendarView stats={stats} />} />
          <Route path="manager" element={<Manager />} />
          <Route path="inbox" element={<Inbox suggestions={suggestions} />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { user, isAdmin, loading } = useAuth();

  if (loading) {
    return (
      <div className="page-loading">
        <span className="spinner" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="page">
        <div className="locked">
          <Empty
            icon={Lock}
            title="Admins only"
            action={
              user ? (
                <Link to="/manga" className="btn btn--soft">
                  Browse the manga instead
                </Link>
              ) : (
                <Link to="/signin" className="btn btn--primary">
                  Sign in
                </Link>
              )
            }
          >
            {user
              ? "Your account can browse and suggest, but the dashboard is for managing the collection."
              : "Sign in with an admin account to see the dashboard."}
          </Empty>
        </div>
      </div>
    );
  }

  return (
    <MangaWorkspace>
      <DashboardInner />
    </MangaWorkspace>
  );
}
