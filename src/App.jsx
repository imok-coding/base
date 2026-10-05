import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "./components/layout/AppShell";
import { FeedbackProvider } from "./components/ui/Feedback";
import { AuthProvider } from "./features/auth/AuthContext";
import { MangaProvider } from "./features/manga/MangaData";
import { GamesProvider } from "./features/games/GamesData";
import Home from "./pages/Home";

const MangaPage = lazy(() => import("./features/manga/MangaPage"));
const SeriesPage = lazy(() => import("./features/manga/SeriesPage"));
const Dashboard = lazy(() => import("./features/dashboard/Dashboard"));
const SignIn = lazy(() => import("./features/auth/SignIn"));
const Games = lazy(() => import("./features/games/GamesPage"));

function PageFallback() {
  return (
    <div className="page-loading" aria-busy="true">
      <span className="spinner" />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <FeedbackProvider>
        <MangaProvider>
          <GamesProvider>
            <AppShell>
              <Suspense fallback={<PageFallback />}>
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/manga" element={<MangaPage />} />
                  <Route path="/manga/series/:seriesKey" element={<SeriesPage />} />
                  <Route path="/games" element={<Games />} />
                  <Route path="/dashboard/*" element={<Dashboard />} />
                  <Route path="/signin" element={<SignIn />} />
                  {/* old links */}
                  <Route path="/home" element={<Navigate to="/" replace />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </AppShell>
          </GamesProvider>
        </MangaProvider>
      </FeedbackProvider>
    </AuthProvider>
  );
}
