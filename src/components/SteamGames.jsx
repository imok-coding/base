import { useCallback, useEffect, useMemo, useState } from "react";

const API = "https://steam-worker.imokissick.workers.dev";
const ACHIEVEMENTS_ENABLED = true; // Achievements endpoint is available via worker

export default function SteamGames() {
  const [owned, setOwned] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [term, setTerm] = useState("");
  const [minHours, setMinHours] = useState(0);
  const [sortBy, setSortBy] = useState("recent");
  const [achievements, setAchievements] = useState({});
  const [achLoading, setAchLoading] = useState({});

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setError("");
        setLoading(true);
        const ownedRes = await fetch(`${API}/steam/owned-games`);
        if (!ownedRes.ok) throw new Error("Unable to load Steam games");
        const ownedData = await ownedRes.json();
        if (cancelled) return;
        setOwned(ownedData || null);
      } catch (err) {
        if (!cancelled) setError(err.message || "Steam games unavailable");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredGames = useMemo(() => {
    if (!owned?.games) return [];
    const search = term.toLowerCase();
    const filterHours = Number(minHours) || 0;
    const sorters = {
      recent: (a, b) => (b.rtime_last_played || 0) - (a.rtime_last_played || 0),
      name: (a, b) => a.name.localeCompare(b.name),
      hours: (a, b) => (b.playtime_forever || 0) - (a.playtime_forever || 0),
    };
    return [...owned.games]
      .filter(
        (g) =>
          g.name?.toLowerCase().includes(search) &&
          (g.playtime_forever || 0) / 60 >= filterHours
      )
      .sort(sorters[sortBy] || sorters.recent)
      .slice(0, 60);
  }, [owned, term, minHours, sortBy]);

  const requestAchievements = useCallback(
    async (appid) => {
      if (!ACHIEVEMENTS_ENABLED) return;
      if (!appid || achievements[appid] || achLoading[appid]) return;
      setAchLoading((prev) => ({ ...prev, [appid]: true }));
      try {
        const res = await fetch(`${API}/steam/achievements?appid=${appid}`);
        if (!res.ok) throw new Error("Unable to load achievements");
        const data = await res.json();
        setAchievements((prev) => ({ ...prev, [appid]: data }));
      } catch (err) {
        setAchievements((prev) => ({
          ...prev,
          [appid]: { error: err.message || "No achievements found" },
        }));
      } finally {
        setAchLoading((prev) => {
          const next = { ...prev };
          delete next[appid];
          return next;
        });
      }
    },
    [achievements, achLoading]
  );

  if (loading) {
    return <div className="steam-panel">Loading library...</div>;
  }

  if (error) {
    return <div className="steam-panel">{error}</div>;
  }

  if (!owned) return null;

  return (
    <div className="steam-panel steam-games">
      <header className="steam-games__header">
        <div>
          <p className="eyebrow">Library</p>
          <h3>Game filtering & achievements</h3>
        </div>
        <div className="steam-filters">
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search games..."
          />
          <label>
            Min hours
            <input
              type="number"
              min="0"
              value={minHours}
              onChange={(e) => setMinHours(e.target.value)}
            />
          </label>
          <label>
            Sort by
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="recent">Recently played</option>
              <option value="hours">Hours played</option>
              <option value="name">Name</option>
            </select>
          </label>
        </div>
      </header>

      <PlaytimeGraph owned={owned} />

      <section className="steam-section library-list">
        {filteredGames.map((g) => (
          <LibraryRow
            key={g.appid}
            game={g}
            achievement={achievements[g.appid]}
            loading={!!achLoading[g.appid]}
            requestAchievements={requestAchievements}
          />
        ))}
        {filteredGames.length === 0 && <p className="subtext">No games match this search.</p>}
      </section>

      <SteamTotals owned={owned} />
    </div>
  );
}

function SteamTotals({ owned }) {
  const totalHours = owned.games.reduce((t, g) => t + g.playtime_forever, 0) / 60;

  return (
    <div className="totals">
      <div>{owned.game_count} games</div>
      <div>{totalHours.toFixed(0)} hrs played</div>
    </div>
  );
}

