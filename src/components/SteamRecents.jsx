import { useEffect, useState } from "react";

const API = "https://steam-worker.imokissick.workers.dev";

export default function SteamRecents() {
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setError("");
        setLoading(true);
        const res = await fetch(`${API}/steam/recent-games`);
        if (!res.ok) throw new Error("Unable to load recent games");
        const data = await res.json();
        if (!cancelled) setRecent(data || []);
      } catch (err) {
        if (!cancelled) setError(err.message || "Recent games unavailable");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <div className="steam-panel">Loading recent games...</div>;
  if (error) return <div className="steam-panel">{error}</div>;

  return (
    <div className="steam-panel">
      <h4>Recently played</h4>
      <div className="recent-grid">
        {recent.slice(0, 4).map((g) => (
          <RecentCard key={g.appid} game={g} />
        ))}
        {recent.length === 0 && <p className="subtext">No recent playtime.</p>}
      </div>
    </div>
  );
}

function RecentCard({ game }) {
  const hours = ((game.playtime_forever || 0) / 60).toFixed(0);
  const recentHours = game.playtime_2weeks ? (game.playtime_2weeks / 60).toFixed(1) : null;
  const lastPlayedTs =
    game.rtime_last_played ||
    game.last_playtime ||
    game.last_played ||
    game.last_played_time ||
    game.last_played_on ||
    null;
  const lastPlayed = lastPlayedTs
    ? new Date(Number(lastPlayedTs) * 1000).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Never";

  return (
    <div className="recent-card">
      <div className="recent-card__image">
        <img
          src={`https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appid}/header.jpg`}
          alt={game.name}
          loading="lazy"
          onError={(e) => {
            if (e.target.dataset.fallback) return;
            e.target.dataset.fallback = "1";
            e.target.src = "https://via.placeholder.com/460x215?text=No+Image";
          }}
        />
      </div>
      <div className="recent-card__body">
        <strong>{game.name}</strong>
        <p className="subtext">
          {hours} hrs total {recentHours ? `· ${recentHours} hrs (2w)` : ""}
        </p>
      </div>
    </div>
  );
}
