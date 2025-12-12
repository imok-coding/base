// src/pages/Dashboard.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import "../styles/dashboard.css";
import { collection, doc, getDocs, getDoc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { useAuth } from "../contexts/AuthContext";

const DEFAULT_YEARLY_WEBHOOK =
  "https://discord.com/api/webhooks/1448287168845054004/cGWGPoH5LaTFlBZ1vxtgMjOfV9au6qyQ_9ZRnOWN9-AX0MNfwxKNWVcZYQHz0ESA7_4k";
const DEFAULT_RELEASE_WEBHOOK =
  "https://discord.com/api/webhooks/1448288240871276616/101WI-B2p8tDR34Hl9fZxxb0QG01f1Eo5w1IvbttlQmP2wWFNJ0OI7UnJfJujKRNWW2Q";
const DEFAULT_ACTIVITY_WEBHOOK =
  "https://discord.com/api/webhooks/1448329790942613667/wsC8psNZ-Ax2D1O9Gl4sJi6ay7df2cr7IrIdxMPwGZTBnkSUIY2NDpeVd98qW_4plz82";

/* ---------- Helpers ---------- */

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value && typeof value.toDate === "function") return value.toDate();
  const str = String(value).trim();
  if (!str) return null;
  // Handle common string formats explicitly to avoid timezone/locale drift
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return new Date(Number(y), Number(m) - 1, Number(d));
  }
  const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    let [, m, d, y] = slashMatch;
    const year = y.length === 2 ? Number(`20${y}`) : Number(y);
    return new Date(year, Number(m) - 1, Number(d));
  }
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

// Reads per month for a specific year
function buildMonthlyReads(library, year) {
  const months = Array.from({ length: 12 }, (_, idx) => {
    const d = new Date(year, idx, 1);
    return {
      key: `${year}-${idx}`,
      label: d.toLocaleString("default", { month: "short" }),
      year,
      month: idx,
      value: 0,
    };
  });

  for (const item of library) {
    const dateRead = parseDate(item.dateRead || item.DateRead);
    if (!dateRead || dateRead.getFullYear() !== year) continue;
    months[dateRead.getMonth()].value += 1;
  }

  return months;
}