function LibraryRow({ game, achievement, loading, requestAchievements }) {
  useEffect(() => {
    requestAchievements(game.appid);
  }, [game.appid, requestAchievements]);

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

  const achList = achievement?.achievements || achievement?.playerstats?.achievements || [];
  const achieved = achList.filter((a) => a.achieved).length;
  const total = achList.length || 0;
  const progress = total ? Math.round((achieved / total) * 100) : 0;
  const displayIcons = achList
    .filter((a) => a.achieved && a.icon)
    .slice(0, 5)
    .map((a) => a.icon);
  const achievementError =
    achievement?.error ||
    (achievement?.playerstats?.success === false ? achievement?.playerstats?.error || "Unavailable" : null);
  const isLoading = ACHIEVEMENTS_ENABLED && (loading || (!achievement && !achievementError));

  return (
    <div className="library-row">
      <div className="library-row__main">
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
        <div className="library-row__meta">
          <div className="library-row__title">
            <strong>{game.name}</strong>
          </div>
          <p className="subtext">
            {recentHours ? `${recentHours} hrs in 2 weeks - ` : ""}
            Last played on {lastPlayed}
          </p>
        </div>
        <div className="library-row__hours">
          <span className="subtext">{hours} hrs on record</span>
        </div>
      </div>

      <div className="library-row__ach">
        <div className="library-row__ach-header">
          <span className="subtext">Achievement Progress</span>
          <span className="subtext">
            {ACHIEVEMENTS_ENABLED
              ? isLoading
                ? "Loading..."
                : achievementError
                ? achievementError
                : total
                ? `${achieved} of ${total}`
                : "No Achievements"
              : "Unavailable"}
          </span>
        </div>
        {ACHIEVEMENTS_ENABLED && (
          <>
            <div className="achievements__progress slim">
              <div className="achievements__bar" style={{ width: `${progress}%` }} />
            </div>
            {!achievementError && total > 0 && (
              <div className="achievements__icons">
                {displayIcons.map((src, idx) => (
                  <img key={`${game.appid}-icon-${idx}`} src={src} alt="Achievement icon" />
                ))}
                {total > displayIcons.length && (
                  <span className="achievements__more">+{Math.max(total - displayIcons.length, 0)}</span>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function PlaytimeGraph({ owned }) {
  const buckets = useMemo(() => {
    if (!owned?.games?.length) return [];
    const now = new Date();
    const months = Array.from({ length: 6 }).map((_, idx) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - idx), 1);
      return {
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: d.toLocaleString("default", { month: "short" }),
        value: 0,
      };
    });
    const map = Object.fromEntries(months.map((m) => [m.key, m]));

    owned.games.forEach((g) => {
      if (!g.rtime_last_played) return;
      const d = new Date(g.rtime_last_played * 1000);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (!map[key]) return;
      const hours =
        g.playtime_2weeks != null
          ? g.playtime_2weeks / 60
          : g.playtime_forever
          ? g.playtime_forever / 60
          : 0;
      map[key].value += hours;
    });

    return months;
  }, [owned]);

  if (!buckets.length) return null;
  const max = Math.max(...buckets.map((b) => b.value), 0);
  const hasData = buckets.some((b) => b.value > 0);

  return (
    <div className="playtime-card">
      <div className="playtime-card__head">
        <p className="eyebrow">Graphs</p>
        <h4>Playtime over time</h4>
        <p className="subtext">
          {hasData ? "Hours by last-played month (approximate)" : "No recent playtime data available."}
        </p>
      </div>
      <div className="playtime-graph">
        {buckets.map((b) => (
          <div key={b.key} className="playtime-graph__bar">
            <div
              className="playtime-graph__fill"
              style={{ height: hasData ? `${Math.max((b.value / Math.max(max, 1)) * 100, 6)}%` : "6%" }}
            />
            <span>{b.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}



