import { useEffect, useState } from "react";

const API = "https://steam-worker.imokissick.workers.dev";

export default function SteamCard() {
  const [profile, setProfile] = useState(null);
  const [level, setLevel] = useState(null);
  const [badges, setBadges] = useState(null);
  const [owned, setOwned] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [profileRes, levelRes, badgesRes, ownedRes] = await Promise.all([
          fetch(`${API}/steam/profile`),
          fetch(`${API}/steam/level`),
          fetch(`${API}/steam/badges`),
          fetch(`${API}/steam/owned-games`),
        ]);
        if (!profileRes.ok || !levelRes.ok || !badgesRes.ok || !ownedRes.ok) {
          throw new Error("Unable to load Steam profile data");
        }
        const [profileData, levelData, badgesData, ownedData] = await Promise.all([
          profileRes.json(),
          levelRes.json(),
          badgesRes.json(),
          ownedRes.json(),
        ]);
        if (!cancelled) {
          setProfile(profileData);
          setLevel(levelData);
          setBadges(badgesData);
          setOwned(ownedData);
        }
      } catch (err) {
        if (!cancelled) setError(err.message || "Steam profile unavailable");
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <div className="steam-card"> {error} </div>;
  }

  if (!profile) return null;

  const statusLabel = status(profile.personastate);
  const statusClass = statusLabel.toLowerCase();

  return (
    <div className="steam-card">
      <div className="steam-card__header">
        <div className="steam-card__avatar">
          <img src={profile.avatarfull} alt={`${profile.personaname}'s avatar`} />
        </div>
        <div>
          <h2 className="steam-card__name">{profile.personaname}</h2>
          <div className="steam-card__meta">
            <span className={`pill pill-status ${statusClass}`}>{statusLabel}</span>
          </div>
        </div>
        {profile.profileurl && (
          <a
            className="steam-card__link"
            href={profile.profileurl}
            target="_blank"
            rel="noreferrer"
          >
            View profile
          </a>
        )}
      </div>

      {profile.gameextrainfo && (
        <div className="steam-card__now-playing">
          <span>Now playing</span>
          <strong>{profile.gameextrainfo}</strong>
        </div>
      )}

      {(level != null || badges || owned) && (
        <div className="steam-card__stats">
          <Stat label="Level" value={level ?? "-"} />
          <Stat label="Badges" value={badges?.badges?.length ?? "-"} />
          <Stat label="XP" value={badges?.player_xp?.toLocaleString?.() ?? "-"} />
          <Stat label="Owned" value={owned?.game_count ?? "-"} />
        </div>
      )}
    </div>
  );
}

const Stat = ({ label, value }) => (
  <div className="steam-card__stat">
    <p className="subtext">{label}</p>
    <strong>{value}</strong>
  </div>
);

const status = (s = 0) =>
  ["Offline", "Online", "Busy", "Away", "Snooze", "Trade", "Play"][s] || "Offline";
