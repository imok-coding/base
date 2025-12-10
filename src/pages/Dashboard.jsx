import React, { useEffect, useMemo, useState } from "react";
import "../styles/dashboard.css";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { useAuth } from "../contexts/AuthContext";
import { Navigate } from "react-router-dom";

// ---------- helpers ----------

function toNumber(val) {
  if (val === null || val === undefined || val === "") return 0;
  if (typeof val === "number") return Number.isFinite(val) ? val : 0;
  const cleaned = String(val).replace(/[^0-9.-]/g, "");
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function toInt(val) {
  if (val === null || val === undefined || val === "") return 0;
  if (typeof val === "number") return Number.isFinite(val) ? Math.round(val) : 0;
  const cleaned = String(val).replace(/[^0-9]/g, "");
  const num = parseInt(cleaned, 10);
  return Number.isFinite(num) ? num : 0;
}

function parseDateSafe(raw) {
  if (!raw) return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;

  const s = String(raw).trim();
  if (!s) return null;

  // ISO / RFC formats first
  const iso = new Date(s);
  if (!Number.isNaN(iso.getTime())) return iso;

  // Try basic split formats: yyyy-mm-dd, mm/dd/yyyy, dd/mm/yyyy
  const parts = s.split(/[\/\-.]/).map((p) => p.trim());
  if (parts.length === 3) {
    // yyyy-mm-dd or yyyy.mm.dd
    if (parts[0].length === 4) {
      const [y, m, d] = parts.map((p) => parseInt(p, 10));
      if (!Number.isNaN(y) && !Number.isNaN(m) && !Number.isNaN(d)) {
        const dt = new Date(y, m - 1, d);
        if (!Number.isNaN(dt.getTime())) return dt;
      }
    } else {
      // assume mm/dd/yyyy
      const [m, d, y] = parts.map((p) => parseInt(p, 10));
      if (!Number.isNaN(y) && !Number.isNaN(m) && !Number.isNaN(d)) {
        const dt = new Date(y, m - 1, d);
        if (!Number.isNaN(dt.getTime())) return dt;
      }
    }
  }

  return null;
}

function fmtCurrency(num) {
  return `$${Number(num || 0).toFixed(2)}`;
}

// Normalize Firestore doc -> "book" structure similar to your old index.html code
function normalizeBook(raw) {
  const d = raw || {};
  return {
    id: d.id,
    Title: d.Title ?? d.title ?? "",
    Authors: d.Authors ?? d.authors ?? "",
    Publisher: d.Publisher ?? d.publisher ?? "",
    Demographic: d.Demographic ?? d.demographic ?? "",
    Genre: d.Genre ?? d.genre ?? "",
    SubGenre: d.SubGenre ?? d.subGenre ?? "",
    Date: d.Date ?? d.date ?? "",
    DateRead: d.DateRead ?? d.dateRead ?? "",
    DatePurchased: d.DatePurchased ?? d.datePurchased ?? "",
    ISBN: d.ISBN ?? d.isbn ?? "",
    PageCount: d.PageCount ?? d.pageCount ?? d.pages ?? "",
    Rating: d.Rating ?? d.rating ?? "",
    Read: d.Read ?? d.read ?? false,
    MSRP: d.MSRP ?? d.msrp ?? "",
    AmountPaid: d.AmountPaid ?? d.amountPaid ?? "",
    CollectiblePrice: d.CollectiblePrice ?? d.collectiblePrice ?? "",
    SpecialType: d.SpecialType ?? d.specialType ?? "",
  };
}

// Top lists: demographics, publishers, genres
function computeTopCountsSimple(books, field, topN = 3) {
  const counts = new Map();

  books.forEach((b) => {
    let raw = b[field];
    if (!raw) return;

    // Support comma or slash separated
    const parts = String(raw)
      .split(/[\/,]/)
      .map((p) => p.trim())
      .filter(Boolean);

    if (!parts.length) return;

    parts.forEach((p) => {
      counts.set(p, (counts.get(p) || 0) + 1);
    });
  });

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, topN)
    .map(([label, count]) => ({ label, count }));
}

