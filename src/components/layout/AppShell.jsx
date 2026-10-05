import { NavLink, Link, useLocation, useNavigate } from "react-router-dom";
import {
  BookOpen,
  ChevronDown,
  Gamepad2,
  Home,
  LayoutDashboard,
  LogIn,
  LogOut,
  Moon,
  Sun,
  UserCog,
  Eye,
  UserX,
} from "lucide-react";
import { useEffect } from "react";
import { useAuth } from "../../features/auth/AuthContext";
import { DEMO } from "../../lib/store";
import { useTheme } from "../../lib/theme";
import Menu from "../ui/Menu";
import { useFeedback } from "../ui/Feedback";

const AVATAR = `${import.meta.env.BASE_URL}icons/icon-192.png`;

export function UserAvatar({ user, size }) {
  const initial = (user?.displayName || user?.email || "?").trim().charAt(0).toUpperCase();
  return (
    <span className="avatar" style={size ? { width: size, height: size } : undefined}>
      {user?.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : initial}
    </span>
  );
}

function AccountMenu() {
  const { user, isAdmin, signOut, signInWithGoogle, demoRole, setDemoRole } = useAuth();
  const { theme, toggle } = useTheme();
  const { toast } = useFeedback();
  const navigate = useNavigate();

  if (!user) {
    return (
      <>
        <button
          type="button"
          className="btn btn--ghost btn--icon theme-toggle"
          onClick={toggle}
          aria-label="Toggle theme"
        >
          {theme === "dark" ? <Sun /> : <Moon />}
        </button>
        <button
          type="button"
          className="btn btn--soft"
          onClick={() => (DEMO ? signInWithGoogle() : navigate("/signin"))}
        >
          <LogIn />
          <span>Sign in</span>
        </button>
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        className="btn btn--ghost btn--icon theme-toggle"
        onClick={toggle}
        aria-label="Toggle theme"
      >
        {theme === "dark" ? <Sun /> : <Moon />}
      </button>
      <Menu
        trigger={(props) => (
          <button type="button" className="account-btn" aria-label="Account menu" {...props}>
            <UserAvatar user={user} />
            <ChevronDown />
          </button>
        )}
        items={[
          {
            label: theme === "dark" ? "Light theme" : "Dark theme",
            icon: theme === "dark" ? Sun : Moon,
            onClick: toggle,
          },
          { label: "Dashboard", icon: LayoutDashboard, onClick: () => navigate("/dashboard"), hidden: !isAdmin },
          ...(DEMO
            ? [
                { separator: true },
                { heading: "Demo: view as" },
                {
                  label: "Admin",
                  icon: UserCog,
                  onClick: () => setDemoRole("admin"),
                  trail: demoRole === "admin" ? "✓" : "",
                },
                {
                  label: "Viewer",
                  icon: Eye,
                  onClick: () => setDemoRole("viewer"),
                  trail: demoRole === "viewer" ? "✓" : "",
                },
                { label: "Signed out", icon: UserX, onClick: () => setDemoRole("signedOut") },
              ]
            : []),
          { separator: true },
          {
            label: "Sign out",
            icon: LogOut,
            danger: true,
            onClick: async () => {
              await signOut();
              toast("Signed out", { type: "info" });
            },
          },
        ]}
      >
        <div className="account-head">
          <UserAvatar user={user} />
          <div style={{ minWidth: 0 }}>
            <div className="account-name">{user.displayName || "Signed in"}</div>
            <div className="account-email">{user.email}</div>
            <span className={`role-pill ${isAdmin ? "role-pill--admin" : ""}`}>{isAdmin ? "Admin" : "Viewer"}</span>
          </div>
        </div>
        <div className="menu-sep" />
      </Menu>
    </>
  );
}

export default function AppShell({ children }) {
  const { isAdmin } = useAuth();
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname]);

  const nav = [
    { to: "/", label: "Home", icon: Home, end: true },
    { to: "/manga", label: "Manga", icon: BookOpen },
    { to: "/games", label: "Games", icon: Gamepad2 },
    ...(isAdmin ? [{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard }] : []),
  ];

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {DEMO && <div className="demo-banner">Demo mode — sample data, nothing is saved to Firestore</div>}
      <header className="app-header">
        <div className="app-header-inner">
          <Link to="/" className="brand" aria-label="Tyler's Collection — home">
            <img src={AVATAR} alt="" width="36" height="36" />
            <span className="brand-text">
              <span className="brand-name">Tyler&apos;s Collection</span>
              <span className="brand-jp" lang="ja">
                タイラーのコレクション
              </span>
            </span>
          </Link>
          <nav className="app-nav" aria-label="Main">
            {nav.map(({ to, label, icon: Icon, end, soon }) => (
              <NavLink key={to} to={to} end={end}>
                <Icon />
                {label}
                {soon && <span className="nav-soon">Soon</span>}
              </NavLink>
            ))}
          </nav>
          <div className="app-header-actions">
            <AccountMenu />
          </div>
        </div>
      </header>

      <main id="main" className="app-main">
        {children}
        <footer className="app-footer">© {new Date().getFullYear()} im.ok · Tyler&apos;s Collection</footer>
      </main>

      <nav className="tabbar" aria-label="Main">
        {nav.map(({ to, label, icon: Icon, end, soon }) => (
          <NavLink key={to} to={to} end={end}>
            <Icon />
            {label}
            {soon && <span className="nav-soon">Soon</span>}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
