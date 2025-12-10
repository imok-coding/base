// src/pages/Dashboard.jsx
import React, { useEffect, useMemo, useState } from "react";
import "../styles/dashboard.css";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { useAuth } from "../contexts/AuthContext";

/* ---------- Helpers ---------- */

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value && typeof value.toDate === "function") return value.toDate();
  const str = String(value).trim();
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

// Treat all volumes of a series as one "series key"
function getSeriesKey(doc) {
  const raw =
    (doc.seriesKey ||
      doc.series ||
      doc.Series ||
      doc.title ||
      doc.Title ||
      "").trim();
  if (!raw) return "";
  return raw
    .replace(/\bvolume\s+\d+.*$/i, "")
    .replace(/\bvol\.?\s+\d+.*$/i, "")
    .trim()
    .toLowerCase();
}

// Build series-level map: all stats aggregated per series
function buildSeriesMap(library) {
  const map = new Map();
  for (const item of library) {
    const key = getSeriesKey(item) || item.id;
    if (!map.has(key)) {
      const baseTitle =
        (item.series ||
          item.Series ||
          item.title ||
          item.Title ||
          "Unknown Series").trim();
      map.set(key, {
        key,
        title: baseTitle,
        publisher: item.publisher || item.Publisher || "",
        genre: item.genre || item.Genre || "",
        demographic: item.demographic || item.Demographic || "",
        volumes: 0,
        totalPages: 0,
        readPages: 0,
        readVolumes: 0,
        ratingSum: 0,
        ratingCount: 0,
      });
    }
    const group = map.get(key);
    group.volumes += 1;

    const pages = Number(item.pages || item.Pages || item.pageCount || 0) || 0;
    group.totalPages += pages;

    const readFlag = !!item.read || item.status === "Read" || item.Read === true;
    if (readFlag) {
      group.readVolumes += 1;
      group.readPages += pages;
    }

    const ratingNum = Number(item.rating || item.Rating);
    if (!isNaN(ratingNum) && ratingNum > 0) {
      group.ratingSum += ratingNum;
      group.ratingCount += 1;
    }
  }
  return map;
}

