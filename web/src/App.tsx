import {
  BarChart3,
  Dices,
  FileText,
  Layers,
  Palette,
  PenLine,
  Settings as SettingsIcon,
  Star,
  Trophy,
  Users,
} from "lucide-react";
import { AnimatePresence, MotionConfig } from "motion/react";
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { Link, Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { NotificationBell } from "./components/NotificationBell";
import { PageSkeleton } from "./components/PageSkeleton";
import { UserMenu } from "./components/UserMenu";
import { usePlayers } from "./hooks/usePlayers";
import { useDisplayName } from "./hooks/useSettings";
import { AuthProvider, useAuth } from "./lib/AuthContext";
import { setClearAuth } from "./lib/navigation";
import { syncThemeColor } from "./lib/themeColor";
import { DEFAULT_THEME, THEMES, type Theme } from "./lib/themes";
import { cn, pressable } from "./lib/utils";
import { ErrorPage } from "./pages/ErrorPage";

const LoginPage = lazy(() => import("./pages/LoginPage"));
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const LandingPage = lazy(() => import("./pages/LandingPage"));
const HomePage = lazy(() => import("./pages/HomePage"));
const Catalog = lazy(() => import("./pages/Catalog"));
const CatalogStatsPage = lazy(() => import("./pages/CatalogStatsPage"));
const GameDetailPage = lazy(() => import("./pages/GameDetailPage"));
const Picker = lazy(() => import("./pages/Picker"));
const LogResult = lazy(() => import("./pages/LogResult"));
const Leaderboard = lazy(() => import("./pages/Leaderboard"));
const RecommendedPage = lazy(() => import("./pages/RecommendedPage"));
const AdminRecommendedPage = lazy(() => import("./pages/AdminRecommendedPage"));
const UsersPage = lazy(() => import("./pages/UsersPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const PlayerProfilePage = lazy(() => import("./pages/PlayerProfilePage"));
const PostsPage = lazy(() => import("./pages/PostsPage"));
const PostViewPage = lazy(() => import("./pages/PostViewPage"));
const PostEditorPage = lazy(() => import("./pages/PostEditorPage"));
const RecDetailPage = lazy(() => import("./pages/RecDetailPage"));
const RecEditorPage = lazy(() => import("./pages/RecEditorPage"));
const RecordsPage = lazy(() => import("./pages/RecordsPage"));
const PrivacyPolicyPage = lazy(() => import("./pages/PrivacyPolicyPage"));

function ThemePicker() {
  const [theme, setTheme] = useState<string>(
    () => document.documentElement.dataset.theme ?? DEFAULT_THEME,
  );
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = THEMES.find((t: Theme) => t.id === theme) ?? THEMES[0];

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  function apply(id: string) {
    document.documentElement.dataset.theme = id;
    syncThemeColor();
    localStorage.setItem("mc-theme", id);
    setTheme(id);
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-2 py-3 rounded-md text-muted-foreground hover:text-foreground transition-colors"
        title="Switch theme"
        aria-label={`Switch theme, current: ${current.label}`}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <span
          className="w-3.5 h-3.5 rounded-full border border-border"
          style={{ backgroundColor: current.primaryHex }}
        />
        <span className="hidden lg:inline text-xs">{current.label}</span>
        <Palette size={14} />
      </button>
      {open && (
        // Phones: pinned to the viewport under the top bar — anchored to the trigger
        // (~80px from the right edge) the swatch row ran off-screen to the left.
        <div className="fixed inset-x-4 top-[calc(3.5rem+env(safe-area-inset-top))] lg:absolute lg:inset-x-auto lg:right-0 lg:top-full lg:mt-2 lg:w-96 bg-card border rounded-lg p-2 grid grid-cols-4 auto-rows-fr gap-1 z-50 shadow-lg">
          {THEMES.map((t: Theme) => (
            <button
              key={t.id}
              onClick={() => apply(t.id)}
              aria-pressed={theme === t.id}
              className={`flex flex-col items-center gap-1 px-3 py-2 rounded-md hover:bg-muted transition-colors text-xs ${theme === t.id ? "text-foreground bg-muted" : "text-muted-foreground"}`}
            >
              <span className="w-4 h-4 rounded-full" style={{ backgroundColor: t.primaryHex }} />
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ExpiredRedirect() {
  const p = sessionStorage.getItem("_expiredRedirect");
  return <Navigate to={p ? `/login?redirect=${encodeURIComponent(p)}` : "/"} replace />;
}

function AppShell() {
  const { user, loading, logout, setUser } = useAuth();
  const location = useLocation();
  const { data: players = [] } = usePlayers();
  const displayName = useDisplayName();

  // Base tab title for every page. A layout effect runs before all passive
  // effects, so pages that set a more specific title in their own useEffect
  // (RecommendedPage, RecDetailPage) still win on the same render.
  useLayoutEffect(() => {
    document.title = displayName;
  }, [displayName]);

  useEffect(() => {
    setClearAuth(() => setUser(null));
  }, [setUser]);

  if (loading) {
    const isPublicPath =
      location.pathname === "/" ||
      location.pathname === "/login" ||
      location.pathname === "/forgot-password" ||
      location.pathname === "/reset-password" ||
      location.pathname === "/privacy" ||
      location.pathname.startsWith("/recommended");
    if (!isPublicPath) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <Dices size={40} className="text-primary animate-spin" />
        </div>
      );
    }
  }

  if (!user) {
    return (
      <ErrorBoundary FallbackComponent={ErrorPage} resetKeys={[location.pathname]}>
        <Suspense fallback={<PageSkeleton />}>
          {/* ExpiredRedirect (the catch-all below) relies on protected paths like
              /players/* and /games/* NOT being matched here — they must fall through
              to "*" so a session-expiry redirect-back can fire. Don't add them above. */}
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={loading ? <PageSkeleton /> : <LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/recommended" element={<RecommendedPage />} />
            <Route path="/recommended/:id" element={<RecDetailPage />} />
            <Route path="/privacy" element={<PrivacyPolicyPage />} />
            <Route path="*" element={<ExpiredRedirect />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    );
  }

  // Five is what fits a 375px bottom nav without scrolling. Everything else
  // lives in the account menu — a horizontally scrolling tab strip hid Sign out
  // off-screen with no affordance saying it was there.
  const NAV_ITEMS = [
    { to: "/catalog", label: "Catalog", icon: <Layers size={18} /> },
    { to: "/posts", label: "Posts", icon: <FileText size={18} /> },
    { to: "/picker", label: "Picker", icon: <Dices size={18} /> },
    { to: "/log", label: "Chronicle", icon: <PenLine size={18} /> },
    { to: "/leaderboard", label: "Leaderboard", icon: <Trophy size={18} /> },
  ];

  const MENU_ITEMS = [
    { to: "/catalog/stats", label: "Catalog Stats", icon: <BarChart3 size={16} /> },
    { to: "/recommended", label: "Picks", icon: <Star size={16} /> },
    ...(user.role === "admin"
      ? [
          { to: "/users", label: "Users", icon: <Users size={16} /> },
          { to: "/admin/recommended", label: "Manage Picks", icon: <Star size={16} /> },
        ]
      : []),
  ];

  const avatarUrl = players.find((p) => p.pk === user.sub)?.avatarUrl ?? undefined;

  return (
    <div className="min-h-dvh bg-background pt-[env(safe-area-inset-top)]">
      {/* Desktop top nav */}
      <nav className="hidden lg:flex sticky top-0 z-50 items-center gap-6 border-b bg-card/80 backdrop-blur-xs px-6 py-3">
        <Link to="/" className="flex items-center gap-2 mr-4 shrink-0">
          <Dices size={22} className="text-primary" />
          <span className="font-display font-bold text-lg text-primary">{displayName}</span>
        </Link>
        {NAV_ITEMS.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/catalog"}
            className={({ isActive }) =>
              `text-sm font-medium transition-colors ${isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"}`
            }
          >
            {label}
          </NavLink>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <NotificationBell />
          <ThemePicker />
          {user.role === "admin" && (
            <Link
              to="/admin/settings"
              title="Settings"
              aria-label="Settings"
              className="p-3 rounded-md text-muted-foreground hover:text-foreground transition-colors"
            >
              <SettingsIcon size={18} />
            </Link>
          )}
          <UserMenu
            displayName={user.displayName}
            profileTo={`/players/${user.sub}`}
            avatarUrl={avatarUrl}
            items={MENU_ITEMS}
            onLogout={logout}
            showName
          />
        </div>
      </nav>

      {/* Mobile top bar */}
      <div className="lg:hidden sticky top-0 z-50 flex items-center justify-between border-b bg-card/80 backdrop-blur-xs px-4 py-2">
        <Link to="/" className="flex items-center gap-2">
          <Dices size={20} className="text-primary" />
          <span className="font-display font-bold text-primary">{displayName}</span>
        </Link>
        <div className="flex items-center -mr-2">
          <NotificationBell />
          <ThemePicker />
          {user.role === "admin" && (
            <Link
              to="/admin/settings"
              title="Settings"
              aria-label="Settings"
              className="p-3 rounded-md text-muted-foreground hover:text-foreground transition-colors"
            >
              <SettingsIcon size={16} />
            </Link>
          )}
          <UserMenu
            displayName={user.displayName}
            profileTo={`/players/${user.sub}`}
            avatarUrl={avatarUrl}
            items={MENU_ITEMS}
            onLogout={logout}
          />
        </div>
      </div>

      {/* Page content */}
      <ErrorBoundary FallbackComponent={ErrorPage} resetKeys={[location.pathname]}>
        <Suspense fallback={<PageSkeleton />}>
          <main className="pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0 overflow-x-hidden">
            <AnimatePresence mode="wait">
              <Routes location={location} key={location.pathname}>
                <Route path="/" element={<HomePage />} />
                <Route path="/catalog" element={<Catalog />} />
                <Route path="/catalog/stats" element={<CatalogStatsPage />} />
                <Route path="/picker" element={<Picker />} />
                <Route path="/log" element={<LogResult />} />
                <Route path="/leaderboard" element={<Leaderboard />} />
                <Route path="/games/:id" element={<GameDetailPage />} />
                <Route path="/players/:id" element={<PlayerProfilePage />} />
                <Route path="/posts" element={<PostsPage />} />
                <Route path="/posts/new" element={<PostEditorPage />} />
                <Route path="/posts/:id" element={<PostViewPage />} />
                <Route path="/posts/:id/edit" element={<PostEditorPage />} />
                {user.role === "admin" && <Route path="/users" element={<UsersPage />} />}
                {user.role === "admin" && (
                  <Route path="/admin/recommended" element={<AdminRecommendedPage />} />
                )}
                {user.role === "admin" && (
                  <Route path="/admin/recommended/:id/edit" element={<RecEditorPage />} />
                )}
                {user.role === "admin" && (
                  <Route path="/admin/settings" element={<SettingsPage />} />
                )}
                <Route path="/records" element={<RecordsPage />} />
                <Route path="/recommended" element={<RecommendedPage />} />
                <Route path="/recommended/:id" element={<RecDetailPage />} />
                <Route path="/privacy" element={<PrivacyPolicyPage />} />
                <Route path="/login" element={<Navigate to="/" replace />} />
              </Routes>
            </AnimatePresence>
          </main>
        </Suspense>
      </ErrorBoundary>

      {/* Mobile bottom tab bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 flex border-t bg-card pb-[env(safe-area-inset-bottom)]">
        {NAV_ITEMS.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/catalog"}
            className={({ isActive }) =>
              cn(
                "flex flex-1 min-w-0 flex-col items-center gap-0.5 py-2 text-xs transition-colors",
                isActive ? "text-primary" : "text-muted-foreground",
                pressable,
              )
            }
          >
            {icon}
            <span className="max-w-full truncate px-0.5">{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </MotionConfig>
  );
}