// Core stats logic (ported conceptually from updateDashboardStats)
function computeDashboardStats(libraryRaw, wishlistRaw) {
  const libraryBooks = libraryRaw.map(normalizeBook);
  const wishlistItems = wishlistRaw.map(normalizeBook);

  const totalLib = libraryBooks.length;
  const wishCount = wishlistItems.length;

  const readCount = libraryBooks.filter((b) => !!b.Read).length;
  const unreadCount = totalLib - readCount;
  const readPct = totalLib ? Math.round((readCount / totalLib) * 100) : 0;

  const totalAll = totalLib + wishCount;
  const libPct = totalAll ? Math.round((totalLib / totalAll) * 100) : 0;
  const wishPct = totalAll ? 100 - libPct : 0;

  // Ratings (series-ish: just group by Title)
  const seriesRatingMap = new Map();
  libraryBooks.forEach((b) => {
    const ratingVal =
      b.Rating !== undefined && b.Rating !== null && b.Rating !== ""
        ? parseFloat(b.Rating)
        : NaN;
    if (!b.Read || !Number.isFinite(ratingVal) || ratingVal <= 0) return;
    const key = (b.Title || "").trim() || b.id || "";
    const display = b.Title || "Untitled";
    if (!seriesRatingMap.has(key)) {
      seriesRatingMap.set(key, { name: display, sum: 0, count: 0 });
    }
    const entry = seriesRatingMap.get(key);
    entry.sum += ratingVal;
    entry.count += 1;
  });

  const seriesRatings = Array.from(seriesRatingMap.values())
    .map((e) => ({
      name: e.name,
      avg: e.sum / e.count,
      count: e.count,
    }))
    .filter((e) => Number.isFinite(e.avg));

  const avgRating =
    seriesRatings.length > 0
      ? seriesRatings.reduce((s, e) => s + e.avg, 0) / seriesRatings.length
      : null;

  const topRatedSeries = [...seriesRatings]
    .sort((a, b) => b.avg - a.avg || a.name.localeCompare(b.name))
    .slice(0, 3);

  // Pages read / total
  const totalPages = libraryBooks.reduce((sum, b) => {
    const pc =
      b.PageCount !== undefined && b.PageCount !== null && b.PageCount !== ""
        ? parseInt(b.PageCount, 10)
        : NaN;
    return Number.isFinite(pc) ? sum + pc : sum;
  }, 0);

  const readPages = libraryBooks.reduce((sum, b) => {
    if (!b.Read) return sum;
    const pc =
      b.PageCount !== undefined && b.PageCount !== null && b.PageCount !== ""
        ? parseInt(b.PageCount, 10)
        : NaN;
    return Number.isFinite(pc) ? sum + pc : sum;
  }, 0);

  const pagesPct = totalPages ? Math.round((readPages / totalPages) * 100) : 0;

  // Collection value
  const totalMsrp = libraryBooks.reduce(
    (sum, b) => sum + toNumber(b.MSRP),
    0
  );
  const totalPaid = libraryBooks.reduce(
    (sum, b) => sum + toNumber(b.AmountPaid),
    0
  );
  const totalCollectible = libraryBooks.reduce(
    (sum, b) => sum + toNumber(b.CollectiblePrice),
    0
  );

  let pctOff = null;
  if (totalMsrp && Number.isFinite(totalPaid)) {
    pctOff = ((totalMsrp - totalPaid) / totalMsrp) * 100;
  }

  // Top lists
  const topDemographics = computeTopCountsSimple(
    libraryBooks,
    "Demographic",
    3
  );
  const topPublishers = computeTopCountsSimple(libraryBooks, "Publisher", 3);
  const topGenres = computeTopCountsSimple(libraryBooks, "Genre", 3);

  // Current year stats
  const currentYear = new Date().getFullYear();
  const readThisYear = libraryBooks.filter((b) => {
    const dt = parseDateSafe(b.DateRead || b.Date);
    return dt && dt.getFullYear() === currentYear && b.Read;
  }).length;

  // Avg time from purchase to read
  const diffs = [];
  libraryBooks.forEach((b) => {
    if (!b.Read || !b.DatePurchased || !b.DateRead) return;
    const dp = parseDateSafe(b.DatePurchased);
    const dr = parseDateSafe(b.DateRead);
    if (!dp || !dr) return;
    const diffDays = Math.max(
      0,
      Math.round((dr.getTime() - dp.getTime()) / 86400000)
    );
    diffs.push(diffDays);
  });

  let avgReadDays = null;
  if (diffs.length) {
    avgReadDays = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  }

  // Next wishlist release
  const now = new Date();
  const upcoming = wishlistItems
    .map((b) => ({
      item: b,
      date: parseDateSafe(b.Date || b.DateRead || b.DatePurchased),
    }))
    .filter((x) => x.date && x.date.getTime() >= now.getTime())
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const nextRelease = upcoming.length ? upcoming[0] : null;

  return {
    libraryBooks,
    wishlistItems,
    totalLib,
    wishCount,
    readCount,
    unreadCount,
    readPct,
    libPct,
    wishPct,
    avgRating,
    topRatedSeries,
    totalPages,
    readPages,
    pagesPct,
    totalMsrp,
    totalPaid,
    totalCollectible,
    pctOff,
    topDemographics,
    topPublishers,
    topGenres,
    currentYear,
    readThisYear,
    avgReadDays,
    nextRelease, // { item, date } or null
  };
}