// Top lists based on *series count*, never volume count
function buildTopFromSeries(seriesMap, field, limit = 5) {
  const counts = new Map();
  for (const s of seriesMap.values()) {
    const raw = (s[field] || "").trim();
    if (!raw) continue;
    // in case multiple tags like "Shounen / Action"
    const parts = raw
      .split(/[\/,]/)
      .map((p) => p.trim())
      .filter(Boolean);
    for (const p of parts) {
      counts.set(p, (counts.get(p) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

// Reading trend: volumes read per month (last 12 months)
function buildReadingTrend(library) {
  const now = new Date();
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = d.toLocaleString("default", { month: "short" });
    months.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label,
      year: d.getFullYear(),
      month: d.getMonth(),
      value: 0,
    });
  }

  for (const item of library) {
    const dateRead = parseDate(item.dateRead || item.DateRead);
    if (!dateRead) continue;
    const key = `${dateRead.getFullYear()}-${dateRead.getMonth()}`;
    const idx = months.findIndex((m) => m.key === key);
    if (idx !== -1) {
      months[idx].value += 1;
    }
  }

  return months;
}

// Top series by volume count for bar chart
function buildTopSeriesBars(seriesMap, limit = 8) {
  const arr = [...seriesMap.values()];
  arr.sort((a, b) => b.volumes - a.volumes);
  const top = arr.slice(0, limit);
  const max = top.reduce((m, s) => Math.max(m, s.volumes), 0) || 1;
  return top.map((s) => ({
    label: s.title,
    value: s.volumes,
    pct: s.volumes / max,
  }));
}

// Wishlist releases: array of { date, title }
function buildWishlistReleases(wishlist) {
  const releases = [];
  for (const item of wishlist) {
    const date =
      parseDate(item.releaseDate || item.ReleaseDate || item.date || item.Date) ||
      null;
    if (!date) continue;
    const title =
      (item.title || item.series || item.Title || "Unknown Title").trim();
    releases.push({ date, title });
  }
  releases.sort((a, b) => a.date - b.date);
  return releases;
}

function getNextRelease(releases) {
  const now = new Date();
  for (const r of releases) {
    if (r.date >= now) return r;
  }
  return releases[releases.length - 1] || null;
}

function computeAvgPurchaseToRead(library) {
  let totalDays = 0;
  let count = 0;
  for (const item of library) {
    const dp = parseDate(item.datePurchased || item.DatePurchased);
    const dr = parseDate(item.dateRead || item.DateRead);
    if (!dp || !dr) continue;
    const diff = dr - dp;
    if (diff <= 0) continue;
    totalDays += diff / (1000 * 60 * 60 * 24);
    count += 1;
  }
  if (!count) return null;
  return totalDays / count;
}

function computeCollectionValue(library) {
  let msrpTotal = 0;
  let paidTotal = 0;
  for (const item of library) {
    const msrp = Number(item.msrp || item.MSRP || 0) || 0;
    const paid =
      Number(item.amountPaid || item.AmountPaid || item.pricePaid || 0) ||
      msrp ||
      0;
    msrpTotal += msrp;
    paidTotal += paid;
  }
  return { msrpTotal, paidTotal };
}

function computePages(library) {
  let total = 0;
  let read = 0;
  for (const item of library) {
    const pages =
      Number(item.pages || item.Pages || item.pageCount || 0) || 0;
    total += pages;
    const isRead = !!item.read || item.status === "Read" || item.Read === true;
    if (isRead) read += pages;
  }
  return { total, read };
}

function computeAverageRating(seriesMap) {
  let sum = 0;
  let count = 0;
  for (const s of seriesMap.values()) {
    if (s.ratingCount > 0) {
      sum += s.ratingSum / s.ratingCount;
      count += 1;
    }
  }
  if (!count) return null;
  return sum / count;
}

/* ---------- Small chart components (SVG + CSS) ---------- */

function LineChart({ data }) {
  if (!data || !data.length) {
    return <div className="line-chart empty">No reading data yet.</div>;
  }

  const max = data.reduce((m, p) => Math.max(m, p.value), 0) || 1;
  const width = 100;
  const height = 100;
  const stepX = width / Math.max(data.length - 1, 1);

  const points = data.map((p, idx) => {
    const x = idx * stepX;
    const y = height - (p.value / max) * 80 - 10;
    return { ...p, x, y };
  });

  const pathD = points
    .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
    .join(" ");

  return (
    <div className="line-chart">
      <svg viewBox="0 0 100 100">
        {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
          const y = 90 - t * 80;
          return (
            <line
              key={i}
              className="line-grid"
              x1="0"
              x2="100"
              y1={y}
              y2={y}
            />
          );
        })}

        <path className="line-path" d={pathD} />

        {points.map((p, i) => (
          <g key={i}>
            <circle className="line-point" cx={p.x} cy={p.y} r="1.5" />
            <text className="line-value" x={p.x} y={p.y - 3}>
              {p.value}
            </text>
            <text className="line-label" x={p.x} y="96">
              {p.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function BarChart({ data }) {
  if (!data || !data.length) {
    return <div className="bar-chart empty">Not enough data yet.</div>;
  }

  return (
    <div className="bar-chart">
      {data.map((bar, i) => (
        <div className="bar" key={i}>
          <div
            className="bar-fill"
            style={{ height: `${Math.max(bar.pct * 100, 6)}%` }}
          />
          <div className="bar-value">{bar.value}</div>
          <div className="bar-label">
            {bar.label.length > 12 ? bar.label.slice(0, 11) + "…" : bar.label}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- Calendar helpers ---------- */

function buildCalendarGrid(monthDate, releases) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startDay = firstOfMonth.getDay(); // 0-6
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const byDay = new Map();
  for (const r of releases) {
    const d = r.date;
    if (
      d.getFullYear() === year &&
      d.getMonth() === month
    ) {
      const day = d.getDate();
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(r);
    }
  }

  const cells = [];
  for (let i = 0; i < startDay; i++) {
    cells.push({ type: "pad" });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      type: "day",
      day: d,
      releases: byDay.get(d) || [],
    });
  }
  return cells;
}

/* ---------- Main component ---------- */

export default function Dashboard() {
  const { user, admin } = useAuth();
  const [library, setLibrary] = useState([]);
  const [wishlist, setWishlist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());

  const [detailModal, setDetailModal] = useState({
    open: false,
    type: null,
  });

  // Auth gate
  if (!user || !admin) {
    return (
      <div className="page dashboard-page">
        <div className="dashboard-locked">
          <h1>Dashboard</h1>
          <p>This area is restricted to admin accounts.</p>
        </div>
      </div>
    );
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const [libSnap, wishSnap] = await Promise.all([
          getDocs(collection(db, "library")),
          getDocs(collection(db, "wishlist")),
        ]);
        if (cancelled) return;
        setLibrary(libSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setWishlist(wishSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setErr(null);
      } catch (e) {
        console.error(e);
        if (!cancelled) setErr("Failed to load dashboard data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => {
    if (!library.length && !wishlist.length) return null;

    const totalLibrary = library.length;
    const readCount = library.filter(
      (i) => !!i.read || i.status === "Read" || i.Read === true
    ).length;
    const unreadCount = totalLibrary - readCount;

    const wishlistCount = wishlist.length;

    const seriesMap = buildSeriesMap(library);
    const readingTrend = buildReadingTrend(library);
    const topSeriesBars = buildTopSeriesBars(seriesMap);
    const releases = buildWishlistReleases(wishlist);
    const nextRelease = getNextRelease(releases);

    const avgDays = computeAvgPurchaseToRead(library);
    const collectionValue = computeCollectionValue(library);
    const pages = computePages(library);
    const avgRating = computeAverageRating(seriesMap);

    const topPublishers = buildTopFromSeries(seriesMap, "publisher", 5);
    const topGenres = buildTopFromSeries(seriesMap, "genre", 5);
    const topDemographics = buildTopFromSeries(seriesMap, "demographic", 5);

    return {
      totalLibrary,
      readCount,
      unreadCount,
      wishlistCount,
      seriesMap,
      readingTrend,
      topSeriesBars,
      releases,
      nextRelease,
      avgDays,
      collectionValue,
      pages,
      avgRating,
      topPublishers,
      topGenres,
      topDemographics,
    };
  }, [library, wishlist]);

  if (loading || !stats) {
    return (
      <div className="page dashboard-page">
        <div className="dashboard-loading">
          <h1>Dashboard</h1>
          {err ? <p className="error">{err}</p> : <p>Loading stats…</p>}
        </div>
      </div>
    );
  }

  const {
    totalLibrary,
    readCount,
    unreadCount,
    wishlistCount,
    seriesMap,
    readingTrend,
    topSeriesBars,
    releases,
    nextRelease,
    avgDays,
    collectionValue,
    pages,
    avgRating,
    topPublishers,
    topGenres,
    topDemographics,
  } = stats;

  const now = new Date();
  const nextDate = nextRelease ? nextRelease.date : null;

  let countdownText = "—";
  if (nextDate) {
    const diffMs = nextDate - now;
    const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
    if (days < 0) {
      countdownText = `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`;
    } else if (days === 0) {
      countdownText = "Today";
    } else {
      countdownText = `In ${days} day${days === 1 ? "" : "s"}`;
    }
  }

  function openCalendar() {
    if (nextDate) {
      setCalendarMonth(
        new Date(nextDate.getFullYear(), nextDate.getMonth(), 1)
      );
    } else if (releases.length) {
      const first = releases[0].date;
      setCalendarMonth(
        new Date(first.getFullYear(), first.getMonth(), 1)
      );
    }
    setCalendarOpen(true);
  }

  function openDetail(type) {
    setDetailModal({ open: true, type });
  }

  function closeDetail() {
    setDetailModal({ open: false, type: null });
  }

  const calendarCells = buildCalendarGrid(calendarMonth, releases);

  // ---------- Detail modal body ----------
  function renderDetailBody() {
    const t = detailModal.type;
    if (!t) return null;

    if (t === "publishers") {
      const rows = [...buildTopFromSeries(seriesMap, "publisher", 100)];
      return (
        <>
          <h3>Top Publishers by Series</h3>
          {rows.length === 0 ? (
            <p>No publisher data yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Publisher</th>
                  <th>Series Count</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.name + i}>
                    <td>{i + 1}</td>
                    <td>{r.name}</td>
                    <td>{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      );
    }

    if (t === "genres") {
      const rows = [...buildTopFromSeries(seriesMap, "genre", 100)];
      return (
        <>
          <h3>Top Genres by Series</h3>
          {rows.length === 0 ? (
            <p>No genre data yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Genre</th>
                  <th>Series Count</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.name + i}>
                    <td>{i + 1}</td>
                    <td>{r.name}</td>
                    <td>{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      );
    }

    if (t === "demographics") {
      const rows = [...buildTopFromSeries(seriesMap, "demographic", 100)];
      return (
        <>
          <h3>Top Demographics by Series</h3>
          {rows.length === 0 ? (
            <p>No demographic data yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Demographic</th>
                  <th>Series Count</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.name + i}>
                    <td>{i + 1}</td>
                    <td>{r.name}</td>
                    <td>{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      );
    }

    if (t === "timeToRead") {
      return (
        <>
          <h3>Average Time From Purchase to Read</h3>
          {avgDays == null ? (
            <p>
              Not enough volumes have both purchase and read dates to calculate
              this yet.
            </p>
          ) : (
            <p>
              On average, it takes{" "}
              <strong>{avgDays.toFixed(1)} days</strong> from purchase to
              finishing a volume.
            </p>
          )}
        </>
      );
    }

    if (t === "collectionValue") {
      const { msrpTotal, paidTotal } = collectionValue;
      const diff = msrpTotal - paidTotal;
      const pct =
        msrpTotal > 0 ? ((paidTotal / msrpTotal) * 100).toFixed(1) : "—";
      return (
        <>
          <h3>Collection Value Breakdown</h3>
          <table>
            <tbody>
              <tr>
                <th>Total MSRP</th>
                <td>${msrpTotal.toFixed(2)}</td>
              </tr>
              <tr>
                <th>Total Paid</th>
                <td>${paidTotal.toFixed(2)}</td>
              </tr>
              <tr>
                <th>Difference</th>
                <td>${diff.toFixed(2)}</td>
              </tr>
              <tr>
                <th>Paid vs MSRP</th>
                <td>{pct === "—" ? "—" : `${pct}%`}</td>
              </tr>
            </tbody>
          </table>
        </>
      );
    }

    if (t === "pages") {
      return (
        <>
          <h3>Pages Read vs Total</h3>
          <table>
            <tbody>
              <tr>
                <th>Total Pages</th>
                <td>{pages.total.toLocaleString()}</td>
              </tr>
              <tr>
                <th>Pages Read</th>
                <td>{pages.read.toLocaleString()}</td>
              </tr>
              <tr>
                <th>Completion</th>
                <td>
                  {pages.total
                    ? `${((pages.read / pages.total) * 100).toFixed(1)}%`
                    : "—"}
                </td>
              </tr>
            </tbody>
          </table>
        </>
      );
    }

    if (t === "ratings") {
      return (
        <>
          <h3>Ratings Overview</h3>
          {avgRating == null ? (
            <p>No ratings have been recorded yet.</p>
          ) : (
            <p>
              Average series rating across rated series is{" "}
              <strong>{avgRating.toFixed(2)}</strong>.
            </p>
          )}
        </>
      );
    }

    if (t === "releases") {
      return (
        <>
          <h3>Wishlist Releases</h3>
          {releases.length === 0 ? (
            <p>No wishlist releases found.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Title</th>
                </tr>
              </thead>
              <tbody>
                {releases.map((r, i) => (
                  <tr key={i}>
                    <td>
                      {r.date.toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td>{r.title}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      );
    }

    return null;
  }

  /* ---------- Render ---------- */

  return (
    <div className="page dashboard-page">
      <header className="dashboard-header">
        <div>
          <h1>Dashboard</h1>
          <p className="dashboard-sub">
            Admin-only analytics for your manga library and wishlist.
          </p>
        </div>
      </header>

      <section id="dashboardSection" className="page-section active">
        <div className="dashboard-grid">
          {/* Row 1: mini stat cards */}
          <div className="stat-card mini">
            <h3>Total Library</h3>
            <div className="stat-value">{totalLibrary}</div>
            <div className="stat-sub">
              Volumes in your Firestore library.
            </div>
          </div>

          <div className="stat-card mini">
            <h3>Read</h3>
            <div className="stat-value">
              {readCount} / {totalLibrary}
            </div>
            <div className="stat-sub">
              {totalLibrary
                ? `${((readCount / totalLibrary) * 100).toFixed(1)}% complete`
                : "—"}
            </div>
          </div>

          <div className="stat-card mini">
            <h3>Unread</h3>
            <div className="stat-value">{unreadCount}</div>
            <div className="stat-sub">Volumes waiting to be read.</div>
          </div>

          <div
            className="stat-card mini clickable"
            onClick={() => {
              openCalendar();
              openDetail("releases");
            }}
          >
            <h3>Next Wishlist Release</h3>
            <div className="stat-value next-release">
              {nextRelease ? nextRelease.title : "No upcoming releases"}
            </div>
            <div className="stat-sub">
              {nextDate
                ? nextDate.toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })
                : "—"}
              <br />
              <span id="statNextCountdown">{countdownText}</span>
            </div>
          </div>

          {/* Row 2: big line chart */}
          <div className="stat-card wide">
            <h3>Reading Trend (Last 12 Months)</h3>
            <LineChart data={readingTrend} />
          </div>

          {/* Row 3: big bar chart */}
          <div className="stat-card wide">
            <h3>Top Series by Volume Count</h3>
            <BarChart data={topSeriesBars} />
          </div>

          {/* Row 4: three tall cards */}
          <div
            className="stat-card tall clickable"
            onClick={() => openDetail("genres")}
          >
            <h3>Top Genres (by Series)</h3>
            <div className="stat-list">
              {topGenres.length ? (
                topGenres.map((g, i) => (
                  <div className="stat-list-row" key={g.name}>
                    <span className="stat-rank">{i + 1}</span>
                    <span className="stat-name">{g.name}</span>
                    <span className="stat-count">{g.count}</span>
                  </div>
                ))
              ) : (
                <div className="stat-sub">No genre data yet.</div>
              )}
            </div>
          </div>

          <div
            className="stat-card tall clickable"
            onClick={() => openDetail("publishers")}
          >
            <h3>Top Publishers (by Series)</h3>
            <div className="stat-list">
              {topPublishers.length ? (
                topPublishers.map((p, i) => (
                  <div className="stat-list-row" key={p.name}>
                    <span className="stat-rank">{i + 1}</span>
                    <span className="stat-name">{p.name}</span>
                    <span className="stat-count">{p.count}</span>
                  </div>
                ))
              ) : (
                <div className="stat-sub">No publisher data yet.</div>
              )}
            </div>
          </div>

          <div
            className="stat-card tall clickable"
            onClick={() => openDetail("demographics")}
          >
            <h3>Top Demographics (by Series)</h3>
            <div className="stat-list">
              {topDemographics.length ? (
                topDemographics.map((d, i) => (
                  <div className="stat-list-row" key={d.name}>
                    <span className="stat-rank">{i + 1}</span>
                    <span className="stat-name">{d.name}</span>
                    <span className="stat-count">{d.count}</span>
                  </div>
                ))
              ) : (
                <div className="stat-sub">No demographic data yet.</div>
              )}
            </div>
          </div>

          {/* Row 5: time, value, pages, ratings */}

          <div
            className="stat-card clickable"
            onClick={() => openDetail("timeToRead")}
          >
            <h3>Avg Time to Read</h3>
            <div className="stat-value">
              {avgDays == null ? "—" : `${avgDays.toFixed(1)} days`}
            </div>
            <div className="stat-sub">
              Based on purchase + read dates.
            </div>
          </div>

          <div
            className="stat-card clickable"
            onClick={() => openDetail("collectionValue")}
          >
            <h3>Collection Value</h3>
            <div className="stat-value stat-msrp">
              ${collectionValue.msrpTotal.toFixed(2)}
            </div>
            <div className="stat-sub">
              Paid: ${collectionValue.paidTotal.toFixed(2)}
            </div>
          </div>

          <div
            className="stat-card clickable"
            onClick={() => openDetail("pages")}
          >
            <h3>Pages Read / Total</h3>
            <div className="stat-value">
              {pages.read.toLocaleString()} /{" "}
              {pages.total.toLocaleString()}
            </div>
            <div className="stat-sub">
              {pages.total
                ? `${((pages.read / pages.total) * 100).toFixed(1)}%`
                : "—"}
            </div>
          </div>

          <div
            className="stat-card clickable"
            onClick={() => openDetail("ratings")}
          >
            <h3>Average Rating</h3>
            <div className="stat-value">
              {avgRating == null ? "—" : avgRating.toFixed(2)}
            </div>
            <div className="stat-sub">
              Averaged across rated series.
            </div>
          </div>
        </div>
      </section>

      {/* Calendar Overlay */}
      {calendarOpen && (
        <div
          id="calendarOverlay"
          onClick={() => setCalendarOpen(false)}
        >
          <div
            id="calendarCard"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="calendar-header">
              <div className="calendar-title">
                {calendarMonth.toLocaleString(undefined, {
                  month: "long",
                  year: "numeric",
                })}
              </div>
              <div className="calendar-nav">
                <button
                  className="calendar-nav-btn"
                  onClick={() =>
                    setCalendarMonth(
                      new Date(
                        calendarMonth.getFullYear(),
                        calendarMonth.getMonth() - 1,
                        1
                      )
                    )
                  }
                >
                  ‹
                </button>
                <button
                  className="calendar-nav-btn"
                  onClick={() =>
                    setCalendarMonth(
                      new Date(
                        calendarMonth.getFullYear(),
                        calendarMonth.getMonth() + 1,
                        1
                      )
                    )
                  }
                >
                  ›
                </button>
              </div>
            </div>

            <div className="calendar-weekdays">
              <div>Sun</div>
              <div>Mon</div>
              <div>Tue</div>
              <div>Wed</div>
              <div>Thu</div>
              <div>Fri</div>
              <div>Sat</div>
            </div>

            <div className="calendar-grid" id="releaseCalendar">
              {calendarCells.map((cell, idx) =>
                cell.type === "pad" ? (
                  <div key={idx} className="calendar-day pad" />
                ) : (
                  <div key={idx} className="calendar-day">
                    <div className="day-num">{cell.day}</div>
                    <div className="calendar-releases">
                      {cell.releases.slice(0, 2).map((r, i) => (
                        <div
                          className="calendar-release"
                          key={i}
                          title={r.title}
                        >
                          {r.title}
                        </div>
                      ))}
                      {cell.releases.length > 2 && (
                        <button className="calendar-more-btn">
                          +{cell.releases.length - 2} more
                        </button>
                      )}
                    </div>
                  </div>
                )
              )}
            </div>

            {!releases.length && (
              <div className="calendar-empty">
                No wishlist releases found.
              </div>
            )}

            <button
              id="calendarClose"
              onClick={() => setCalendarOpen(false)}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailModal.open && (
        <div id="statDetailOverlay" onClick={closeDetail}>
          <div
            id="statDetailCard"
            onClick={(e) => e.stopPropagation()}
          >
            <button id="statDetailClose" onClick={closeDetail}>
              ✕
            </button>
            <h2 id="statDetailTitle">
              {detailModal.type === "publishers" && "Top Publishers"}
              {detailModal.type === "genres" && "Top Genres"}
              {detailModal.type === "demographics" &&
                "Top Demographics"}
              {detailModal.type === "timeToRead" &&
                "Avg Time From Purchase to Read"}
              {detailModal.type === "collectionValue" &&
                "Collection Value"}
              {detailModal.type === "pages" &&
                "Pages Read vs Total"}
              {detailModal.type === "ratings" && "Ratings"}
              {detailModal.type === "releases" && "Wishlist Releases"}
            </h2>
            <div id="statDetailBody">{renderDetailBody()}</div>
          </div>
        </div>
      )}
    </div>
  );
}
