// src/pages/Dashboard.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import "../styles/dashboard.css";
import { collection, doc, getDocs, getDoc, setDoc, deleteDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { useAuth } from "../contexts/AuthContext";

const DEFAULT_YEARLY_WEBHOOK =
  "https://discord.com/api/webhooks/1448287168845054004/cGWGPoH5LaTFlBZ1vxtgMjOfV9au6qyQ_9ZRnOWN9-AX0MNfwxKNWVcZYQHz0ESA7_4k";
const DEFAULT_RELEASE_WEBHOOK =
  "https://discord.com/api/webhooks/1448288240871276616/101WI-B2p8tDR34Hl9fZxxb0QG01f1Eo5w1IvbttlQmP2wWFNJ0OI7UnJfJujKRNWW2Q";
const DEFAULT_ACTIVITY_WEBHOOK =
  "https://discord.com/api/webhooks/1448329790942613667/wsC8psNZ-Ax2D1O9Gl4sJi6ay7df2cr7IrIdxMPwGZTBnkSUIY2NDpeVd98qW_4plz82";
const ACTIVITY_STORAGE_KEY = "mangaLibraryActivityLog";

/* ---------- Helpers ---------- */

// Remove trailing volume indicators so series-level stats don't carry volume numbers
function stripVolumeInfo(raw) {
  const str = raw == null ? "" : String(raw);
  if (!str.trim()) return "";
  return str
    .replace(/\s*,?\s*(?:vol(?:ume)?\.?)\s+\d+.*$/i, "")
    .trim();
}

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
    doc.seriesKey ||
    doc.series ||
    doc.Series ||
    doc.title ||
    doc.Title ||
    "";
  const cleaned = stripVolumeInfo(raw) || raw;
  const normalized = cleaned.trim();
  if (!normalized) return "";
  return normalized.toLowerCase();
}

function getSeriesDisplayName(doc) {
  const base =
    doc?.series ||
    doc?.Series ||
    doc?.title ||
    doc?.Title ||
    "Unknown Series";
  return stripVolumeInfo(base) || "Unknown Series";
}

function parseTitleForSort(t) {
  const text = (t || "").trim();
  const match = text.match(/^(.*?)(?:,?\s*(?:vol\.|volume)\s*(\d+)(?:\s*[-–]\s*\d+)?\s*)?(?:\s*\([^)]*\))?$/i);
  const base = match ? match[1].trim().toLowerCase() : text.toLowerCase();
  const volNum = match && match[2] ? parseInt(match[2], 10) : 0;
  return {
    name: base,
    vol: Number.isFinite(volNum) ? volNum : 0,
  };
}

function sortBooksForManager(a, b) {
  const aTitle = a?.Title || a?.title || "";
  const bTitle = b?.Title || b?.title || "";
  const aParsed = parseTitleForSort(aTitle);
  const bParsed = parseTitleForSort(bTitle);
  const nameCmp = aParsed.name.localeCompare(bParsed.name);
  if (nameCmp !== 0) return nameCmp;
  if (aParsed.vol !== bParsed.vol) return aParsed.vol - bParsed.vol;
  return aTitle.localeCompare(bTitle);
}

function getSeriesFormDefaults() {
  return {
    publisher: "",
    demographic: "",
    genre: "",
    subGenre: "",
    datePurchased: "",
    msrp: "",
    initialPublisher: "",
    initialDemographic: "",
    initialGenre: "",
    initialSubGenre: "",
    initialDatePurchased: "",
    initialMsrp: "",
    dateMixed: false,
    readChecked: false,
    readIndeterminate: false,
  };
}

function getBookFormDefaults() {
  return {
    read: false,
    datePurchased: "",
    dateRead: "",
    pageCount: "",
    msrp: "",
    amountPaid: "",
    rating: "",
    special: false,
    specialType: "",
    specialVolumes: "",
    collectiblePrice: "",
  };
}

function hasMissingManagerData(book, options = {}) {
  const ignoreShared = options.ignoreShared;
  const amountPaid =
    book?.amountPaid ?? book?.AmountPaid ?? book?.paid ?? book?.Paid ?? "";
  const msrp = book?.msrp ?? book?.MSRP ?? "";
  const datePurchased = (book?.datePurchased || book?.DatePurchased || "").trim();
  const publisher = (book?.publisher || book?.Publisher || "").trim();
  const demographic = (book?.demographic || book?.Demographic || "").trim();
  const genre = (book?.genre || book?.Genre || "").trim();
  const specialType = (book?.specialType || book?.SpecialType || "").trim();
  const specialVolumes =
    book?.specialVolumes ?? book?.SpecialVolumes ?? book?.volumesContained ?? "";
  const collectiblePrice =
    book?.collectiblePrice ?? book?.CollectiblePrice ?? "";
  const specialOn = !!specialType;
  const pageRaw =
    book?.pageCount ?? book?.PageCount ?? book?.pages ?? book?.Pages ?? "";
  const pageStr = pageRaw === undefined || pageRaw === null ? "" : String(pageRaw).trim();
  const pageNum = Number(pageStr);
  const missingPage =
    !pageStr || Number.isNaN(pageNum) || pageNum <= 0;

  const missingAmountPaid = !specialOn && (amountPaid === "" || amountPaid === null);
  const missingShared = msrp === "" || !publisher || !demographic || !genre;

  return (
    missingAmountPaid ||
    missingPage ||
    !datePurchased ||
    (!ignoreShared && missingShared) ||
    (specialOn && !specialType) ||
    (specialOn &&
      specialType.toLowerCase() === "collectible" &&
      (collectiblePrice === "" || collectiblePrice === null)) ||
    (specialOn &&
      specialType.toLowerCase() === "specialedition" &&
      (specialVolumes === "" || specialVolumes === null))
  );
}

