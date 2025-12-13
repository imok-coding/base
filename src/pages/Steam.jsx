import { Suspense, lazy, useEffect, useRef, useState } from "react";
import "../styles/steam.css";

const SteamCard = lazy(() => import("../components/SteamCard.jsx"));
const SteamRecents = lazy(() => import("../components/SteamRecents.jsx"));
const SteamGames = lazy(() => import("../components/SteamGames.jsx"));

export default function Steam() {
  useEffect(() => {
    document.title = "Tyler's Gaming Lounge";
  }, []);

  return (
    <div className="steam-page page">
      <header
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          gap: "6px",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: "2rem",
            color: "#ffb6c1",
            textShadow: "0 0 8px rgba(255,182,193,0.8)",
            fontWeight: 700,
          }}
        >
          Tyler&apos;s Gaming Lounge
        </h1>
        <p style={{ margin: "6px 0 0", color: "var(--text-soft)", fontSize: "0.9rem" }}>
          Steam profile, recents, and library at a glance.
        </p>
      </header>

      <LazySection minHeight={260}>
        <Suspense fallback={<SectionSkeleton label="Profile" />}>
          <SteamCard />
        </Suspense>
      </LazySection>

      <LazySection minHeight={240}>
        <Suspense fallback={<SectionSkeleton label="Recently played" />}>
          <SteamRecents />
        </Suspense>
      </LazySection>

      <LazySection minHeight={400}>
        <Suspense fallback={<SectionSkeleton label="Library & Achievements" />}>
          <SteamGames />
        </Suspense>
      </LazySection>
    </div>
  );
}

function LazySection({ children, minHeight = 200 }) {
  const [ready, setReady] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setReady(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px 0px" }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const style = ready ? undefined : { minHeight };

  return (
    <div ref={ref} style={style}>
      {ready ? children : <SectionSkeleton />}
    </div>
  );
}

function SectionSkeleton({ label = "Loading section" }) {
  return (
    <div className="steam-skeleton">
      <div className="steam-skeleton-bar" />
      <div className="steam-skeleton-bar short" />
      <p className="steam-skeleton-label">{label}</p>
    </div>
  );
}
