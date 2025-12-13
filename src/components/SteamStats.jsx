import { useEffect, useState } from "react";

const API = "https://steam-worker.imokissick.workers.dev";

export default function SteamStats() {
  const [level, setLevel] = useState(null);
  const [badges, setBadges] = useState(null);
  const [profile, setProfile] = useState(null);
  const [owned, setOwned] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setError("");
        const [levelRes, badgesRes, profileRes, ownedRes] = await Promise.all([
          fetch(`${API}/steam/level`),
          fetch(`${API}/steam/badges`),
          fetch(`${API}/steam/profile`),
          fetch(`${API}/steam/owned-games`),
        ]);
        if (!levelRes.ok || !badgesRes.ok || !profileRes.ok || !ownedRes.ok) {
          throw new Error("Unable to load Steam stats");
        }
        const [levelData, badgesData, profileData, ownedData] = await Promise.all([
          levelRes.json(),
          badgesRes.json(),
          profileRes.json(),
          ownedRes.json(),
        ]);
        if (cancelled) return;
        setLevel(levelData);
        setBadges(badgesData);
        setProfile(profileData);
        setOwned(ownedData);
      } catch (err) {
        if (!cancelled) setError(err.message || "Stats unavailable");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <div className="stats steam-panel">Loading Steam stats...</div>;
  }

  if (error) {
    return <div className="stats steam-panel">{error}</div>;
  }

  return (
    <div className="steam-panel steam-stats">
      <div className="stat-grid">
        <Stat label="Level" value={level ?? "-"} />
        <Stat label="Badges" value={badges?.badges?.length ?? "-"} />
        <Stat label="XP" value={badges?.player_xp?.toLocaleString?.() ?? "-"} />
        <Stat label="Owned Games" value={owned?.game_count ?? "-"} />
        <Stat label="Name" value={profile?.personaname ?? "Unknown"} />
        <Stat label="Country" value={profile?.loccountrycode ?? "N/A"} />
      </div>
    </div>
  );
}

const Stat = ({ label, value }) => (
  <div className="stat">
    <p className="subtext">{label}</p>
    <strong>{value}</strong>
  </div>
);