function getBookMissingFlagsFromForm(form) {
  const amountPaidRaw = form?.amountPaid ?? "";
  const datePurchasedRaw = (form?.datePurchased || "").trim();
  const specialOn = !!form?.specialType || !!form?.special;
  const specialTypeRaw = (form?.specialType || "").trim();
  const specialVolumesRaw = form?.specialVolumes ?? "";
  const collectiblePriceRaw = form?.collectiblePrice ?? "";
  const pageCountRaw = form?.pageCount ?? "";
  const msrpRaw = form?.msrp ?? "";
  const publisherRaw = (form?.publisher || "").trim();
  const demographicRaw = (form?.demographic || "").trim();
  const genreRaw = (form?.genre || "").trim();

  const missingAmountPaid = !specialOn && (amountPaidRaw === "" || amountPaidRaw === null);
  const missingSpecialType = specialOn && !specialTypeRaw;
  const missingCollectible =
    specialOn &&
    specialTypeRaw.toLowerCase() === "collectible" &&
    (collectiblePriceRaw === "" || collectiblePriceRaw === null);
  const missingVolumes =
    specialOn &&
    specialTypeRaw.toLowerCase() === "specialedition" &&
    (specialVolumesRaw === "" || specialVolumesRaw === null);
  const missingPageCount = (() => {
    const str = (pageCountRaw ?? "").toString().trim();
    if (str === "") return true;
    const num = Number(str);
    return Number.isNaN(num) || num <= 0;
  })();

  return {
    amountPaid: missingAmountPaid,
    datePurchased: !datePurchasedRaw,
    specialType: missingSpecialType,
    collectiblePrice: missingCollectible,
    specialVolumes: missingVolumes,
    pageCount: missingPageCount,
    msrp: msrpRaw === "" || msrpRaw === null,
    publisher: !publisherRaw,
    demographic: !demographicRaw,
    genre: !genreRaw,
  };
}

function groupHasSharedMissing(group) {
  if (!group || !group.books || !group.books.length) return false;
  return group.books.some((book) => {
    const msrp = book?.msrp ?? book?.MSRP ?? "";
    const publisher = (book?.publisher || book?.Publisher || "").trim();
    const demographic = (book?.demographic || book?.Demographic || "").trim();
    const genre = (book?.genre || book?.Genre || "").trim();
    return msrp === "" || !publisher || !demographic || !genre;
  });
}