function formatDateKey(date) {
  const yr = date.getFullYear();
  const mo = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${yr}-${mo}-${day}`;
}

async function postWebhook(url, content) {
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  } catch (err) {
    console.error("Webhook post failed", err);
  }
}

function buildWeekdayBreakdown(library) {
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const counts = Array(7).fill(0);

  for (const item of library) {
    const dateRead = parseDate(item.dateRead || item.DateRead);
    if (!dateRead) continue;
    counts[dateRead.getDay()] += 1;
  }

  const hasReads = counts.some((v) => v > 0);
  if (!hasReads) return [];

  const max = counts.reduce((m, v) => Math.max(m, v), 0) || 1;
  return labels.map((label, idx) => ({
    label,
    value: counts[idx],
    pct: counts[idx] / max,
  }));
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

function computePurchaseToReadSeries(library) {
  const map = new Map();
  for (const item of library) {
    const dp = parseDate(item.datePurchased || item.DatePurchased);
    const dr = parseDate(item.dateRead || item.DateRead);
    if (!dp || !dr) continue;
    const diff = dr - dp;
    if (diff <= 0) continue;
    const days = diff / (1000 * 60 * 60 * 24);
    const key = getSeriesKey(item) || item.id;
    if (!map.has(key)) {
      map.set(key, {
        key,
        title:
          item.series ||
          item.Series ||
          item.title ||
          item.Title ||
          "Untitled",
        total: 0,
        count: 0,
        min: days,
        max: days,
      });
    }
    const row = map.get(key);
    row.total += days;
    row.count += 1;
    row.min = Math.min(row.min, days);
    row.max = Math.max(row.max, days);
  }
  return [...map.values()]
    .filter((r) => r.count > 0)
    .map((r) => ({ ...r, avg: r.total / r.count }))
    .sort((a, b) => b.avg - a.avg);
}

function computeCollectionValue(library) {
  let msrpTotal = 0;
  let paidTotal = 0;
  let collectibleTotal = 0;
  for (const item of library) {
    const msrp = Number(item.msrp || item.MSRP || 0) || 0;
    const paid =
      Number(item.amountPaid || item.AmountPaid || item.pricePaid || 0) ||
      msrp ||
      0;
    const collectible =
      Number(item.collectiblePrice || item.CollectiblePrice || 0) || 0;
    msrpTotal += msrp;
    paidTotal += paid;
    collectibleTotal += collectible;
  }
  return { msrpTotal, paidTotal, collectibleTotal };
}

function aggregateBySeries(library) {
  const map = new Map();
  for (const item of library) {
    const key = getSeriesKey(item) || item.id;
    if (!map.has(key)) {
      map.set(key, {
        key,
        title:
          item.series ||
          item.Series ||
          item.title ||
          item.Title ||
          "Untitled",
        msrp: 0,
        paid: 0,
        collectible: 0,
        books: 0,
        pages: 0,
        readPages: 0,
        ratings: [],
      });
    }
    const row = map.get(key);
    row.books += 1;
    const msrp = Number(item.msrp || item.MSRP || 0) || 0;
    const paid =
      Number(item.amountPaid || item.AmountPaid || item.pricePaid || 0) || 0;
    const collectible =
      Number(item.collectiblePrice || item.CollectiblePrice || 0) || 0;
    const pages =
      Number(item.pages || item.Pages || item.pageCount || 0) || 0;
    const isRead = !!item.read || item.status === "Read" || item.Read === true;
    row.msrp += msrp;
    row.paid += paid;
    row.collectible += collectible;
    row.pages += pages;
    if (isRead) row.readPages += pages;
    const ratingNum = Number(item.rating || item.Rating);
    if (!isNaN(ratingNum) && ratingNum > 0) {
      row.ratings.push(ratingNum);
    }
  }
  return [...map.values()];
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
  const chartWidth = 480;
  const chartHeight = 230;
  const paddingY = 30;
  const usableHeight = chartHeight - paddingY * 2;
  const stepX = chartWidth / Math.max(data.length - 1, 1);

  const points = data.map((p, idx) => {
    const x = idx * stepX;
    const y = chartHeight - paddingY - (p.value / max) * usableHeight;
    return { ...p, x, y };
  });

  const pathD = points
    .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
    .join(" ");

  return (
    <div className="line-chart">
      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
          const y = chartHeight - paddingY - t * usableHeight;
          return (
            <line
              key={`h-${i}`}
              className="line-grid"
              x1="0"
              x2={chartWidth}
              y1={y}
              y2={y}
            />
          );
        })}
        {points.map((p, i) => (
          <line
            key={`v-${i}`}
            className="line-grid"
            x1={p.x}
            x2={p.x}
            y1={paddingY / 2}
            y2={chartHeight - paddingY / 2}
          />
        ))}

        <path className="line-path" d={pathD} />

        {points.map((p, i) => (
          <g key={i}>
            <circle className="line-point" cx={p.x} cy={p.y} r="1.5" />
            <text className="line-value" x={p.x} y={p.y - 3}>
              {p.value}
            </text>
            <text className="line-label" x={p.x} y={chartHeight - 4}>
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
            {bar.label.length > 12 ? bar.label.slice(0, 11) + "..." : bar.label}
          </div>
        </div>
      ))}
    </div>
  );
}

function WeekdayBreakdown({ data }) {
  if (!data || !data.length) {
    return <div className="weekday-breakdown empty">No reads recorded yet.</div>;
  }

  return (
    <div className="weekday-bars">
      {data.map((row) => (
        <div className="weekday-col" key={row.label}>
          <div className="weekday-count">{row.value}</div>
          <div className="weekday-bar-vert">
            <div
              className="weekday-bar-vert-fill"
              style={{ height: `${Math.max(row.pct * 100, row.value ? 6 : 0)}%` }}
            />
          </div>
          <div className="weekday-label">{row.label}</div>
        </div>
      ))}
    </div>
  );
}

/* ---------- Calendar helpers ---------- */

function buildCalendarGrid(monthDate, releases, todayKey) {
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
    const dateKey = formatDateKey(new Date(year, month, d));
    cells.push({
      type: "day",
      day: d,
      releases: byDay.get(d) || [],
      dateKey,
      isToday: dateKey === todayKey,
    });
  }
  const totalCells = Math.ceil(cells.length / 7) * 7;
  while (cells.length < totalCells) {
    cells.push({ type: "pad" });
  }
  return cells;
}

/* ---------- Main component ---------- */

export default function Dashboard() {
  const { user, admin, loading: authLoading } = useAuth();
  const [library, setLibrary] = useState([]);
  const [wishlist, setWishlist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [countdownText, setCountdownText] = useState("-");
  const [webhooks, setWebhooks] = useState({
    yearly: DEFAULT_YEARLY_WEBHOOK,
    release: DEFAULT_RELEASE_WEBHOOK,
    activity: DEFAULT_ACTIVITY_WEBHOOK,
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [adminUidInput, setAdminUidInput] = useState("");
  const [adminsList, setAdminsList] = useState([]);
  const [adminsLoading, setAdminsLoading] = useState(false);
  const [calendarExpandedDay, setCalendarExpandedDay] = useState(null);
  const refreshAdmins = async () => {
    if (!admin) return;
    try {
      setAdminsLoading(true);
      const snap = await getDocs(collection(db, "admins"));
      const rows = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
      setAdminsList(rows);
    } catch (e) {
      console.error("Failed to refresh admins", e);
    } finally {
      setAdminsLoading(false);
    }
  };

  const handleGrantAdmin = async () => {
    const uid = adminUidInput.trim();
    if (!uid) {
      alert("Enter a UID to grant admin.");
      return;
    }
    try {
      await setDoc(
        doc(db, "admins", uid),
        {
          uid,
          role: "admin",
          grantedBy: user?.uid || "manual",
          grantedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      // legacy fallback for any rules that still read roles/<uid>
      try {
        await setDoc(
          doc(db, "roles", uid),
          { admin: true, updatedAt: new Date().toISOString() },
          { merge: true }
        );
      } catch (fallbackErr) {
        console.warn("Legacy roles write skipped (no permission):", fallbackErr?.message);
      }
      setAdminUidInput("");
      await refreshAdmins();
    } catch (e) {
      console.error("Grant admin failed", e);
      alert("Failed to grant admin.");
    }
  };

  const handleRevokeAdmin = async (uidOverride) => {
    const target = (uidOverride || adminUidInput).trim();
    if (!target) {
      alert("Enter a UID to revoke admin.");
      return;
    }
    try {
      await deleteDoc(doc(db, "admins", target));
      await deleteDoc(doc(db, "roles", target));
      if (!uidOverride) setAdminUidInput("");
      await refreshAdmins();
    } catch (e) {
      console.error("Revoke admin failed", e);
      alert("Failed to revoke admin.");
    }
  };

  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());

  const [detailModal, setDetailModal] = useState({
    open: false,
    type: null,
  });
  const currentYear = new Date().getFullYear();
  const yearlyPostedRef = useRef(null);
  const releasePostedRef = useRef(null);
  const activityPostedRef = useRef("");

  useEffect(() => {
    document.title = "Dashboard";
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    yearlyPostedRef.current = localStorage.getItem("dashboard-yearly-posted");
    releasePostedRef.current = localStorage.getItem("dashboard-release-posted");
    activityPostedRef.current = localStorage.getItem("dashboard-activity-posted") || "";
  }, []);

  // Load / bootstrap webhook settings
  useEffect(() => {
    if (!admin) return;
    const ref = doc(db, "settings", "webhooks");
    (async () => {
      try {
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data();
          setWebhooks({
            yearly: data.yearly || DEFAULT_YEARLY_WEBHOOK,
            release: data.release || DEFAULT_RELEASE_WEBHOOK,
            activity: data.activity || DEFAULT_ACTIVITY_WEBHOOK,
          });
        } else {
          await setDoc(ref, {
            yearly: DEFAULT_YEARLY_WEBHOOK,
            release: DEFAULT_RELEASE_WEBHOOK,
            activity: DEFAULT_ACTIVITY_WEBHOOK,
          });
        }
      } catch (e) {
        console.error("Failed to load webhook settings", e);
      }
    })();
  }, [admin]);

  // Load current admins for the admin settings modal
  useEffect(() => {
    if (!admin) return;
    let cancelled = false;
    (async () => {
      try {
        setAdminsLoading(true);
        const snap = await getDocs(collection(db, "admins"));
        if (cancelled) return;
        const rows = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
        setAdminsList(rows);
      } catch (e) {
        console.error("Failed to load admins", e);
      } finally {
        if (!cancelled) setAdminsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [admin]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!user || !admin) {
        setLibrary([]);
        setWishlist([]);
        setErr(null);
        setLoading(false);
        return;
      }
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
  }, [user, admin]);

  const stats = useMemo(() => {
    const totalLibrary = library.length;
    const readCount = library.filter(
      (i) => !!i.read || i.status === "Read" || i.Read === true
    ).length;
    const unreadCount = totalLibrary - readCount;
    const readPct = totalLibrary
      ? Math.round((readCount / totalLibrary) * 100)
      : 0;

    const wishlistCount = wishlist.length;

    const seriesMap = buildSeriesMap(library);
    const monthlyReads = buildMonthlyReads(library, currentYear);
    const prevYearReads = buildMonthlyReads(library, currentYear - 1);
    const currentYearReadsTotal = monthlyReads.reduce(
      (sum, m) => sum + m.value,
      0
    );
    const weekdayBreakdown = buildWeekdayBreakdown(library);
    const topSeriesBars = buildTopSeriesBars(seriesMap);
    const releases = buildWishlistReleases(wishlist);
    const nextRelease = getNextRelease(releases);

    const avgDays = computeAvgPurchaseToRead(library);
    const collectionValue = computeCollectionValue(library);
    const pages = computePages(library);
    const avgRating = computeAverageRating(seriesMap);
    const purchaseToReadSeries = computePurchaseToReadSeries(library);

    const topPublishers = buildTopFromSeries(seriesMap, "publisher", 5);
    const topGenres = buildTopFromSeries(seriesMap, "genre", 5);
    const topDemographics = buildTopFromSeries(seriesMap, "demographic", 5);
    const seriesAggregates = aggregateBySeries(library);
    const activity = [...library]
      .map((item) => {
        const date =
          parseDate(item.dateRead || item.DateRead) ||
          parseDate(item.datePurchased || item.DatePurchased);
        if (!date) return null;
        return {
          title:
            item.title ||
            item.Title ||
            item.series ||
            item.Series ||
            "Untitled",
          type: item.dateRead || item.DateRead ? "Read" : "Purchased",
          date,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.date - a.date)
      .slice(0, 12);

    return {
      totalLibrary,
      readCount,
      unreadCount,
      readPct,
      wishlistCount,
      seriesMap,
      monthlyReads,
      prevYearReads,
      currentYearReadsTotal,
      weekdayBreakdown,
      topSeriesBars,
      releases,
      nextRelease,
      avgDays,
      purchaseToReadSeries,
      collectionValue,
      pages,
      avgRating,
      topPublishers,
      topGenres,
      topDemographics,
      seriesAggregates,
      activity,
    };
  }, [library, wishlist, currentYear]);
  const {
    totalLibrary,
    readCount,
    unreadCount,
    readPct,
    wishlistCount,
    seriesMap,
    monthlyReads,
    prevYearReads,
    currentYearReadsTotal,
    weekdayBreakdown,
    topSeriesBars,
    releases,
    nextRelease,
    avgDays,
    purchaseToReadSeries,
    collectionValue,
    pages,
    avgRating,
    topPublishers,
    topGenres,
    topDemographics,
    seriesAggregates,
    activity,
  } = stats;

  const nextDate = nextRelease ? nextRelease.date : null;
  const hasError = Boolean(err);

  useEffect(() => {
    if (!prevYearReads || !prevYearReads.length) return;
    const prevYear = currentYear - 1;
    const prevTotal = prevYearReads.reduce((sum, m) => sum + m.value, 0);
    if (!prevTotal) return;
    const lastPosted = yearlyPostedRef.current
      ? parseInt(yearlyPostedRef.current, 10)
      : null;
    if (lastPosted === prevYear) return;

    const breakdown = prevYearReads
      .map((m) => `${m.label}: ${m.value}`)
      .join(", ");
    const content = `Yearly reads summary for ${prevYear}: ${prevTotal} total. Breakdown: ${breakdown}`;

    postWebhook(webhooks.yearly, content).then(() => {
      yearlyPostedRef.current = String(prevYear);
      if (typeof window !== "undefined") {
        localStorage.setItem("dashboard-yearly-posted", String(prevYear));
      }
    });
  }, [prevYearReads, currentYear]);

  useEffect(() => {
    if (!nextRelease || !releases.length) return;
    const releaseKey = formatDateKey(nextRelease.date);
    const todayKey = formatDateKey(new Date());
    if (releaseKey > todayKey) return;
    if (releasePostedRef.current === releaseKey) return;

    const todays = releases.filter(
      (r) => formatDateKey(r.date) === releaseKey
    );
    if (!todays.length) return;

    const content = `Wishlist releases for ${releaseKey}:\n${todays
      .map((r) => `- ${r.title}`)
      .join("\n")}`;

    postWebhook(webhooks.release, content).then(() => {
      releasePostedRef.current = releaseKey;
      if (typeof window !== "undefined") {
        localStorage.setItem("dashboard-release-posted", releaseKey);
      }
    });
  }, [nextRelease, releases]);

  useEffect(() => {
    if (!admin) return;
    if (!activity || !activity.length) return;
    const latest = activity[0];
    if (!latest || !latest.date) return;
    const key = `${latest.type}-${latest.title}-${latest.date.toISOString?.() || latest.date}`;
    if (activityPostedRef.current === key) return;
    activityPostedRef.current = key; // set immediately to avoid duplicate posts on rapid renders
    const content = `Activity: ${latest.type} — ${latest.title} (${latest.date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    })})`;
    postWebhook(webhooks.activity, content).then(() => {
      if (typeof window !== "undefined") {
        localStorage.setItem("dashboard-activity-posted", key);
      }
    });
  }, [activity, admin, webhooks]);

  useEffect(() => {
    if (!nextDate) {
      setCountdownText("-");
      return;
    }
    const update = () => {
      const diffMs = nextDate - new Date();
      if (diffMs <= 0) {
        setCountdownText("Released");
        return;
      }
      const totalSec = Math.floor(diffMs / 1000);
      const days = Math.floor(totalSec / 86400);
      const hours = Math.floor((totalSec % 86400) / 3600)
        .toString()
        .padStart(2, "0");
      const mins = Math.floor((totalSec % 3600) / 60)
        .toString()
        .padStart(2, "0");
      const secs = Math.floor(totalSec % 60)
        .toString()
        .padStart(2, "0");
      setCountdownText(`${days}d ${hours}:${mins}:${secs}`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [nextDate]);

  if (authLoading) {
    return (
      <div className="page dashboard-page">
        <div className="dashboard-loading">
          <h1>Dashboard</h1>
          <p>Checking permissions...</p>
        </div>
      </div>
    );
  }

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

  if (loading) {
    return (
      <div className="page dashboard-page">
        <div className="dashboard-loading">
          <h1>Dashboard</h1>
          {err ? <p className="error">{err}</p> : <p>Loading stats...</p>}
        </div>
      </div>
    );
  }

  const totalItems = totalLibrary + wishlistCount;
  const libSharePct = totalItems
    ? Math.round((totalLibrary / totalItems) * 100)
    : 0;
  const wishlistSharePct = totalItems ? 100 - libSharePct : 0;
  const topRated = [...seriesMap.values()]
    .filter((s) => s.ratingCount > 0)
    .map((s) => ({
      title: s.title,
      avg: s.ratingSum / s.ratingCount,
      count: s.ratingCount,
    }))
    .sort((a, b) => b.avg - a.avg || b.count - a.count)
    .slice(0, 3);

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

  const todayKey = formatDateKey(new Date());
  const calendarCells = buildCalendarGrid(calendarMonth, releases, todayKey);

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
      const rows = purchaseToReadSeries || [];
      return (
        <>
          <h3>Average Time From Purchase to Read</h3>
          {avgDays == null ? (
            <p>
              Not enough volumes have both purchase and read dates to calculate
              this yet.
            </p>
          ) : (
            <>
              <p>
                On average, it takes{" "}
                <strong>{avgDays.toFixed(1)} days</strong> from purchase to
                finishing a volume.
              </p>
              {rows.length > 0 ? (
                <table>
                  <thead>
                    <tr>
                      <th>Series</th>
                      <th>Avg Days</th>
                      <th>Longest</th>
                      <th>Shortest</th>
                      <th>Reads Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.key}>
                        <td>{r.title}</td>
                        <td>{r.avg.toFixed(1)} days</td>
                        <td>{Math.round(r.max)} days</td>
                        <td>{Math.round(r.min)} days</td>
                        <td>{r.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ marginTop: 8 }}>No series-level data yet.</p>
              )}
            </>
          )}
        </>
      );
    }

    if (t === "collectionValue") {
      const { msrpTotal, paidTotal } = collectionValue;
      const diff = msrpTotal - paidTotal;
      const pct =
        msrpTotal > 0 ? ((paidTotal / msrpTotal) * 100).toFixed(1) : "-";
      const rows = [...seriesAggregates]
        .filter((row) => row.msrp || row.paid || row.collectible)
        .sort((a, b) => b.msrp + b.collectible - (a.msrp + a.collectible));

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
                <td>{pct === "-" ? "-" : `${pct}%`}</td>
              </tr>
            </tbody>
          </table>

          {rows.length > 0 && (
            <>
              <h4 style={{ marginTop: "14px" }}>Collection Pricing</h4>
              <table>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>MSRP</th>
                    <th>Paid</th>
                    <th>Collectible</th>
                    <th>Books</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={row.title + i}>
                      <td>{row.title}</td>
                      <td>${row.msrp.toFixed(2)}</td>
                      <td>${row.paid.toFixed(2)}</td>
                      <td>{row.collectible ? `$${row.collectible.toFixed(2)}` : "--"}</td>
                      <td>{row.books}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      );
    }

    if (t === "pages") {
      const rows = [...seriesAggregates]
        .filter((row) => row.pages > 0)
        .map((row) => ({
          ...row,
          pct: row.pages ? Math.round((row.readPages / row.pages) * 100) : 0,
        }))
        .sort((a, b) => b.pages - a.pages);
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
                    : "-"}
                </td>
              </tr>
            </tbody>
          </table>

          {rows.length > 0 && (
            <>
              <h4 style={{ marginTop: "14px" }}>Pages by Series</h4>
              <table>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Read Pages</th>
                    <th>Total Pages</th>
                    <th>% Read</th>
                    <th>Books</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={row.title + i}>
                      <td>{row.title}</td>
                      <td>{row.readPages.toLocaleString()}</td>
                      <td>{row.pages.toLocaleString()}</td>
                      <td>{row.pct}%</td>
                      <td>{row.books}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      );
    }

    if (t === "ratings") {
      const ratedSeries = [...seriesAggregates]
        .map((s) => {
          if (!s.ratings.length) return null;
          const avg = s.ratings.reduce((a, b) => a + b, 0) / s.ratings.length;
          return { title: s.title, avg, count: s.ratings.length };
        })
        .filter(Boolean)
        .sort((a, b) => b.avg - a.avg || b.count - a.count);

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

          {ratedSeries.length > 0 && (
            <>
              <h4 style={{ marginTop: "14px" }}>Series Averages</h4>
              <table>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Avg</th>
                    <th>Ratings</th>
                  </tr>
                </thead>
                <tbody>
                  {ratedSeries.map((row, i) => (
                    <tr key={row.title + i}>
                      <td>{row.title}</td>
                      <td>{row.avg.toFixed(2)}</td>
                      <td>{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
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
      <header
        className="dashboard-header"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
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
            style={{
              margin: 0,
              fontSize: "2rem",
              color: "#ffb6c1",
              textShadow: "0 0 8px rgba(255,182,193,0.8)",
              fontWeight: 700,
            }}
            >
              Dashboard
            </h1>
          <p className="dashboard-sub" style={{ textAlign: "center", margin: "6px 0 0" }}>
            Admin-only analytics for your manga library and wishlist.
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
            <button className="stat-link" onClick={() => setSettingsOpen(true)} type="button">
              Admin Settings
            </button>
          </div>
        )}
      </header>

      <section id="dashboardSection" className="page-section active">
        <div className="dashboard-grid">
          <div className="stat-stack">
            <div className="stat-card mini">
              <h3>Total Library Books</h3>
              <div className="stat-value">{totalLibrary}</div>
              <div className="stat-sub">Volumes in your library.</div>
            </div>
            <div className="stat-card mini">
              <h3>Wishlist Items</h3>
              <div className="stat-value">{wishlistCount}</div>
              <div className="stat-sub">Tracked upcoming wants.</div>
            </div>
          </div>

          <div className="stat-card">
            <h3>Read / Unread</h3>
            <div
              className="pie"
              style={{ "--pct": `${readPct * 3.6}deg` }}
            >
              <div className="pie-label">{readPct}%</div>
            </div>
            <div className="stat-value">
              {readCount} read / {unreadCount} unread
            </div>
          </div>

          <div className="stat-card clickable" onClick={() => openDetail("ratings")}>
            <h3>Ratings</h3>
            <div className="stat-value">
              {avgRating == null ? "-" : avgRating.toFixed(2)}
            </div>
            <div className="stat-sub">Average across rated series.</div>
            <div className="stat-list compact">
              {topRated.length ? (
                topRated.map((r, i) => (
                  <div className="stat-list-row" key={r.title + i}>
                    <span className="stat-rank">{i + 1}</span>
                    <span className="stat-name">{r.title}</span>
                    <span className="stat-count">{r.avg.toFixed(2)}</span>
                  </div>
                ))
              ) : (
                <div className="stat-sub">No ratings yet.</div>
              )}
            </div>
          </div>

          <div className="stat-card clickable" onClick={() => openDetail("pages")}>
            <h3>Page Count Read / Total</h3>
            <div className="stat-value">
              {pages.read.toLocaleString()} / {pages.total.toLocaleString()}
            </div>
            <div className="stat-sub">
              {pages.total
                ? `${((pages.read / pages.total) * 100).toFixed(1)}% read`
                : "-"}
            </div>
          </div>

          <div className="stat-card">
            <h3>Library vs Wishlist</h3>
            <div
              className="pie"
              style={{ "--pct": `${libSharePct * 3.6}deg` }}
            >
              <div className="pie-label">{libSharePct}%</div>
            </div>
            <div className="stat-value">
              {totalLibrary} / {wishlistCount}
            </div>
            <div className="stat-sub">Library vs wishlist share</div>
          </div>

          <div
            className="stat-card clickable"
            onClick={() => openDetail("demographics")}
          >
            <h3>Top Demographics</h3>
            <div className="stat-list">
              {topDemographics.length ? (
                topDemographics.slice(0, 3).map((d, i) => (
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

          <div
            className="stat-card clickable"
            onClick={() => openDetail("publishers")}
          >
            <h3>Top Publishers</h3>
            <div className="stat-list">
              {topPublishers.length ? (
                topPublishers.slice(0, 3).map((p, i) => (
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
            className="stat-card clickable"
            onClick={() => openDetail("genres")}
          >
            <h3>Top Genres</h3>
            <div className="stat-list">
              {topGenres.length ? (
                topGenres.slice(0, 3).map((g, i) => (
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
            className="stat-card clickable"
            onClick={() => {
              openCalendar();
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
                : "-"}
              <br />
              <span id="statNextCountdown">{countdownText}</span>
            </div>
          </div>

          <div
            className="stat-card clickable"
            onClick={() => openDetail("collectionValue")}
            style={{ textAlign: "center" }}
          >
            <h3>Collection Pricing</h3>
            <div className="stat-value stat-msrp">
              ${collectionValue.msrpTotal.toFixed(2)}
            </div>
            <div className="stat-value stat-paid">
              ${collectionValue.paidTotal.toFixed(2)}
              {collectionValue.msrpTotal > 0 && (
                <span className="stat-paid-pct">
                  ({((1 - collectionValue.paidTotal / collectionValue.msrpTotal) * 100).toFixed(1)}% off)
                </span>
              )}
            </div>
            <div className="stat-value stat-collectible">
              ${collectionValue.collectibleTotal.toFixed(2)}
            </div>
            <div className="stat-sub">
              MSRP • Paid • Collectible overrides
            </div>
          </div>

          <div className="stat-card">
            <h3>Current Year Reads</h3>
            <div className="stat-value">{currentYearReadsTotal}</div>
            <div className="stat-sub">Reads in {currentYear}</div>
          </div>

          <div
            className="stat-card clickable"
            onClick={() => openDetail("timeToRead")}
          >
            <h3>Avg Days From Purchase to Read</h3>
            <div className="stat-value">
              {avgDays == null ? "-" : `${avgDays.toFixed(1)} days`}
            </div>
            <div className="stat-sub">When both dates exist</div>
          </div>

          <div className="stat-duo">
            <div className="stat-card tall">
              <h3>Reads Per Month ({currentYear})</h3>
              <LineChart data={monthlyReads} />
            </div>
            <div className="stat-card tall">
              <h3>Reads by Day of Week (Lifetime)</h3>
              <WeekdayBreakdown data={weekdayBreakdown} />
              <div className="stat-sub">
                Based on all entries with a read date.
              </div>
            </div>
          </div>

          <div className="stat-card wide">
            <h3>Activity Log</h3>
            {hasError && (
              <div className="error" style={{ textAlign: "center" }}>
                {err}
              </div>
            )}
            <div className="activity-log">
              {activity.length ? (
                activity.map((item, idx) => (
                  <div className="activity-row" key={item.title + idx}>
                    <span className="activity-type">{item.type}</span>
                    <span className="activity-title">{item.title}</span>
                    <span className="activity-date">
                      {item.date.toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                ))
              ) : (
                <div className="stat-sub">No recent activity yet.</div>
              )}
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
                  {"<"}
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
                  {">"}
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
                  <div
                    key={idx}
                    className={"calendar-day" + (cell.isToday ? " today" : "")}
                  >
                    <div className="day-num">{cell.day}</div>
                    <div className="calendar-releases">
                      {(calendarExpandedDay === cell.dateKey
                        ? cell.releases
                        : cell.releases.slice(0, 2)
                      ).map((r, i) => (
                        <div
                          className="calendar-release"
                          key={i}
                          title={r.title}
                        >
                          {r.title}
                        </div>
                      ))}
                      {cell.releases.length > 2 && (
                        <button
                          className="calendar-more-btn"
                          onClick={() =>
                            setCalendarExpandedDay((prev) =>
                              prev === cell.dateKey ? null : cell.dateKey
                            )
                          }
                        >
                          {calendarExpandedDay === cell.dateKey
                            ? "Show less"
                            : `+${cell.releases.length - 2} more`}
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
              x
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
              x
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

      {admin && settingsOpen && (
        <div
          className="dashboard-modal-backdrop visible"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSettingsOpen(false);
          }}
        >
          <div className="dashboard-modal">
            <div className="dashboard-modal-header">
              <h3>Webhook Settings</h3>
              <button className="dashboard-close" onClick={() => setSettingsOpen(false)} type="button">
                Close
              </button>
            </div>
            <div className="dashboard-modal-body">
              <label className="dashboard-input">
                <span>Yearly summary webhook</span>
                <input
                  type="text"
                  value={webhooks.yearly}
                  onChange={(e) => setWebhooks((prev) => ({ ...prev, yearly: e.target.value }))}
                />
              </label>
              <label className="dashboard-input">
                <span>Release timer webhook</span>
                <input
                  type="text"
                  value={webhooks.release}
                  onChange={(e) => setWebhooks((prev) => ({ ...prev, release: e.target.value }))}
                />
              </label>
              <label className="dashboard-input">
                <span>Activity webhook</span>
                <input
                  type="text"
                  value={webhooks.activity}
                  onChange={(e) => setWebhooks((prev) => ({ ...prev, activity: e.target.value }))}
                />
              </label>
              <div className="dashboard-input" style={{ borderTop: "1px solid rgba(255,182,193,0.2)", paddingTop: 8 }}>
                <span>Admin UIDs</span>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <input
                    type="text"
                    placeholder="Enter UID"
                    value={adminUidInput}
                    onChange={(e) => setAdminUidInput(e.target.value)}
                    style={{
                      flex: "1 1 220px",
                      padding: "8px 10px",
                      borderRadius: "10px",
                      border: "1px solid rgba(255,182,193,0.35)",
                      background: "rgba(43,15,29,0.75)",
                      color: "#ffffff",
                    }}
                  />
                  <button className="stat-link" type="button" onClick={handleGrantAdmin}>
                    Grant
                  </button>
                  <button className="stat-link danger" type="button" onClick={() => handleRevokeAdmin()}>
                    Revoke
                  </button>
                </div>
                <div style={{ marginTop: 8, fontSize: "0.85rem", color: "var(--text-soft)" }}>
                  {adminsLoading ? (
                    <span>Loading admins…</span>
                  ) : adminsList.length === 0 ? (
                    <span>No admins found.</span>
                  ) : (
                    <ul style={{ listStyle: "none", margin: "6px 0 0", padding: 0, display: "flex", gap: 6, flexDirection: "column" }}>
                      {adminsList.map((a) => (
                        <li
                          key={a.uid}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 8,
                            background: "rgba(24,5,18,0.7)",
                            border: "1px solid rgba(255,182,193,0.18)",
                            borderRadius: 10,
                            padding: "6px 8px",
                          }}
                        >
                          <span style={{ wordBreak: "break-all" }}>{a.uid}</span>
                          <button
                            className="dashboard-close"
                            type="button"
                            onClick={() => handleRevokeAdmin(a.uid)}
                            style={{ padding: "4px 10px" }}
                          >
                            Revoke
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
            <div className="dashboard-modal-footer">
              <button
                className="stat-link"
                type="button"
                onClick={async () => {
                  try {
                    await setDoc(doc(db, "settings", "webhooks"), {
                      yearly: webhooks.yearly || DEFAULT_YEARLY_WEBHOOK,
                      release: webhooks.release || DEFAULT_RELEASE_WEBHOOK,
                      activity: webhooks.activity || DEFAULT_ACTIVITY_WEBHOOK,
                    });
                    setSettingsOpen(false);
                  } catch (err) {
                    console.error("Failed to save webhooks", err);
                    alert("Failed to save webhooks.");
                  }
                }}
              >
                Save
              </button>
              <button
                className="stat-link danger"
                type="button"
                onClick={() => setSettingsOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
