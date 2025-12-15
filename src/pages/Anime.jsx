import { useEffect, useMemo, useState } from "react";
import { fetchAnimeList, fetchAnimeSummary, fetchUserStats } from "../api/malApi.js";
import "../styles/anime.css";
import { useAuth } from "../contexts/AuthContext.jsx";

export default function Anime() {
  const { admin } = useAuth();
  const formatStatus = (value) => {
    if (!value) return "Unknown";
    return value
      .toString()
      .replace(/_/g, " ")
      .replace(/\b\w/g, (m) => m.toUpperCase());
  };

  const [items, setItems] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalItem, setModalItem] = useState(null);
  const [synopsisCache, setSynopsisCache] = useState({});
  const [modalLoading, setModalLoading] = useState(false);
  const [modalSynopsisShown, setModalSynopsisShown] = useState(false);
  const [userStats, setUserStats] = useState(null);

  useEffect(() => {
    document.title = "Anime | Library";
  }, []);

  const formatRelativeTime = (timestamp) => {
    if (!timestamp) return "";
    const diff = Date.now() - timestamp;
    const abs = Math.max(diff, 0);
    const minutes = Math.floor(abs / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 48) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 14) return `${days}d ago`;
    const weeks = Math.floor(days / 7);
    if (weeks < 8) return `${weeks}w ago`;
    const months = Math.floor(days / 30);
    return `${months}mo ago`;
  };

  const slugify = (text, fallback = "image") => {
    const slug = (text || "")
      .toString()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
    return slug || fallback;
  };

  const downloadImagesZip = async () => {
    const files = items
      .filter((i) => i.image)
      .map((i, idx) => ({
        url: i.image,
        name: slugify(i.title || `anime-${idx + 1}`, `anime-${idx + 1}`),
      }));
    if (!files.length) {
      alert("No images found to download.");
      return;
    }
    try {
      const JSZip = (await import("https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm")).default;
      const zip = new JSZip();
      const folder = zip.folder("images");
      const nameCounts = {};
      await Promise.all(
        files.map(async (file, idx) => {
          try {
            const res = await fetch(file.url);
            const blob = await res.blob();
            const ext = (file.url.split(".").pop() || "jpg").split(/[?#]/)[0];
            const base = file.name || `image-${idx + 1}`;
            nameCounts[base] = (nameCounts[base] || 0) + 1;
            const suffix = nameCounts[base] > 1 ? `-${nameCounts[base]}` : "";
            folder.file(`${base}${suffix}.${ext}`, blob);
          } catch (e) {
            console.warn("Failed to fetch image", file.url, e);
          }
        })
      );
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "anime-images.zip";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Zip download failed", err);
      alert("Failed to create zip. Please try again.");
    }
  };

  useEffect(() => {
    async function load() {
      try {
        const data = await fetchAnimeList();
        setItems(data);
        setFiltered(data);
      } catch (err) {
        console.error(err);
        setError("Failed to load data from MAL.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    fetchUserStats()
      .then((stats) => {
        if (stats) setUserStats(stats);
      })
      .catch(() => {});
  }, []);

  const getStatusRank = (s) => {
    const key = (s || "unknown").toLowerCase();
    switch (key) {
      case "watching":
        return 0;
      case "completed":
        return 1;
      case "on_hold":
        return 2;
      case "plan_to_watch":
        return 3;
      case "dropped":
        return 4;
      default:
        return 5;
    }
  };

  const formatProgress = (a) => {
    const watched = Number.isFinite(Number(a.watchedEpisodes)) ? Number(a.watchedEpisodes) : 0;
    const total = Number.isFinite(Number(a.episodes)) ? Number(a.episodes) : null;
    if (total) return `${Math.min(watched, total)}/${total} eps`;
    if (watched) return `${watched} eps`;
    return "No progress";
  };

  useEffect(() => {
    let cur = [...items];
    if (status !== "all") {
      cur = cur.filter((a) => (a.status || "").toLowerCase() === status);
    }
    if (term) {
      const t = term.toLowerCase();
      cur = cur.filter((a) => (a.title || "").toLowerCase().includes(t));
    }
    cur.sort((a, b) => {
      const ra = getStatusRank(a.status);
      const rb = getStatusRank(b.status);
      if (ra !== rb) return ra - rb;
      return (a.title || "").localeCompare(b.title || "");
    });
    setFiltered(cur);
  }, [items, status, term]);

  const recentUpdates = useMemo(() => {
    return [...items]
      .filter((a) => Number.isFinite(a.updatedAt))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 6);
  }, [items]);

  useEffect(() => {
    setModalSynopsisShown(false);
    setModalLoading(false);
  }, [modalItem]);

  const stats = useMemo(() => {
    const total = items.length;
    const totalWatchedEpisodes = items.reduce((sum, a) => {
      const watched = Number(a.watchedEpisodes);
      return Number.isFinite(watched) ? sum + watched : sum;
    }, 0);
    const totalHours = totalWatchedEpisodes * 0.4; // ~24 minutes per episode watched
    const scoredItems = items.filter((a) => Number.isFinite(a.score) && a.score > 0);
    const scoreSum = scoredItems.reduce((s, a) => s + a.score, 0);
    const byStatus = {
      watching: 0,
      completed: 0,
      on_hold: 0,
      dropped: 0,
      plan_to_watch: 0,
      unknown: 0,
    };
    items.forEach((a) => {
      const s = (a.status || "unknown").toLowerCase();
      if (byStatus[s] != null) byStatus[s] += 1;
      else byStatus.unknown += 1;
    });
    return {
      total,
      totalWatchedEpisodes,
      byStatus,
      avgScore: scoredItems.length ? scoreSum / scoredItems.length : 0,
      totalHours,
    };
  }, [items]);

  const displayDays = userStats?.daysWatched ?? (stats.totalHours || 0) / 24;
  const displayEpisodesWatched = userStats?.episodesWatched ?? stats.totalWatchedEpisodes;

  const renderCard = (a) => {
    const cover =
      a.image ||
      "https://imgur.com/chUgq4W.png";
    const watched = Number.isFinite(Number(a.watchedEpisodes)) ? Number(a.watchedEpisodes) : 0;
    const total = Number.isFinite(Number(a.episodes)) ? Number(a.episodes) : null;
    const progressLabel = total
      ? `Episode ${Math.min(watched, total)}/${total}`
      : `Episode ${watched}`;
    const scoreLabel = Number.isFinite(Number(a.score)) && Number(a.score) > 0 ? a.score : "Not rated";
    return (
      <article
        key={a.id || a.title}
        className="anime-card"
        onClick={() => setModalItem(a.synopsis ? a : { ...a, synopsis: synopsisCache[a.id] })}
      >
        <div className="anime-cover-wrap">
          <img className="anime-cover" src={cover} alt={a.title} loading="lazy" decoding="async" />
          <div className={`badge-status ${(a.status || 'unknown').toLowerCase()}`}>
            {formatStatus(a.status)}
          </div>
          {a.score != null && (
            <div className="badge-score">
              {scoreLabel}
            </div>
          )}
        </div>
        <div className="anime-meta">
          <div className="anime-title" title={a.title}>{a.title}</div>
          <div className="anime-sub">
            {a.episodes ? `${a.episodes} episodes` : "Episodes: ?"}
          </div>
          <div className="anime-progress">{progressLabel}</div>
          <div className="anime-progress">Status: {formatStatus(a.status)}</div>
        </div>
      </article>
    );
  };

  const renderUpdateCard = (a) => {
    return (
      <article key={`update-${a.id || a.title}`} className="anime-update-card">
        <div className="anime-update-title" title={a.title}>{a.title}</div>
        <div className="anime-update-meta">
          <span className="anime-update-progress">{formatProgress(a)}</span>
          <span className="anime-update-dot" aria-hidden="true">•</span>
          <span className="anime-update-status">{formatStatus(a.status)}</span>
        </div>
        <div className="anime-update-time">{formatRelativeTime(a.updatedAt)}</div>
      </article>
    );
  };

  return (
    <main className="anime-page">
      <div className="anime-content">
        <header
          className="anime-header"
          style={{
            position: "relative",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            textAlign: "center",
            width: "100%",
          }}
        >
          <div
            style={{
              textAlign: "center",
              margin: "0 auto",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 60px",
            }}
          >
            <h1
              className="anime-title"
              style={{
                margin: 0,
                fontSize: "2rem",
                color: "#ffb6c1",
                textShadow: "0 0 8px rgba(255,182,193,0.8)",
                fontWeight: 700,
              }}
            >
              Tyler&apos;s Anime Library
            </h1>
            <p className="anime-sub" style={{ textAlign: "center", margin: "6px 0 0" }}>
              The Anime I've watched/watching synced directly from MAL (MyAnimeList)
            </p>
          </div>
          {admin && (
            <div
              style={{
                position: "absolute",
                right: 0,
                top: "50%",
                transform: "translateY(-50%)",
              }}
            >
              <button className="stat-link" type="button" onClick={downloadImagesZip}>
                Download Images
              </button>
            </div>
          )}
        </header>

        <div className="anime-stats">
          <div className="anime-stat-card">
            <div className="anime-stat-label">Total Entries</div>
            <div className="anime-stat-value">{stats.total}</div>
          </div>
          <div className="anime-stat-card">
            <div className="anime-stat-label">Episodes Watched</div>
            <div className="anime-stat-value">
              {displayEpisodesWatched}
            </div>
          </div>
          <div className="anime-stat-card">
            <div className="anime-stat-label">Watching</div>
            <div className="anime-stat-value">{stats.byStatus.watching}</div>
          </div>
          <div className="anime-stat-card">
            <div className="anime-stat-label">Completed</div>
            <div className="anime-stat-value">{stats.byStatus.completed}</div>
          </div>
          <div className="anime-stat-card">
            <div className="anime-stat-label">Plan to Watch</div>
            <div className="anime-stat-value">{stats.byStatus.plan_to_watch}</div>
          </div>
          <div className="anime-stat-card">
            <div className="anime-stat-label">Avg. Score</div>
            <div className="anime-stat-value">
              {stats.avgScore ? stats.avgScore.toFixed(1) : "0.0"}
            </div>
          </div>
          <div className="anime-stat-card">
            <div className="anime-stat-label">Days Watched</div>
            <div className="anime-stat-value">
              {displayDays.toFixed(1)}
            </div>
          </div>
        </div>

        <section className="anime-toolbar">
          <input
            type="text"
            placeholder="Search anime by title..."
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            className="anime-input"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="anime-select"
          >
            <option value="all">All statuses</option>
            <option value="watching">Watching</option>
            <option value="completed">Completed</option>
            <option value="on_hold">On Hold</option>
            <option value="plan_to_watch">Plan to Watch</option>
            <option value="dropped">Dropped</option>
          </select>
        </section>

        {loading && <div className="loading">Loading anime list from MAL...</div>}
        {error && <div className="error-state">{error}</div>}

        {!loading && !error && (
          <>
            {filtered.length === 0 ? (
              <div className="empty-state">No results match your filters yet.</div>
            ) : (
              <section className="anime-grid">
                {filtered.map((a) => renderCard(a))}
              </section>
            )}
          </>
        )}
      </div>

      {recentUpdates.length > 0 && (
        <aside className="anime-updates-float">
          <div className="anime-updates-header">
            <h3>Recent Updates</h3>
            <span className="anime-updates-caption">Last list activity</span>
          </div>
      <div className="anime-updates-list">
        {recentUpdates.map((a) => renderUpdateCard(a))}
      </div>
    </aside>
  )}

  {modalItem && (
        <div
          className="modal-backdrop visible"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalItem(null);
          }}
        >
          <div className="anime-modal">
            <div className="anime-modal-header">
              <h2 style={{ color: "#ffb6c1", margin: 0 }}>{modalItem.title}</h2>
              <button className="anime-modal-close" onClick={() => setModalItem(null)} type="button">
                Close
              </button>
            </div>
            <div className="anime-modal-body">
              <div>
                <img
                  className="anime-modal-cover"
                  src={
                    modalItem.image ||
                    "https://imgur.com/chUgq4W.png"
                  }
                  alt={modalItem.title}
                />
              </div>
              <div className="anime-modal-meta">
                <div><strong>Status:</strong> {formatStatus(modalItem.status)}</div>
                <div>
                  <strong>Episodes:</strong>{" "}
                  {modalItem.episodes ? modalItem.episodes : "Unknown"}
                </div>
                <div>
                  <strong>Progress:</strong>{" "}
                  {Number.isFinite(Number(modalItem.watchedEpisodes))
                    ? `Episode ${modalItem.watchedEpisodes}${
                        Number.isFinite(Number(modalItem.episodes))
                          ? `/${modalItem.episodes}`
                          : ""
                      }`
                    : "Unknown"}
                </div>
                <div>
                  <strong>Score:</strong>{" "}
                  {Number.isFinite(Number(modalItem.score)) && Number(modalItem.score) > 0
                    ? modalItem.score
                    : "Not rated"}
                </div>
              </div>
              <SynopsisSection
                modalItem={modalItem}
                modalLoading={modalLoading}
                modalSynopsisShown={modalSynopsisShown}
                onReveal={async () => {
                  if (!modalItem) return;
                  setModalSynopsisShown(true);
                  const id = modalItem.id;
                  if (!id) return;
                  const cached = synopsisCache[id];
                  if (cached !== undefined) {
                    setModalItem((prev) => (prev ? { ...prev, synopsis: cached } : prev));
                    return;
                  }
                  setModalLoading(true);
                  try {
                    const synopsis = await fetchAnimeSummary(id);
                    setSynopsisCache((prev) => ({ ...prev, [id]: synopsis || "" }));
                    setModalItem((prev) => (prev ? { ...prev, synopsis: synopsis || "" } : prev));
                  } catch (err) {
                    setSynopsisCache((prev) => ({ ...prev, [id]: "" }));
                    setModalItem((prev) => (prev ? { ...prev, synopsis: "" } : prev));
                  } finally {
                    setModalLoading(false);
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function SynopsisSection({ modalItem, modalLoading, modalSynopsisShown, onReveal }) {
  const synopsisText = modalItem?.synopsis?.trim() || "";

  return (
    <div className="anime-modal-summary">
      <div className="anime-modal-summary-header">
        <h3>Synopsis</h3>
        {!modalSynopsisShown && (
          <button className="anime-synopsis-btn" type="button" onClick={onReveal}>
            {modalLoading ? "Loading..." : "Reveal Synopsis"}
          </button>
        )}
      </div>
      {modalSynopsisShown ? (
        <p className="anime-modal-summary-text">
          {modalLoading && !synopsisText
            ? "Loading synopsis..."
            : synopsisText || "No synopsis available."}
        </p>
      ) : (
        <p className="anime-modal-summary-text" style={{ opacity: 0.7 }}>
          Synopsis hidden. Click reveal to view.
        </p>
      )}
    </div>
  );
}