// ---------- React component ----------

export default function Dashboard() {
  const { user, admin } = useAuth();
  const [libraryDocs, setLibraryDocs] = useState([]);
  const [wishlistDocs, setWishlistDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());

  // Admin gate
  if (!user || !admin) {
    return <Navigate to="/" replace />;
  }

  // Live "now" for countdown
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [libSnap, wishSnap] = await Promise.all([
          getDocs(collection(db, "library")),
          getDocs(collection(db, "wishlist")),
        ]);

        const lib = libSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        const wish = wishSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

        setLibraryDocs(lib);
        setWishlistDocs(wish);
      } catch (err) {
        console.error(err);
        setError("Failed to load dashboard data from Firestore.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const stats = useMemo(
    () => computeDashboardStats(libraryDocs, wishlistDocs),
    [libraryDocs, wishlistDocs]
  );

  const {
    totalLib,
    wishCount,
    readCount,
    unreadCount,
    readPct,
    libPct,
    wishPct,
    avgRating,
    topRatedSeries,
    totalPages,
    readPages,
    pagesPct,
    totalMsrp,
    totalPaid,
    totalCollectible,
    pctOff,
    topDemographics,
    topPublishers,
    topGenres,
    currentYear,
    readThisYear,
    avgReadDays,
    nextRelease,
  } = stats;

  // Countdown text
  let nextReleaseTitle = "No upcoming wishlist release";
  let nextReleaseDateText = "--";
  let nextCountdownText = "--";

  if (nextRelease && nextRelease.date) {
    nextReleaseTitle = nextRelease.item.Title || "Unknown";
    nextReleaseDateText = nextRelease.date.toLocaleDateString();

    let diff = nextRelease.date.getTime() - now;
    if (diff < 0) diff = 0;

    const dayMs = 86400000;
    const hourMs = 3600000;
    const minuteMs = 60000;

    const days = Math.floor(diff / dayMs);
    diff -= days * dayMs;
    const hours = Math.floor(diff / hourMs);
    diff -= hours * hourMs;
    const minutes = Math.floor(diff / minuteMs);
    diff -= minutes * minuteMs;
    const seconds = Math.floor(diff / 1000);

    nextCountdownText = `${days}d ${String(hours).padStart(2, "0")}:${String(
      minutes
    ).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  // For top list bar widths
  function renderTopList(list) {
    if (!list || !list.length) {
      return <div className="stat-sub">No data yet</div>;
    }
    const max = Math.max(...list.map((i) => i.count)) || 1;
    return (
      <ul className="stat-list">
        {list.map((item) => (
          <li key={item.label} className="stat-list-row">
            <span className="stat-list-label">{item.label}</span>
            <span className="stat-list-count">{item.count}</span>
            <div className="bar-chart">
              <div
                className="bar"
                style={{ width: `${(item.count / max) * 100}%` }}
              ></div>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <main className="page dashboard-page">
      <div className="page-header">
        <h1>Manga Dashboard</h1>
        <p>
          Admin-only overview of your manga library, wishlist, and collection
          stats – wired directly from Firestore.
        </p>
      </div>

      {loading && <div className="dashboard-loading">Loading stats…</div>}
      {error && <div className="dashboard-error">{error}</div>}

      {!loading && !error && (
        <section id="dashboardSection" className="dashboard-section">
          <div className="dashboard-grid">
            {/* Mini cards: Total Library / Wishlist */}
            <div className="stat-card mini">
              <h3>Total Library Books</h3>
              <div className="stat-value" id="statTotalLibrary">
                {totalLib}
              </div>
            </div>

            <div className="stat-card mini">
              <h3>Wishlist Items</h3>
              <div className="stat-value" id="statWishlist">
                {wishCount}
              </div>
            </div>

            {/* Read / Unread */}
            <div className="stat-card">
              <h3>Read / Unread</h3>
              <div
                className="pie"
                id="pieRead"
                style={{ "--pct": readPct }}
                data-label={`${readCount} read / ${unreadCount} unread (${readPct}%)`}
              >
                <div className="pie-label" id="statReadPct">
                  {readPct}%
                </div>
              </div>
              <div className="stat-value">
                <span id="statRead">{readCount}</span> /{" "}
                <span id="statUnread">{unreadCount}</span>
              </div>
            </div>

            {/* Ratings */}
            <div className="stat-card clickable" id="statCardRatings">
              <h3>Ratings</h3>
              <div className="stat-value" id="statAvgRating">
                {avgRating !== null ? `${avgRating.toFixed(2)}/5` : "--"}
              </div>
              <div className="stat-sub">Average rating (read)</div>
              <div className="stat-list" id="statTopRated">
                {topRatedSeries.length ? (
                  <ul>
                    {topRatedSeries.map((s) => (
                      <li key={s.name}>
                        <strong>{s.name}</strong> —{" "}
                        {s.avg.toFixed(2)}/5 ({s.count} book
                        {s.count === 1 ? "" : "s"})
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="stat-sub">No rated reads yet</div>
                )}
              </div>
            </div>

            {/* Pages read / total */}
            <div className="stat-card clickable" id="statCardPages">
              <h3>Page Count Read / Total</h3>
              <div className="stat-value">
                <span id="statPagesRead">{readPages}</span> /{" "}
                <span id="statPagesTotal">{totalPages}</span>
              </div>
              <div className="stat-sub" id="statPagesPct">
                {pagesPct}% read
              </div>
            </div>

            {/* Collection share: library vs wishlist */}
            <div className="stat-card">
              <h3>Library vs Wishlist</h3>
              <div
                className="pie"
                id="pieCollection"
                style={{ "--pct": libPct }}
                data-label={`${totalLib} in library / ${wishCount} in wishlist (${libPct}% library)`}
              >
                <div className="pie-label" id="statCollectionPct">
                  {libPct}%
                </div>
              </div>
              <div className="stat-value" id="statCollectionValue">
                <span id="statLibShare">{totalLib}</span> /{" "}
                <span id="statWishShare">{wishCount}</span>
              </div>
              <div className="stat-sub">Library / Wishlist volumes</div>
            </div>

            {/* Collection value */}
            <div className="stat-card clickable" id="statCardCollection">
              <h3>Collection Value</h3>
              <div className="stat-value">
                <span id="statCollectionMsrp">
                  MSRP {fmtCurrency(totalMsrp)}
                </span>
              </div>
              <div className="stat-sub">
                Paid: <span id="statCollectionPaid">{fmtCurrency(totalPaid)}</span>{" "}
                · Collectible:{" "}
                <span id="statCollectionCollectible">
                  {fmtCurrency(totalCollectible)}
                </span>
              </div>
              <div className="stat-sub" id="statCollectionPaidPct">
                {pctOff === null
                  ? "(--% off)"
                  : pctOff >= 0
                  ? `(${pctOff.toFixed(1)}% off)`
                  : `(${Math.abs(pctOff).toFixed(1)}% over)`}
              </div>
            </div>

            {/* Top demographics */}
            <div className="stat-card clickable">
              <h3>Top Demographics</h3>
              {renderTopList(topDemographics)}
            </div>

            {/* Top publishers */}
            <div className="stat-card clickable">
              <h3>Top Publishers</h3>
              {renderTopList(topPublishers)}
            </div>

            {/* Top genres */}
            <div className="stat-card clickable">
              <h3>Top Genres</h3>
              {renderTopList(topGenres)}
            </div>

            {/* Current year reads */}
            <div className="stat-card">
              <h3 id="statCurrentYearTitle">
                Current Reads {currentYear}
              </h3>
              <div className="stat-value" id="statCurrentYearValue">
                {readThisYear}
              </div>
              <div className="stat-sub" id="statCurrentYearSub">
                {readThisYear ? "Year-to-date" : "No reads yet"}
              </div>
            </div>

            {/* Avg time from purchase to read */}
            <div className="stat-card">
              <h3>Avg Time From Purchase to Read</h3>
              <div className="stat-value" id="statAvgReadTime">
                {avgReadDays !== null ? `${avgReadDays.toFixed(1)} days` : "--"}
              </div>
              <div className="stat-sub" id="statAvgReadTimeSub">
                {avgReadDays !== null
                  ? "Based on books with purchase + read dates"
                  : "Need purchase + read dates"}
              </div>
            </div>

            {/* Next wishlist release */}
            <div className="stat-card">
              <h3>Next Wishlist Release</h3>
              <div className="stat-value" id="statNextRelease">
                {nextReleaseTitle}
              </div>
              <div className="stat-sub">
                <span id="statNextReleaseDate">{nextReleaseDateText}</span>
              </div>
              <div className="stat-sub">
                <span id="statNextCountdown">{nextCountdownText}</span>
              </div>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