// Build series-level map: all stats aggregated per series
function buildSeriesMap(library) {
  const map = new Map();
  for (const item of library) {
    const key = getSeriesKey(item) || item.id;
    if (!map.has(key)) {
      const baseTitle =
        stripVolumeInfo(
          item.series ||
            item.Series ||
            item.title ||
            item.Title ||
            "Unknown Series"
        ) ||
        "Unknown Series";
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
    const baseTitle =
      stripVolumeInfo(
        item.series ||
          item.Series ||
          item.title ||
          item.Title ||
          "Untitled"
      ) ||
      "Untitled";
    if (!map.has(key)) {
      map.set(key, {
        key,
        title: baseTitle,
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
      const rawTitle =
        item.series ||
        item.Series ||
        item.title ||
        item.Title ||
        "Untitled";
      map.set(key, {
        key,
        title: stripVolumeInfo(rawTitle) || rawTitle.trim() || "Untitled",
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
  const [managerExpanded, setManagerExpanded] = useState(new Set());
  const [managerSelectedSeries, setManagerSelectedSeries] = useState(null);
  const [managerSelectedBook, setManagerSelectedBook] = useState(null);
  const [managerMultiSelected, setManagerMultiSelected] = useState(new Set());
  const [managerLastIndex, setManagerLastIndex] = useState(null);
  const [bulkPaidValue, setBulkPaidValue] = useState("");
  const seriesReadRef = useRef(null);
  const [seriesForm, setSeriesForm] = useState(() => getSeriesFormDefaults());
  const [bookForm, setBookForm] = useState(() => getBookFormDefaults());
  const [activityLog, setActivityLog] = useState([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [adminUidInput, setAdminUidInput] = useState("");
  const [adminsList, setAdminsList] = useState([]);
  const [adminsLoading, setAdminsLoading] = useState(false);
  const [calendarExpandedDay, setCalendarExpandedDay] = useState(null);
  const [calendarModalDay, setCalendarModalDay] = useState(null);
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

  useEffect(() => {
    document.title = "Dashboard";
  }, []);

  useEffect(() => {
    const hasOpenModal =
      calendarOpen || detailModal.open || settingsOpen || !!calendarModalDay;
    if (hasOpenModal) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [calendarOpen, detailModal.open, settingsOpen, calendarModalDay]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    yearlyPostedRef.current = localStorage.getItem("dashboard-yearly-posted");
    releasePostedRef.current = localStorage.getItem("dashboard-release-posted");
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
  } = stats;

  const nextDate = nextRelease ? nextRelease.date : null;
  const hasError = Boolean(err);

  const managerGroups = useMemo(() => {
    if (!library || !library.length) return [];
    const map = new Map();
    library.forEach((book) => {
      const key = getSeriesKey(book) || book.id;
      const displayName = getSeriesDisplayName(book);
      if (!map.has(key)) {
        map.set(key, { seriesKey: key, displayName, books: [] });
      }
      map.get(key).books.push(book);
    });
    const groups = Array.from(map.values()).map((group) => ({
      ...group,
      books: [...group.books].sort(sortBooksForManager),
    }));
    groups.sort((a, b) => a.displayName.localeCompare(b.displayName));
    return groups;
  }, [library]);

  const managerFlatBookIds = useMemo(
    () => managerGroups.flatMap((g) => g.books.map((b) => b.id)),
    [managerGroups]
  );

  useEffect(() => {
    if (!managerSelectedBook) return;
    if (!library.some((b) => b.id === managerSelectedBook)) {
      setManagerSelectedBook(null);
    }
  }, [library, managerSelectedBook]);

  useEffect(() => {
    if (!managerSelectedSeries) return;
    if (!managerGroups.some((g) => g.seriesKey === managerSelectedSeries)) {
      setManagerSelectedSeries(null);
    }
  }, [managerGroups, managerSelectedSeries]);

  useEffect(() => {
    if (!managerMultiSelected.size) return;
    const existing = new Set(library.map((b) => b.id));
    const missing = Array.from(managerMultiSelected).filter((id) => !existing.has(id));
    if (!missing.length) return;
    setManagerMultiSelected((prev) => {
      const next = new Set(prev);
      missing.forEach((id) => next.delete(id));
      return next;
    });
  }, [library, managerMultiSelected]);

  useEffect(() => {
    const ids = Array.from(managerMultiSelected);
    if (!ids.length) {
      setBulkPaidValue("");
      return;
    }
    const values = Array.from(
      new Set(
        ids
          .map((id) => library.find((b) => b.id === id))
          .filter(Boolean)
          .map((b) => {
            const raw = b.amountPaid ?? b.AmountPaid ?? "";
            return raw === undefined || raw === null ? "" : String(raw);
          })
      )
    );
    setBulkPaidValue(values.length === 1 ? values[0] : "");
  }, [managerMultiSelected, library]);

  useEffect(() => {
    const group = managerGroups.find((g) => g.seriesKey === managerSelectedSeries);
    if (!group) {
      setSeriesForm(getSeriesFormDefaults());
      return;
    }
    const books = group.books;
    const pickShared = (getter) => {
      const vals = Array.from(
        new Set(
          books.map((b) => {
            const raw = getter(b);
            if (raw === undefined || raw === null) return "";
            return String(raw).trim();
          })
        )
      );
      return vals.length === 1 ? vals[0] : "";
    };

    const publisher = pickShared((b) => b.publisher || b.Publisher);
    const demographic = pickShared((b) => b.demographic || b.Demographic);
    const genre = pickShared((b) => b.genre || b.Genre);
    const subGenre = pickShared((b) => b.subGenre || b.SubGenre);
    const msrp = pickShared((b) => b.msrp ?? b.MSRP);
    const dateValues = Array.from(
      new Set(
        books
          .map((b) => (b.datePurchased || b.DatePurchased || "").trim())
          .filter(Boolean)
      )
    );
    const dateMixed = dateValues.length > 1;
    const datePurchased = dateMixed ? "" : (dateValues[0] || "");

    const readCount = books.filter(
      (b) => !!b.read || b.status === "Read" || b.Read === true
    ).length;
    const allRead = readCount === books.length && books.length > 0;
    const allUnread = readCount === 0;

    setSeriesForm({
      publisher,
      demographic,
      genre,
      subGenre,
      datePurchased,
      msrp,
      initialPublisher: publisher,
      initialDemographic: demographic,
      initialGenre: genre,
      initialSubGenre: subGenre,
      initialDatePurchased: datePurchased,
      initialMsrp: msrp,
      dateMixed,
      readChecked: allRead,
      readIndeterminate: !allRead && !allUnread,
    });
  }, [managerGroups, managerSelectedSeries]);

  useEffect(() => {
    if (seriesReadRef.current) {
      seriesReadRef.current.indeterminate = seriesForm.readIndeterminate;
    }
  }, [seriesForm.readIndeterminate]);

  useEffect(() => {
    const book = library.find((b) => b.id === managerSelectedBook);
    if (!book) {
      setBookForm(getBookFormDefaults());
      return;
    }
    const readFlag = !!book.read || book.status === "Read" || book.Read === true;
    setBookForm({
      read: readFlag,
      datePurchased: book.datePurchased || book.DatePurchased || "",
      dateRead: readFlag ? book.dateRead || book.DateRead || "" : "",
      pageCount:
        book.pageCount ??
        book.PageCount ??
        book.pages ??
        book.Pages ??
        "",
      msrp: book.msrp ?? book.MSRP ?? "",
      amountPaid: book.amountPaid ?? book.AmountPaid ?? "",
      rating: readFlag ? book.rating ?? book.Rating ?? "" : "",
      special: !!(book.specialType || book.SpecialType),
      specialType: book.specialType ?? book.SpecialType ?? "",
      specialVolumes: book.specialVolumes ?? book.SpecialVolumes ?? "",
      collectiblePrice: book.collectiblePrice ?? book.CollectiblePrice ?? "",
      publisher: book.publisher || book.Publisher || "",
      demographic: book.demographic || book.Demographic || "",
      genre: book.genre || book.Genre || "",
    });
  }, [managerSelectedBook, library]);

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(ACTIVITY_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const entries = parsed
        .map((e) => ({
          message: e.message,
          ts: e.ts ? new Date(e.ts) : new Date(),
        }))
        .filter((e) => e.message);
      if (entries.length) setActivityLog(entries);
    } catch (err) {
      console.warn("Failed to load activity log", err);
    }
  }, []);

  const refreshLibraryData = async () => {
    try {
      const snap = await getDocs(collection(db, "library"));
      setLibrary(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (refreshErr) {
      console.error("Failed to refresh library", refreshErr);
      setErr((prev) => prev || "Failed to refresh library data.");
    }
  };

  const parseNumberInput = (val) => {
    const str = (val ?? "").toString().trim();
    if (str === "") return "";
    const num = parseFloat(str);
    return Number.isFinite(num) ? num : "";
  };

  const parseIntegerInput = (val) => {
    const str = (val ?? "").toString().trim();
    if (str === "") return "";
    const num = parseInt(str, 10);
    return Number.isFinite(num) ? num : "";
  };

  const persistActivityLog = (entries) => {
    try {
      const payload = entries.slice(0, 100).map((entry) => ({
        message: entry.message,
        ts: entry.ts instanceof Date ? entry.ts.toISOString() : entry.ts,
      }));
      if (typeof window !== "undefined") {
        localStorage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify(payload));
      }
    } catch (err) {
      console.warn("Failed to persist activity log", err);
    }
  };

  const addActivity = (message) => {
    if (!message) return;
    const entry = { message, ts: new Date() };
    setActivityLog((prev) => {
      const next = [entry, ...prev].slice(0, 100);
      persistActivityLog(next);
      return next;
    });
    const email = user?.email || "anonymous";
    const content = `Activity: ${message}\nUser: ${email}\nTime: ${new Date().toLocaleString()}`;
    postWebhook(webhooks.activity, content).catch((err) =>
      console.warn("Activity webhook failed", err)
    );
  };

  const handleSeriesHeaderClick = (seriesKey) => {
    setManagerExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(seriesKey)) next.delete(seriesKey);
      else next.add(seriesKey);
      return next;
    });
    setManagerSelectedSeries(seriesKey);
    setManagerSelectedBook(null);
  };

  const handleBookClick = (event, bookId, seriesKey) => {
    const ctrl = event.metaKey || event.ctrlKey;
    const shift = event.shiftKey;
    const currentIndex = managerFlatBookIds.indexOf(bookId);
    let nextSelected = new Set(managerMultiSelected);

    if (shift && managerLastIndex !== null && currentIndex !== -1) {
      const start = Math.min(managerLastIndex, currentIndex);
      const end = Math.max(managerLastIndex, currentIndex);
      for (let i = start; i <= end; i += 1) {
        const id = managerFlatBookIds[i];
        if (id) nextSelected.add(id);
      }
    } else if (ctrl) {
      if (nextSelected.has(bookId)) nextSelected.delete(bookId);
      else nextSelected.add(bookId);
    } else {
      nextSelected = new Set();
    }

    setManagerMultiSelected(nextSelected);
    setManagerLastIndex(currentIndex);
    setManagerSelectedBook(bookId);
    setManagerSelectedSeries(seriesKey);
    setManagerExpanded((prev) => {
      const next = new Set(prev);
      next.add(seriesKey);
      return next;
    });
  };

  const clearManagerSelection = () => {
    setManagerMultiSelected(new Set());
    setManagerLastIndex(null);
  };

  const handleBulkApplyPaid = async () => {
    if (!admin) {
      alert("Dashboard is read-only for your account.");
      return;
    }
    const ids = Array.from(managerMultiSelected);
    if (!ids.length) {
      alert("Select books in Library Manager (use Ctrl/Cmd or Shift) before bulk editing.");
      return;
    }
    const raw = (bulkPaidValue || "").toString().trim();
    const hasValue = raw !== "";
    const parsed = parseNumberInput(raw);
    if (hasValue && parsed === "") {
      alert("Enter a valid number for Amount Paid.");
      return;
    }
    try {
      await Promise.all(
        ids.map((id) =>
          updateDoc(doc(db, "library", id), {
            amountPaid: hasValue ? parsed : "",
          })
        )
      );
      await refreshLibraryData();
      clearManagerSelection();
      addActivity(`Updated amount paid for ${ids.length} book${ids.length === 1 ? "" : "s"} in library`);
      alert(`Applied Amount Paid to ${ids.length} selection${ids.length === 1 ? "" : "s"}.`);
    } catch (err) {
      console.error("Failed to apply Amount Paid", err);
      alert("Failed to apply Amount Paid to selection.");
    }
  };

  const handleSeriesSave = async () => {
    if (!admin) {
      alert("Dashboard is read-only for your account.");
      return;
    }
    const group = managerGroups.find((g) => g.seriesKey === managerSelectedSeries);
    if (!group || !group.books.length) return;

    const applyRead = !seriesForm.readIndeterminate;
    const readValue = !!seriesForm.readChecked;
    const dpChanged = seriesForm.datePurchased !== seriesForm.initialDatePurchased;
    const msrpChanged = seriesForm.msrp !== seriesForm.initialMsrp;
    const pubChanged = seriesForm.publisher !== seriesForm.initialPublisher;
    const demoChanged = seriesForm.demographic !== seriesForm.initialDemographic;
    const genreChanged = seriesForm.genre !== seriesForm.initialGenre;
    const subChanged = seriesForm.subGenre !== seriesForm.initialSubGenre;

    if (
      !applyRead &&
      !dpChanged &&
      !msrpChanged &&
      !pubChanged &&
      !demoChanged &&
      !genreChanged &&
      !subChanged
    ) {
      return;
    }

    const msrpInput = String(seriesForm.msrp ?? "").trim();
    const msrpValue = msrpChanged ? parseNumberInput(msrpInput) : "";
    if (msrpChanged && msrpInput !== "" && msrpValue === "") {
      alert("Enter a valid number for MSRP.");
      return;
    }

    try {
      const updates = [];
      group.books.forEach((book) => {
        const payload = {};
        if (applyRead) {
          payload.read = readValue;
          payload.dateRead = readValue
            ? book.dateRead || book.DateRead || new Date().toISOString().slice(0, 10)
            : "";
        }
        if (dpChanged) {
          payload.datePurchased = seriesForm.datePurchased || "";
        }
        if (msrpChanged) {
          payload.msrp = seriesForm.msrp === "" ? "" : msrpValue;
        }
        if (pubChanged) {
          payload.publisher = seriesForm.publisher || "";
        }
        if (demoChanged) {
          payload.demographic = seriesForm.demographic || "";
        }
        if (genreChanged) {
          payload.genre = seriesForm.genre || "";
        }
        if (subChanged) {
          payload.subGenre = seriesForm.subGenre || "";
        }
        if (Object.keys(payload).length) {
          updates.push(updateDoc(doc(db, "library", book.id), payload));
        }
      });
      if (!updates.length) return;
      await Promise.all(updates);
      await refreshLibraryData();
      setManagerSelectedBook(null);
      addActivity(`Updated series "${group.displayName || "Series"}" (${group.books.length} book${group.books.length === 1 ? "" : "s"})`);
      alert("Series updated.");
    } catch (err) {
      console.error("Failed to save series changes", err);
      alert("Failed to update series.");
    }
  };

  const handleBookSave = async () => {
    if (!admin) {
      alert("Dashboard is read-only for your account.");
      return;
    }
    if (!managerSelectedBook) return;
    const readVal = !!bookForm.read;
    const msrpInput = String(bookForm.msrp ?? "").trim();
    const paidInput = String(bookForm.amountPaid ?? "").trim();
    const pageInput = String(bookForm.pageCount ?? "").trim();
    const ratingInput = String(bookForm.rating ?? "").trim();
    const msrpVal = parseNumberInput(msrpInput);
    const paidVal = parseNumberInput(paidInput);
    const pageVal = parseIntegerInput(pageInput);
    const ratingVal = parseNumberInput(ratingInput);

    if (msrpInput !== "" && msrpVal === "") {
      alert("Enter a valid number for MSRP.");
      return;
    }
    if (paidInput !== "" && paidVal === "") {
      alert("Enter a valid number for Amount Paid.");
      return;
    }
    if (pageInput !== "" && pageVal === "") {
      alert("Enter a valid page count.");
      return;
    }
    if (readVal && ratingInput !== "" && ratingVal === "") {
      alert("Enter a valid rating.");
      return;
    }

    const specialOn = !!bookForm.special;
    const specialVolVal = parseIntegerInput(bookForm.specialVolumes);
    const collectibleVal = parseNumberInput(bookForm.collectiblePrice);
    const specialVolInput = String(bookForm.specialVolumes ?? "").trim();
    const collectibleInput = String(bookForm.collectiblePrice ?? "").trim();
    if (specialOn && bookForm.specialType === "specialEdition" && specialVolInput !== "" && specialVolVal === "") {
      alert("Enter a valid number for volumes contained.");
      return;
    }
    if (specialOn && bookForm.specialType === "collectible" && collectibleInput !== "" && collectibleVal === "") {
      alert("Enter a valid collectible price.");
      return;
    }

    const dateReadVal = readVal
      ? (bookForm.dateRead || new Date().toISOString().slice(0, 10))
      : "";

    const payload = {
      read: readVal,
      datePurchased: bookForm.datePurchased || "",
      dateRead: dateReadVal,
      msrp: bookForm.msrp === "" ? "" : msrpVal,
      amountPaid: bookForm.amountPaid === "" ? "" : paidVal,
      pageCount: bookForm.pageCount === "" ? "" : pageVal,
      rating: readVal ? (bookForm.rating === "" ? "" : ratingVal) : "",
      specialType: specialOn ? bookForm.specialType || "" : "",
      specialVolumes:
        specialOn && bookForm.specialType === "specialEdition"
          ? bookForm.specialVolumes === "" ? "" : specialVolVal
          : "",
      collectiblePrice:
        specialOn && bookForm.specialType === "collectible"
          ? bookForm.collectiblePrice === "" ? "" : collectibleVal
          : "",
    };

    try {
      await updateDoc(doc(db, "library", managerSelectedBook), payload);
      await refreshLibraryData();
      const target =
        library.find((b) => b.id === managerSelectedBook) || selectedBook;
      const title = target?.Title || target?.title || "Untitled";
      addActivity(`Updated "${title}" in library`);
      alert("Saved changes.");
    } catch (err) {
      console.error("Failed to save book changes", err);
      alert("Failed to save changes.");
    }
  };

  const handleSeriesCancel = () => {
    setManagerSelectedSeries(null);
    setManagerSelectedBook(null);
    clearManagerSelection();
    setSeriesForm(getSeriesFormDefaults());
  };

  const handleBookCancel = () => {
    setManagerSelectedBook(null);
    setManagerLastIndex(null);
  };

  const selectedSeriesGroup =
    managerGroups.find((g) => g.seriesKey === managerSelectedSeries) || null;
  const selectedBook = library.find((b) => b.id === managerSelectedBook) || null;
  const missingSeriesFlags = managerSelectedSeries
    ? {
        msrp: !seriesForm.msrp,
        datePurchased: !seriesForm.datePurchased && !seriesForm.dateMixed,
        publisher: !seriesForm.publisher,
        demographic: !seriesForm.demographic,
        genre: !seriesForm.genre,
      }
    : {};
  const missingBookFlags = managerSelectedBook
    ? getBookMissingFlagsFromForm({
        amountPaid: bookForm.amountPaid,
        msrp: bookForm.msrp,
        datePurchased: bookForm.datePurchased,
        publisher: selectedBook?.publisher || selectedBook?.Publisher || "",
        demographic: selectedBook?.demographic || selectedBook?.Demographic || "",
        genre: selectedBook?.genre || selectedBook?.Genre || "",
        special: bookForm.special,
        specialType: bookForm.specialType,
        specialVolumes: bookForm.specialVolumes,
        collectiblePrice: bookForm.collectiblePrice,
        pageCount: bookForm.pageCount,
      })
    : {};

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
            My Entire Statistics dashboard for my Manga. I still use Excel though.
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
            <div className="activity-log scrollable">
              {activityLog.length ? (
                activityLog.map((item, idx) => {
                  const ts = item.ts ? new Date(item.ts) : null;
                  return (
                    <div className="activity-row" key={(item.message || "activity") + idx}>
                      <span className="activity-title">{item.message}</span>
                      <span className="activity-date">
                        {ts
                          ? ts.toLocaleString(undefined, {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })
                          : ""}
                      </span>
                    </div>
                  );
                })
              ) : (
                <div className="stat-sub">No recent activity yet.</div>
              )}
            </div>
          </div>

          <div className="stat-card wide">
            <h3>Library Manager</h3>
            {!managerGroups.length ? (
              <div className="stat-sub">No library items.</div>
            ) : (
              <div className="dash-library">
                <div className="dash-library-list">
                  {managerGroups.map((group) => {
                    const readCount = group.books.filter(
                      (b) => !!b.read || b.status === "Read" || b.Read === true
                    ).length;
                    const expanded = managerExpanded.has(group.seriesKey);
                    const seriesActive =
                      managerSelectedSeries === group.seriesKey &&
                      !managerSelectedBook;
                    const sharedMissing = groupHasSharedMissing(group);
                    const bookMissing = group.books.some((b) => hasMissingManagerData(b));
                    return (
                      <div key={group.seriesKey} style={{ marginBottom: "8px" }}>
                        <button
                          type="button"
                          onClick={() => handleSeriesHeaderClick(group.seriesKey)}
                          style={{
                            width: "100%",
                            textAlign: "left",
                            background: sharedMissing ? "rgba(255,179,71,0.08)" : "transparent",
                            border: `1px solid ${
                              seriesActive
                                ? "#ff69b4"
                                : sharedMissing
                                ? "rgba(255,179,71,0.6)"
                                : "rgba(255,182,193,0.25)"
                            }`,
                            color: "#ffb6c1",
                            padding: "8px",
                            borderRadius: "8px",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "8px",
                            position: "relative",
                            boxShadow: sharedMissing
                              ? "0 0 10px rgba(255,179,71,0.5)"
                              : seriesActive
                              ? "0 0 8px rgba(255,105,180,0.5)"
                              : "none",
                          }}
                        >
                          <span
                            style={{
                              transition: "transform 0.2s ease",
                              transform: expanded ? "rotate(90deg)" : "none",
                            }}
                          >
                            {">"}
                          </span>
                          <span style={{ flex: 1 }}>{group.displayName}</span>
                          <span style={{ fontSize: "11px", color: "#f8d1d8" }}>
                            {group.books.length} book{group.books.length === 1 ? "" : "s"}
                            {group.books.length ? ` • ${readCount} read` : ""}
                          </span>
                          {bookMissing && (
                            <span
                              title="Some volumes are missing required data"
                              style={{
                                width: "12px",
                                height: "12px",
                                borderRadius: "999px",
                                background: "#ffb347",
                                border: "1px solid rgba(255,255,255,0.25)",
                                boxShadow: "0 0 10px rgba(255,179,71,0.6)",
                              }}
                            />
                          )}
                        </button>
                        <div
                          style={{
                            margin: "6px 0 10px 10px",
                            paddingLeft: "10px",
                            borderLeft: "1px solid rgba(255,182,193,0.25)",
                            display: expanded ? "block" : "none",
                          }}
                        >
                          {group.books.map((book) => {
                            const isActive = managerSelectedBook === book.id;
                            const isMulti = managerMultiSelected.has(book.id);
                            const readFlag =
                              !!book.read || book.status === "Read" || book.Read === true;
                            const missing = hasMissingManagerData(book, { ignoreShared: true });
                            return (
                              <button
                                key={book.id}
                                type="button"
                                onClick={(e) => handleBookClick(e, book.id, group.seriesKey)}
                                style={{
                                  width: "100%",
                                  textAlign: "left",
                                  background: missing
                                    ? "rgba(255,179,71,0.1)"
                                    : "transparent",
                                  border: `1px solid ${
                                    isActive
                                      ? "#ff69b4"
                                      : isMulti
                                      ? "#fff59d"
                                      : missing
                                      ? "rgba(255,179,71,0.6)"
                                      : "rgba(255,182,193,0.25)"
                                  }`,
                                  color: "#ffb6c1",
                                  padding: "8px",
                                  borderRadius: "8px",
                                  marginBottom: "6px",
                                  cursor: "pointer",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  gap: "8px",
                                  boxShadow: isActive
                                    ? "0 0 8px rgba(255,105,180,0.5)"
                                    : isMulti
                                    ? "0 0 10px rgba(255,255,180,0.65)"
                                    : missing
                                    ? "0 0 10px rgba(255,179,71,0.5)"
                                    : "none",
                                }}
                              >
                                <span style={{ flex: 1, minWidth: 0 }}>
                                  {(book.Title || book.title || "Untitled") +
                                    (readFlag ? " ?" : "")}
                                </span>
                                {missing && (
                                  <span
                                    style={{
                                      flexShrink: 0,
                                      padding: "2px 8px",
                                      borderRadius: "999px",
                                      background: "rgba(255,179,71,0.18)",
                                      border: "1px solid rgba(255,179,71,0.6)",
                                      color: "#ffd8a1",
                                      fontSize: "11px",
                                      fontWeight: 700,
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    Missing data
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  {managerGroups.length > 0 && managerMultiSelected.size > 0 && (
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                      <button
                        type="button"
                        style={{
                          padding: "6px 12px",
                          borderRadius: "999px",
                          border: "1px solid #ffb6c1",
                          background: "transparent",
                          color: "#ffb6c1",
                          cursor: "pointer",
                        }}
                        onClick={clearManagerSelection}
                      >
                        Clear Selection
                      </button>
                    </div>
                  )}
                </div>

                <div className="dash-library-details">
                  {managerMultiSelected.size > 0 && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                        padding: "10px",
                        marginBottom: "10px",
                        border: "1px dashed rgba(255,182,193,0.45)",
                        borderRadius: "10px",
                        background: "rgba(255,182,193,0.08)",
                      }}
                    >
                      <div>
                        Apply Amount Paid to {managerMultiSelected.size} selected book
                        {managerMultiSelected.size === 1 ? "" : "s"}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={bulkPaidValue}
                          onChange={(e) => setBulkPaidValue(e.target.value)}
                          style={{ maxWidth: "140px" }}
                        />
                        <button
                          type="button"
                          className="dash-btn primary"
                          onClick={handleBulkApplyPaid}
                        >
                          Apply to Selected
                        </button>
                      </div>
                    </div>
                  )}

                  {!managerSelectedSeries && !managerSelectedBook && (
                    <div className="stat-sub" style={{ marginTop: 6 }}>
                      Select a series or book to edit
                    </div>
                  )}

                  {managerSelectedSeries && !managerSelectedBook && selectedSeriesGroup && (
                    <div>
                      <div className="dash-detail-title">{selectedSeriesGroup.displayName}</div>
                      <div className="dash-detail-row">
                        <label className="inline-checkbox">
                          <input
                            ref={seriesReadRef}
                            type="checkbox"
                            checked={seriesForm.readChecked}
                            onChange={(e) =>
                              setSeriesForm((prev) => ({
                                ...prev,
                                readChecked: e.target.checked,
                                readIndeterminate: false,
                              }))
                            }
                          />
                          <span>Mark series as read</span>
                        </label>
                      </div>
                      <div className={`dash-detail-row${missingSeriesFlags.publisher ? " missing-row" : ""}`}>
                        <span>Publisher</span>
                        <input
                          type="text"
                          value={seriesForm.publisher}
                          onChange={(e) =>
                            setSeriesForm((prev) => ({
                              ...prev,
                              publisher: e.target.value,
                            }))
                          }
                          placeholder="Set publisher for series"
                        />
                      </div>
                      <div className={`dash-detail-row${missingSeriesFlags.demographic ? " missing-row" : ""}`}>
                        <span>Demographic</span>
                        <select
                          value={seriesForm.demographic}
                          onChange={(e) =>
                            setSeriesForm((prev) => ({
                              ...prev,
                              demographic: e.target.value,
                            }))
                          }
                        >
                          <option value="">Select Demographic</option>
                          <option value="Shounen">Shounen</option>
                          <option value="Seinen">Seinen</option>
                          <option value="Shoujo">Shoujo</option>
                          <option value="Josei">Josei</option>
                        </select>
                      </div>
                      <div className={`dash-detail-row${missingSeriesFlags.genre ? " missing-row" : ""}`}>
                        <span>Genre</span>
                        <input
                          type="text"
                          value={seriesForm.genre}
                          onChange={(e) =>
                            setSeriesForm((prev) => ({
                              ...prev,
                              genre: e.target.value,
                            }))
                          }
                          placeholder="Primary genre"
                        />
                      </div>
                      <div className="dash-detail-row">
                        <span>Sub-Genre</span>
                        <input
                          type="text"
                          value={seriesForm.subGenre}
                          onChange={(e) =>
                            setSeriesForm((prev) => ({
                              ...prev,
                              subGenre: e.target.value,
                            }))
                          }
                          placeholder="Secondary genre / theme"
                        />
                      </div>
                      <div className={`dash-detail-row${missingSeriesFlags.datePurchased ? " missing-row" : ""}`}>
                        <span>Date Purchased</span>
                        <input
                          type="date"
                          value={seriesForm.datePurchased}
                          onChange={(e) =>
                            setSeriesForm((prev) => ({
                              ...prev,
                              datePurchased: e.target.value,
                            }))
                          }
                        />
                        {seriesForm.dateMixed && (
                          <span className="stat-sub" style={{ marginTop: 4 }}>
                            Volumes have different purchase dates. Setting a date will overwrite all.
                          </span>
                        )}
                      </div>
                      <div className={`dash-detail-row${missingSeriesFlags.msrp ? " missing-row" : ""}`}>
                        <span>MSRP (per book)</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={seriesForm.msrp}
                          onChange={(e) =>
                            setSeriesForm((prev) => ({
                              ...prev,
                              msrp: e.target.value,
                            }))
                          }
                          placeholder="0.00"
                        />
                      </div>
                      <div className="dash-detail-actions">
                        <button
                          type="button"
                          className="dash-btn secondary"
                          onClick={handleSeriesCancel}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="dash-btn primary"
                          onClick={handleSeriesSave}
                        >
                          Save Series
                        </button>
                      </div>
                    </div>
                  )}

                  {managerSelectedBook && selectedBook && (
                    <div>
                      <div className="dash-detail-title">
                        {selectedBook.Title || selectedBook.title || "Untitled"}
                      </div>
                      <div className="dash-detail-row">
                        <label className="inline-checkbox">
                          <input
                            type="checkbox"
                            checked={!!bookForm.read}
                            onChange={(e) =>
                              setBookForm((prev) => ({
                                ...prev,
                                read: e.target.checked,
                                dateRead: e.target.checked
                                  ? prev.dateRead || new Date().toISOString().slice(0, 10)
                                  : "",
                                rating: e.target.checked ? prev.rating : "",
                              }))
                            }
                          />
                          <span>Mark as read</span>
                        </label>
                      </div>
                      <div className={`dash-detail-row${missingBookFlags.datePurchased ? " missing-row" : ""}`}>
                        <span>Date Purchased</span>
                        <input
                          type="date"
                          value={bookForm.datePurchased}
                          onChange={(e) =>
                            setBookForm((prev) => ({
                              ...prev,
                              datePurchased: e.target.value,
                            }))
                          }
                        />
                      </div>
                      {bookForm.read && (
                        <div className="dash-detail-row">
                          <span>Date Read</span>
                          <input
                            type="date"
                            value={bookForm.dateRead}
                            onChange={(e) =>
                              setBookForm((prev) => ({
                                ...prev,
                                dateRead: e.target.value,
                              }))
                            }
                          />
                        </div>
                      )}
                      <div className={`dash-detail-row${missingBookFlags.pageCount ? " missing-row" : ""}`}>
                        <span>Page Count</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={bookForm.pageCount}
                          onChange={(e) =>
                            setBookForm((prev) => ({
                              ...prev,
                              pageCount: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className={`dash-detail-row${missingBookFlags.msrp ? " missing-row" : ""}`}>
                        <span>MSRP (per book)</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={bookForm.msrp}
                          onChange={(e) =>
                            setBookForm((prev) => ({
                              ...prev,
                              msrp: e.target.value,
                            }))
                          }
                          placeholder="0.00"
                        />
                      </div>
                      {!(bookForm.special && bookForm.specialType === "collectible") && (
                        <div className={`dash-detail-row${missingBookFlags.amountPaid ? " missing-row" : ""}`}>
                          <span>Amount Paid</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={bookForm.amountPaid}
                            onChange={(e) =>
                              setBookForm((prev) => ({
                                ...prev,
                                amountPaid: e.target.value,
                              }))
                            }
                            placeholder="0.00"
                          />
                        </div>
                      )}
                      {bookForm.read && (
                        <div className="dash-detail-row">
                          <span>Star Rating</span>
                          <input
                            type="number"
                            min="0"
                            max="5"
                            step="0.5"
                            value={bookForm.rating}
                            onChange={(e) =>
                              setBookForm((prev) => ({
                                ...prev,
                                rating: e.target.value,
                              }))
                            }
                            placeholder="0-5"
                          />
                        </div>
                      )}
                      <div className={`dash-detail-row${missingBookFlags.specialType ? " missing-row" : ""}`}>
                        <label className="inline-checkbox" style={{ width: "100%" }}>
                          <input
                            type="checkbox"
                            checked={!!bookForm.special}
                            onChange={(e) =>
                              setBookForm((prev) => ({
                                ...prev,
                                special: e.target.checked,
                                specialType: e.target.checked ? prev.specialType : "",
                                specialVolumes: e.target.checked ? prev.specialVolumes : "",
                                collectiblePrice: e.target.checked ? prev.collectiblePrice : "",
                              }))
                            }
                          />
                          <span>Special?</span>
                        </label>
                      </div>
                      {bookForm.special && (
                        <>
                          <div className={`dash-detail-row${missingBookFlags.specialType ? " missing-row" : ""}`}>
                            <span>Special Type</span>
                            <select
                              value={bookForm.specialType}
                              onChange={(e) =>
                                setBookForm((prev) => ({
                                  ...prev,
                                  specialType: e.target.value,
                                  specialVolumes:
                                    e.target.value === "specialEdition" ? prev.specialVolumes : "",
                                  collectiblePrice:
                                    e.target.value === "collectible" ? prev.collectiblePrice : "",
                                }))
                              }
                            >
                              <option value="">Select type</option>
                              <option value="specialEdition">Special Edition</option>
                              <option value="collectible">Collectible</option>
                            </select>
                          </div>
                          {bookForm.specialType === "specialEdition" && (
                            <div className={`dash-detail-row${missingBookFlags.specialVolumes ? " missing-row" : ""}`}>
                              <span>Volumes Contained</span>
                              <input
                                type="number"
                                min="1"
                                step="1"
                                value={bookForm.specialVolumes}
                                onChange={(e) =>
                                  setBookForm((prev) => ({
                                    ...prev,
                                    specialVolumes: e.target.value,
                                  }))
                                }
                              />
                            </div>
                          )}
                          {bookForm.specialType === "collectible" && (
                            <div className={`dash-detail-row${missingBookFlags.collectiblePrice ? " missing-row" : ""}`}>
                              <span>Collectible Price</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={bookForm.collectiblePrice}
                                onChange={(e) =>
                                  setBookForm((prev) => ({
                                    ...prev,
                                    collectiblePrice: e.target.value,
                                  }))
                                }
                                placeholder="0.00"
                              />
                            </div>
                          )}
                        </>
                      )}
                      <div className="dash-detail-actions">
                        <button
                          type="button"
                          className="dash-btn secondary"
                          onClick={handleBookCancel}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="dash-btn primary"
                          onClick={handleBookSave}
                        >
                          Save Changes
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
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
                          onClick={() => {
                            const fullDate = new Date(
                              calendarMonth.getFullYear(),
                              calendarMonth.getMonth(),
                              cell.day
                            );
                            setCalendarModalDay({
                              dateLabel: fullDate.toLocaleDateString(undefined, {
                                month: "long",
                                day: "numeric",
                                year: "numeric",
                              }),
                              releases: cell.releases,
                            });
                          }}
                        >
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

      {calendarModalDay && (
        <div
          id="calendarOverlay"
          onClick={() => setCalendarModalDay(null)}
          style={{ zIndex: 10080 }}
        >
          <div
            id="calendarCard"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "520px" }}
          >
            <div className="calendar-header">
              <div className="calendar-title">{calendarModalDay.dateLabel}</div>
              <button
                className="calendar-close-btn"
                onClick={() => setCalendarModalDay(null)}
                type="button"
              >
                Close
              </button>
            </div>
            <div className="calendar-releases">
              {calendarModalDay.releases.map((r, idx) => (
                <div className="calendar-release" key={idx} title={r.title}>
                  {r.title}
                </div>
              ))}
            </div>
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
