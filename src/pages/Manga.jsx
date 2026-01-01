// src/pages/Manga.jsx
import React, { useEffect, useMemo, useState } from "react";
import "../styles/manga.css";
import { db } from "../firebaseConfig";
import {
  collection,
  getDocs,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { useAuth } from "../contexts/AuthContext";
import SuggestionModal from "../components/SuggestionModal.jsx";
import { recordActivity } from "../utils/activity";

const SUGGESTION_LIMIT = 5;
const SUGGESTION_WINDOW_MS = 60 * 60 * 1000;
const SUGGESTION_STORAGE_KEY = "mangaSuggestionsSent";
const VIEW_MODE_STORAGE_KEY = "mangaViewMode";

// ---- Helpers to match your old index.html logic ----

// Parse "Series Name, Vol. 1" -> { name: "series name", vol: 1 }
function parseTitleForSort(title) {
  let t = (title || "").trim();
  const m = t.match(
    /^(.*?)(?:,?\s*(?:Vol\.|Volume)\s*(\d+)(?:\s*[--]\s*\d+)?\s*)?(?:\s*\([^)]*\))?$/i
  );
  const base = m ? m[1].trim().toLowerCase() : t.toLowerCase();
  const volNum = m && m[2] ? parseInt(m[2], 10) : 0;
  return {
    name: base,
    vol: Number.isFinite(volNum) ? volNum : 0,
  };
}

// Generic numeric parser for money & pages
function toNumber(val) {
  if (typeof val === "number") return val;
  if (val == null) return 0;
  const cleaned = String(val).replace(/[^0-9.-]/g, "");
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function parseIntSafe(val) {
  if (typeof val === "number") return val;
  if (val == null || val === "") return 0;
  const num = parseInt(val, 10);
  return Number.isFinite(num) ? num : 0;
}

function getLocalDateISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isMissingPageCount(book) {
  const raw = book?.pageCount ?? book?.PageCount ?? "";
  const str = String(raw ?? "").trim();
  if (!str) return true;
  const num = parseIntSafe(str);
  return !Number.isFinite(num) || num <= 0;
}

function isMissingValue(val, allowUnknown = false) {
  const str = (val ?? "").toString().trim();
  if (!str) return true;
  if (!allowUnknown && str.toLowerCase() === "unknown") return true;
  return false;
}

function isMissingCoreMeta(book, options = {}) {
  const includeIsbn = options.includeIsbn ?? false;
  const includeFinance = options.includeFinance ?? false;
  const isCollectible =
    (book?.specialType || "").toLowerCase() === "collectible" ||
    (book?.SpecialType || "").toLowerCase() === "collectible";
  const authorMissing = isMissingValue(book?.authors);
  const publisherMissing = isMissingValue(book?.publisher);
  const dateMissing = isMissingValue(book?.date);
  const isbnMissing = includeIsbn ? isMissingValue(book?.isbn) : false;
  const amountMissing =
    includeFinance && !isCollectible ? isMissingValue(book?.amountPaid) : false;
  const collectibleMissing =
    includeFinance && isCollectible ? isMissingValue(book?.collectiblePrice) : false;
  const msrpMissing = includeFinance ? isMissingValue(book?.msrp ?? book?.MSRP) : false;
  const purchaseMissing = includeFinance ? isMissingValue(book?.datePurchased) : false;
  return {
    authorMissing,
    publisherMissing,
    dateMissing,
    isbnMissing,
    amountMissing,
    collectibleMissing,
    msrpMissing,
    purchaseMissing,
    any:
      authorMissing ||
      publisherMissing ||
      dateMissing ||
      isbnMissing ||
      amountMissing ||
      collectibleMissing ||
      msrpMissing ||
      purchaseMissing,
  };
}

function normalizeDateString(value) {
  if (!value) return "";
  const trimmed = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return "";
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, "0");
  const d = String(parsed.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const compareByTitleVol = (a, b) => {
  const aP = parseTitleForSort(a.title || "");
  const bP = parseTitleForSort(b.title || "");
  const cmp = aP.name.localeCompare(bP.name);
  return cmp !== 0 ? cmp : aP.vol - bP.vol;
};

function formatDateLong(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

// Extract volume numbers from titles, expanding ranges like "Vol. 1-2" -> [1,2]
function extractVolumesFromTitle(title) {
  const text = title || "";
  const match = text.match(/vol(?:ume)?\.?\s*(\d+)(?:\s*[-–—]\s*(\d+))?/i);
  if (!match) return [];
  const start = parseInt(match[1], 10);
  const end = match[2] ? parseInt(match[2], 10) : start;
  if (!Number.isFinite(start)) return [];
  const safeEnd = Number.isFinite(end) && end >= start ? end : start;
  const vols = [];
  for (let v = start; v <= safeEnd; v += 1) vols.push(v);
  return vols;
}

// ---- Stats computation (React version of your old dashboard) ----

function computeMangaStats(library, wishlist) {
  const totalLibrary = library.length;
  const totalWishlist = wishlist.length;
  const totalBooks = totalLibrary + totalWishlist;

  const readBooks = library.filter((b) => b.read).length;
  const unreadBooks = totalLibrary - readBooks;
  const readPct = totalLibrary ? Math.round((readBooks / totalLibrary) * 100) : 0;

  // Money
  let paidTotal = 0;
  let msrpTotal = 0;
  let collectibleTotal = 0;
  library.forEach((b) => {
    paidTotal += toNumber(b.amountPaid);
    msrpTotal += toNumber(b.msrp);
    collectibleTotal += toNumber(b.collectiblePrice);
  });

  // Pages
  let pagesTotal = 0;
  let pagesRead = 0;
  library.forEach((b) => {
    const pages = parseIntSafe(b.pageCount);
    pagesTotal += pages;
    if (b.read) pagesRead += pages;
  });

  // Ratings
  const ratingBuckets = {
    "5": 0,
    "4.5": 0,
    "4": 0,
    "3.5": 0,
    "3": 0,
    "2.5": 0,
    "2": 0,
    "1.5": 0,
    "1": 0,
    "0.5": 0,
  };
  let ratingSum = 0;
  let ratingCount = 0;

  library.forEach((b) => {
    const r = b.rating == null || b.rating === "" ? NaN : parseFloat(b.rating);
    if (!Number.isFinite(r) || r <= 0) return;
    const clipped = Math.max(0.5, Math.min(5, r));
    const key = String(Math.round(clipped * 2) / 2);
    if (ratingBuckets[key] != null) {
      ratingBuckets[key] += 1;
    }
    ratingSum += clipped;
    ratingCount += 1;
  });

  const avgRating = ratingCount ? ratingSum / ratingCount : 0;

  // Monthly reads (last 12 months)
  const now = new Date();
  const months = [];
  for (let i = 11; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    months.push({
      key,
      label: d.toLocaleString(undefined, { month: "short" }),
      count: 0,
    });
  }
  const monthIndex = Object.fromEntries(months.map((m, idx) => [m.key, idx]));

  library.forEach((b) => {
    if (!b.dateRead) return;
    const key = b.dateRead.slice(0, 7); // YYYY-MM
    const idx = monthIndex[key];
    if (idx != null) {
      months[idx].count += 1;
    }
  });

  // Top publishers
  const publisherCounts = {};
  library.forEach((b) => {
    const p = (b.publisher || "").trim();
    if (!p) return;
    publisherCounts[p] = (publisherCounts[p] || 0) + 1;
  });
  const topPublishers = Object.entries(publisherCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  return {
    totalBooks,
    totalLibrary,
    totalWishlist,
    readBooks,
    unreadBooks,
    readPct,
    paidTotal,
    msrpTotal,
    collectibleTotal,
    pagesTotal,
    pagesRead,
    avgRating,
    ratingBuckets,
    months,
    topPublishers,
  };
}

// ---- Dashboard component ----

function MangaDashboard({ library, wishlist }) {
  const stats = useMemo(() => computeMangaStats(library, wishlist), [library, wishlist]);

  if (!stats.totalBooks) {
    return (
      <div className="manga-empty-state">
        No manga loaded yet. Once your Firestore library &amp; wishlist are pulled in, this
        dashboard will light up.
      </div>
    );
  }

  const maxRatingCount = Math.max(...Object.values(stats.ratingBuckets), 1);
  const maxPublisherCount =
    stats.topPublishers.length > 0
      ? Math.max(...stats.topPublishers.map((p) => p.count), 1)
      : 1;
  const maxMonthCount =
    stats.months.length > 0 ? Math.max(...stats.months.map((m) => m.count), 1) : 1;

  return (
    <div className="manga-dashboard">
      <div className="manga-dashboard-grid">
        {/* Block 1: Totals + Read % pie */}
        <div className="manga-stat-card">
          <div className="manga-stat-header">
            <div>
              <div className="manga-stat-label">Collection</div>
              <div className="manga-stat-value">{stats.totalBooks}</div>
            </div>
            <div className="manga-stat-sub">
              Library: {stats.totalLibrary}  |  Wishlist: {stats.totalWishlist}
            </div>
          </div>
          <div className="manga-pie-wrap">
            <div
              className="manga-pie"
              style={{ "--pct": stats.readPct }}
            >
              <div className="manga-pie-label">{stats.readPct}% read</div>
            </div>
            <div className="manga-stat-sub">
              <strong>{stats.readBooks}</strong> read  | {" "}
              <strong>{stats.unreadBooks}</strong> unread in your library.
              <br />
              Perfect for tracking backlog vs progress.
            </div>
          </div>
        </div>

        {/* Block 2: Money + pages */}
        <div className="manga-stat-card">
          <div className="manga-stat-header">
            <div>
              <div className="manga-stat-label">Spending &amp; Pages</div>
              <div className="manga-stat-value">
                ${stats.paidTotal.toFixed(0)}
              </div>
            </div>
            <div className="manga-stat-sub">
              Pages owned: {stats.pagesTotal.toLocaleString()}  |  Read:{" "}
              {stats.pagesRead.toLocaleString()}
            </div>
          </div>
          <div className="manga-stat-sub">
            MSRP (if set): ${stats.msrpTotal.toFixed(0)}  |  Collectible value: $
            {stats.collectibleTotal.toFixed(0)}
            <br />
            Avg rating:{" "}
            {stats.avgRating ? stats.avgRating.toFixed(2) : "N/A"}{" "}
            / 10
          </div>
        </div>

        {/* Block 3: Monthly reads chart */}
        <div className="manga-stat-card">
          <div className="manga-stat-header">
            <div>
              <div className="manga-stat-label">Reading Pace</div>
              <div className="manga-stat-value">
                {stats.months.reduce((sum, m) => sum + m.count, 0)}
              </div>
            </div>
            <div className="manga-stat-sub">
              Volumes finished in the last 12 months
            </div>
          </div>
          <div className="manga-bar-chart">
            {stats.months.map((m) => (
              <div key={m.key} className="manga-bar">
                <div
                  className="manga-bar-fill"
                  style={{
                    height: `${(m.count / maxMonthCount) * 100 || 0}%`,
                  }}
                />
                <div className="manga-bar-label">{m.label}</div>
                {m.count > 0 && (
                  <div className="manga-bar-value">{m.count}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Second row: rating distribution + top publishers */}
      <div
        className="manga-dashboard-grid"
        style={{ marginTop: "14px", gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1.7fr)" }}
      >
        <div className="manga-stat-card">
          <div className="manga-stat-header">
            <div>
              <div className="manga-stat-label">Ratings</div>
              <div className="manga-stat-value">
                {Object.values(stats.ratingBuckets).reduce((s, v) => s + v, 0)}
              </div>
            </div>
            <div className="manga-stat-sub">How you've scored your volumes</div>
          </div>
          <div className="manga-bar-chart">
            {Object.entries(stats.ratingBuckets)
              .sort((a, b) => Number(b[0]) - Number(a[0]))
              .map(([score, count]) => (
                <div key={score} className="manga-bar">
                  <div
                    className="manga-bar-fill"
                    style={{ height: `${(count / maxRatingCount) * 100 || 0}%` }}
                  />
                  <div className="manga-bar-label">{score}</div>
                  {count > 0 && (
                    <div className="manga-bar-value">{count}</div>
                  )}
                </div>
              ))}
          </div>
        </div>

        <div className="manga-stat-card">
          <div className="manga-stat-header">
            <div>
              <div className="manga-stat-label">Top Publishers</div>
              <div className="manga-stat-value">
                {stats.topPublishers.reduce((s, p) => s + p.count, 0)}
              </div>
            </div>
            <div className="manga-stat-sub">Most common publishers in your library</div>
          </div>
          {stats.topPublishers.length === 0 ? (
            <div className="manga-stat-sub">
              No publisher data yet - add some volumes first.
            </div>
          ) : (
            <div className="manga-bar-chart">
              {stats.topPublishers.map((p) => (
                <div key={p.name} className="manga-bar">
                  <div
                    className="manga-bar-fill"
                    style={{
                      height: `${(p.count / maxPublisherCount) * 100 || 0}%`,
                    }}
                  />
                  <div className="manga-bar-label">
                    {p.name.length > 8 ? `${p.name.slice(0, 8)}...` : p.name}
                  </div>
                  <div className="manga-bar-value">{p.count}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Main page ----

export default function Manga() {
  const { admin, user, role } = useAuth();
  const isAdmin = admin;
  const logActivity = (message, extra = {}) => {
    if (!message) return;
    recordActivity(message, {
      email: user?.email || "anonymous",
      name: user?.displayName || "",
      context: "Manga",
      ...extra,
    });
  };

  const [activeTab, setActiveTab] = useState("library"); // 'library' | 'wishlist'
  const [viewMode, setViewMode] = useState(() => {
    if (typeof window === "undefined") return "series";
    const stored = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    return stored === "individual" ? "individual" : "series";
  }); // 'series' | 'individual'
  useEffect(() => {
    setSuggestionStatus("");
  }, [user]);
  useEffect(() => {
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
    } catch (err) {
      console.warn("Failed to persist manga view mode", err);
    }
  }, [viewMode]);

  const submitSuggestion = async () => {
    const now = Date.now();
    const persisted = (() => {
      try {
        const raw = localStorage.getItem(SUGGESTION_STORAGE_KEY);
        return Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [];
      } catch {
        return [];
      }
    })();
    const recent = persisted.filter((t) => now - t < SUGGESTION_WINDOW_MS);
    if (recent.length >= SUGGESTION_LIMIT) {
      setSuggestionStatus("Rate limit: please wait a bit (max 5 suggestions per hour).");
      return;
    }
    if (!suggestionText.trim()) {
      setSuggestionStatus("Please enter a manga title or note before sending.");
      return;
    }
    setSuggestionSending(true);
    setSuggestionStatus("");
    try {
      const content = `**Manga Suggestion**\n${suggestionText.trim()}\nFrom: ${user?.displayName || user?.email || user?.uid || "anonymous user"}`;

      await addDoc(collection(db, "suggestions"), {
        content: suggestionText.trim(),
        type: "manga",
        from: user?.displayName || user?.email || user?.uid || "anonymous user",
        createdAt: new Date().toISOString(),
      });

      setSuggestionStatus("Sent! I'll review your suggestion soon.");
      setSuggestionText("");
      const updated = [...recent, now].slice(-SUGGESTION_LIMIT);
      localStorage.setItem(SUGGESTION_STORAGE_KEY, JSON.stringify(updated));
    } catch (err) {
      console.error("Failed to send suggestion", err);
      setSuggestionStatus("Failed to send suggestion. Please try again later.");
    } finally {
      setSuggestionSending(false);
    }
  };

  const [library, setLibrary] = useState([]);
  const [wishlist, setWishlist] = useState([]);
  const [titleSuggestions, setTitleSuggestions] = useState([]);
  const [titleMatches, setTitleMatches] = useState([]);
  const [showHidden, setShowHidden] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [searchLibrary, setSearchLibrary] = useState("");
  const [searchWishlist, setSearchWishlist] = useState("");

  const [multiMode, setMultiMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  // Defer seriesModal to avoid temporal dead-zone; re-check later after it's declared.
  useEffect(() => {
    if (viewMode === "series" && multiMode) {
      // If not inside the series modal, exit multi-select (series cards don't support selection)
      const shouldReset = typeof seriesModal === "undefined" || seriesModal === null;
      if (shouldReset) {
        setMultiMode(false);
        setSelectedIds(new Set());
      }
    }
  }, [viewMode, multiMode]);

  const [adminForm, setAdminForm] = useState({
    open: false,
    mode: "add",
    list: "library",
    data: {
      title: "",
      authors: "",
      publisher: "",
      demographic: "",
      genre: "",
      subGenre: "",
      date: "",
      cover: "",
      isbn: "",
      pageCount: "",
      rating: "",
      amountPaid: "",
      dateRead: "",
      datePurchased: "",
      msrp: "",
      special: false,
      specialType: "",
      specialVolumes: "",
      collectiblePrice: "",
      amazonURL: "",
      read: false,
    },
    editingId: null,
    multiAdd: false,
    startVol: "",
    endVol: "",
  });
  const [volumeEntries, setVolumeEntries] = useState([]);
  const [volumeIndex, setVolumeIndex] = useState(0);
  const adminMissing = useMemo(() => {
    const isLib = adminForm.list === "library";
    const isCollectible =
      isLib && adminForm.data.special && adminForm.data.specialType === "collectible";
    const amountVisible = isLib && !isCollectible;
    return {
      author: isMissingValue(adminForm.data.authors),
      publisher: isMissingValue(adminForm.data.publisher),
      date: isMissingValue(adminForm.data.date),
      purchaseDate: isLib ? isMissingValue(adminForm.data.datePurchased) : false,
      page: isMissingPageCount({ pageCount: adminForm.data.pageCount }),
      isbn: isLib ? isMissingValue(adminForm.data.isbn) : false,
      amountPaid: amountVisible ? isMissingValue(adminForm.data.amountPaid) : false,
      collectiblePrice: isCollectible ? isMissingValue(adminForm.data.collectiblePrice) : false,
      msrp: isLib ? isMissingValue(adminForm.data.msrp) : false,
    };
  }, [adminForm.data, adminForm.list]);
  const [bulkEdit, setBulkEdit] = useState({
    open: false,
    index: 0,
    items: [], // [{id, kind, data}]
  });
  const [suggestionOpen, setSuggestionOpen] = useState(false);
  const [suggestionText, setSuggestionText] = useState("");
  const [suggestionStatus, setSuggestionStatus] = useState("");
  const [suggestionSending, setSuggestionSending] = useState(false);
  const [modalBook, setModalBook] = useState(null);
  const [seriesModal, setSeriesModal] = useState(null); // { series, volumes[] }

  useEffect(() => {
    const baseTitle = "Manga | Library";
    if (!isAdmin) {
      document.title = baseTitle;
      return;
    }
    const countMissing = [...library, ...wishlist].reduce((acc, item) => {
      const missingPage = isMissingPageCount(item);
      const metaMissing = isMissingCoreMeta(item, {
        includeIsbn: item.kind === "library",
        includeFinance: item.kind === "library",
      });
      return acc + (missingPage || metaMissing.any ? 1 : 0);
    }, 0);
    document.title = countMissing > 0 ? `(${countMissing}) ${baseTitle}` : baseTitle;
  }, [isAdmin, library, wishlist]);

  // Lock page scroll when any modal is open
  useEffect(() => {
    const hasModal =
      !!modalBook ||
      !!seriesModal ||
      adminForm.open ||
      bulkEdit.open ||
      suggestionOpen;
    if (hasModal) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
    return undefined;
  }, [
    modalBook,
    seriesModal,
    adminForm.open,
    bulkEdit.open,
    suggestionOpen
  ]);

  const canSuggest = !!user && role === "viewer";

  // ----- Firestore loading -----

  async function loadLibrary() {
    const snap = await getDocs(collection(db, "library"));
    const items = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      items.push({
        id: docSnap.id,
        title: data.title || "",
        authors: data.authors || "Unknown",
        publisher: data.publisher || "Unknown",
        demographic: data.demographic || "",
        genre: data.genre || "",
        subGenre: data.subGenre || "",
        date: normalizeDateString(data.date) || data.date || "Unknown",
        cover: data.cover || "",
        isbn: data.isbn || "",
        pageCount:
          data.pageCount !== undefined && data.pageCount !== null
            ? data.pageCount
            : "",
        rating:
          data.rating !== undefined && data.rating !== null ? data.rating : "",
        amountPaid:
          data.amountPaid !== undefined && data.amountPaid !== null
            ? data.amountPaid
            : "",
        dateRead: normalizeDateString(data.dateRead) || data.dateRead || "",
        datePurchased: normalizeDateString(data.datePurchased) || data.datePurchased || "",
        msrp:
          data.msrp !== undefined && data.msrp !== null ? data.msrp : "",
        specialType: data.specialType || "",
        specialVolumes:
          data.specialVolumes !== undefined && data.specialVolumes !== null
            ? data.specialVolumes
            : "",
        collectiblePrice:
          data.collectiblePrice !== undefined &&
          data.collectiblePrice !== null
            ? data.collectiblePrice
            : "",
        read: !!data.read,
        amazonURL: data.amazonURL || "",
        hidden: !!data.hidden,
        kind: "library",
      });
    });

    // Match your old sorting: series name + volume number
    items.sort((a, b) => {
      const aP = parseTitleForSort(a.title);
      const bP = parseTitleForSort(b.title);
      const cmp = aP.name.localeCompare(bP.name);
      return cmp !== 0 ? cmp : aP.vol - bP.vol;
    });

    setLibrary(items);
    setTitleSuggestions((prev) => {
      const all = new Set(prev);
      items.forEach((i) => all.add(i.title || ""));
      return Array.from(all).filter(Boolean).sort();
    });
  }

  async function loadWishlist() {
    const snap = await getDocs(collection(db, "wishlist"));
    const items = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      items.push({
        id: docSnap.id,
        title: data.title || "",
        authors: data.authors || "Unknown",
        publisher: data.publisher || "Unknown",
        date: normalizeDateString(data.date) || data.date || "Unknown",
        cover: data.cover || "",
        isbn: data.isbn || "",
        pageCount:
          data.pageCount !== undefined && data.pageCount !== null
            ? data.pageCount
            : "",
        rating:
          data.rating !== undefined && data.rating !== null ? data.rating : "",
        amountPaid:
          data.amountPaid !== undefined && data.amountPaid !== null
            ? data.amountPaid
            : "",
        datePurchased: normalizeDateString(data.datePurchased) || data.datePurchased || "",
        specialType: data.specialType || "",
        specialVolumes:
          data.specialVolumes !== undefined && data.specialVolumes !== null
            ? data.specialVolumes
            : "",
        collectiblePrice:
          data.collectiblePrice !== undefined &&
          data.collectiblePrice !== null
            ? data.collectiblePrice
            : "",
        amazonURL: data.amazonURL || "",
        hidden: !!data.hidden,
        kind: "wishlist",
      });
    });

    items.sort((a, b) => {
      const aP = parseTitleForSort(a.title);
      const bP = parseTitleForSort(b.title);
      const cmp = aP.name.localeCompare(bP.name);
      return cmp !== 0 ? cmp : aP.vol - bP.vol;
    });

    setWishlist(items);
    setTitleSuggestions((prev) => {
      const all = new Set(prev);
      items.forEach((i) => all.add(i.title || ""));
      return Array.from(all).filter(Boolean).sort();
    });
  }

  useEffect(() => {
    let cancelled = false;
    let libraryLoaded = false;
    let wishlistLoaded = false;

    const loadOffline = async () => {
      if (cancelled) return;
      try {
        const base = import.meta.env.BASE_URL || "/";
        const res = await fetch(`${base}manga-library-wishlist.json`, { cache: "no-cache" });
        if (!res.ok) throw new Error("fallback fetch failed");
        const json = await res.json();
        const lib = Array.isArray(json.library) ? json.library : [];
        const wish = Array.isArray(json.wishlist) ? json.wishlist : [];
        setLibrary(
          lib.map((data, idx) => ({
            id: data.id || `offline-lib-${idx}`,
            title: data.title || "",
            authors: data.authors || "Unknown",
            publisher: data.publisher || "Unknown",
          demographic: data.demographic || "",
          genre: data.genre || "",
          subGenre: data.subGenre || "",
          date: normalizeDateString(data.date) || data.date || "Unknown",
          cover: data.cover || "",
          isbn: data.isbn || "",
          pageCount: data.pageCount ?? "",
          rating: data.rating ?? "",
          amountPaid: data.amountPaid ?? "",
          dateRead: normalizeDateString(data.dateRead) || data.dateRead || "",
          datePurchased: normalizeDateString(data.datePurchased) || data.datePurchased || "",
          msrp: data.msrp ?? "",
          specialType: data.specialType || "",
          specialVolumes: data.specialVolumes ?? "",
          collectiblePrice: data.collectiblePrice ?? "",
          amazonURL: data.amazonURL || "",
            read: !!data.read,
            hidden: !!data.hidden,
            kind: "library",
          }))
        );
        setWishlist(
          wish.map((data, idx) => ({
            id: data.id || `offline-wish-${idx}`,
            title: data.title || "",
            authors: data.authors || "Unknown",
          publisher: data.publisher || "Unknown",
          demographic: data.demographic || "",
          genre: data.genre || "",
          subGenre: data.subGenre || "",
          date: normalizeDateString(data.date) || data.date || "Unknown",
          cover: data.cover || "",
          isbn: data.isbn || "",
          pageCount: data.pageCount ?? "",
          rating: data.rating ?? "",
          amountPaid: data.amountPaid ?? "",
          dateRead: normalizeDateString(data.dateRead) || data.dateRead || "",
          datePurchased: normalizeDateString(data.datePurchased) || data.datePurchased || "",
          msrp: data.msrp ?? "",
          specialType: data.specialType || "",
          specialVolumes: data.specialVolumes ?? "",
          collectiblePrice: data.collectiblePrice ?? "",
          amazonURL: data.amazonURL || "",
            read: !!data.read,
            hidden: !!data.hidden,
            kind: "wishlist",
          }))
        );
        setError("");
      } catch (fallbackErr) {
        console.error("Offline fallback failed", fallbackErr);
        setError("Failed to load manga data from Firestore.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const markLoaded = () => {
      if (libraryLoaded && wishlistLoaded && !cancelled) {
        setLoading(false);
      }
    };

    setLoading(true);
    setError("");

    const unsubLibrary = onSnapshot(
      collection(db, "library"),
      (snap) => {
        if (cancelled) return;
        const items = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data();
          items.push({
            id: docSnap.id,
            title: data.title || "",
            authors: data.authors || "Unknown",
            publisher: data.publisher || "Unknown",
            demographic: data.demographic || "",
            genre: data.genre || "",
            subGenre: data.subGenre || "",
            date: data.date || "Unknown",
            cover: data.cover || "",
            isbn: data.isbn || "",
            pageCount:
              data.pageCount !== undefined && data.pageCount !== null
                ? data.pageCount
                : "",
            rating:
              data.rating !== undefined && data.rating !== null ? data.rating : "",
            amountPaid:
              data.amountPaid !== undefined && data.amountPaid !== null
                ? data.amountPaid
                : "",
            dateRead: data.dateRead || "",
            datePurchased: data.datePurchased || "",
            msrp:
              data.msrp !== undefined && data.msrp !== null ? data.msrp : "",
            specialType: data.specialType || "",
            specialVolumes:
              data.specialVolumes !== undefined && data.specialVolumes !== null
                ? data.specialVolumes
                : "",
            collectiblePrice:
              data.collectiblePrice !== undefined &&
              data.collectiblePrice !== null
                ? data.collectiblePrice
                : "",
            read: !!data.read,
            amazonURL: data.amazonURL || "",
            hidden: !!data.hidden,
            kind: "library",
          });
        });

        items.sort((a, b) => {
          const aP = parseTitleForSort(a.title);
          const bP = parseTitleForSort(b.title);
          const cmp = aP.name.localeCompare(bP.name);
          return cmp !== 0 ? cmp : aP.vol - bP.vol;
        });

        setLibrary(items);
        setTitleSuggestions((prev) => {
          const all = new Set(prev);
          items.forEach((i) => all.add(i.title || ""));
          return Array.from(all).filter(Boolean).sort();
        });
        libraryLoaded = true;
        markLoaded();
      },
      async (err) => {
        console.error("Library listener failed", err);
        if (!cancelled) {
          setError("Failed to load manga data from Firestore.");
          await loadOffline();
        }
      }
    );

    const unsubWishlist = onSnapshot(
      collection(db, "wishlist"),
      (snap) => {
        if (cancelled) return;
        const items = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data();
          items.push({
            id: docSnap.id,
            title: data.title || "",
            authors: data.authors || "Unknown",
            publisher: data.publisher || "Unknown",
            demographic: data.demographic || "",
            genre: data.genre || "",
            subGenre: data.subGenre || "",
            date: data.date || "Unknown",
            cover: data.cover || "",
            isbn: data.isbn || "",
            pageCount:
              data.pageCount !== undefined && data.pageCount !== null
                ? data.pageCount
                : "",
            rating:
              data.rating !== undefined && data.rating !== null ? data.rating : "",
            amountPaid:
              data.amountPaid !== undefined && data.amountPaid !== null
                ? data.amountPaid
                : "",
            datePurchased: data.datePurchased || "",
            specialType: data.specialType || "",
            specialVolumes:
              data.specialVolumes !== undefined && data.specialVolumes !== null
                ? data.specialVolumes
                : "",
            collectiblePrice:
              data.collectiblePrice !== undefined &&
              data.collectiblePrice !== null
                ? data.collectiblePrice
                : "",
            amazonURL: data.amazonURL || "",
            hidden: !!data.hidden,
            kind: "wishlist",
          });
        });

        items.sort((a, b) => {
          const aP = parseTitleForSort(a.title);
          const bP = parseTitleForSort(b.title);
          const cmp = aP.name.localeCompare(bP.name);
          return cmp !== 0 ? cmp : aP.vol - bP.vol;
        });

        setWishlist(items);
        setTitleSuggestions((prev) => {
          const all = new Set(prev);
          items.forEach((i) => all.add(i.title || ""));
          return Array.from(all).filter(Boolean).sort();
        });
        wishlistLoaded = true;
        markLoaded();
      },
      async (err) => {
        console.error("Wishlist listener failed", err);
        if (!cancelled) {
          setError("Failed to load manga data from Firestore.");
          await loadOffline();
        }
      }
    );

    return () => {
      cancelled = true;
      unsubLibrary?.();
      unsubWishlist?.();
    };
  }, [user]);

  // ----- Filtered lists -----

  const filteredLibrary = useMemo(() => {
    const q = searchLibrary.trim().toLowerCase();
    if (!q) return library;
    return library.filter((b) => {
      const searchText = [
        b.title,
        b.authors,
        b.publisher,
        b.isbn,
        b.date,
        String(b.pageCount ?? ""),
      ]
        .join(" ")
        .toLowerCase();
      return searchText.includes(q);
    });
  }, [library, searchLibrary]);

  const visibleLibrary = useMemo(() => {
    if (isAdmin && showHidden) return filteredLibrary;
    return filteredLibrary.filter((b) => !b.hidden);
  }, [filteredLibrary, isAdmin, showHidden]);

  const filteredWishlist = useMemo(() => {
    const q = searchWishlist.trim().toLowerCase();
    if (!q) return wishlist;
    return wishlist.filter((b) => {
      const searchText = [
        b.title,
        b.authors,
        b.publisher,
        b.isbn,
        b.date,
        String(b.pageCount ?? ""),
      ]
        .join(" ")
        .toLowerCase();
      return searchText.includes(q);
    });
  }, [wishlist, searchWishlist]);

  const visibleWishlist = useMemo(() => {
    if (isAdmin && showHidden) return filteredWishlist;
    return filteredWishlist.filter((b) => !b.hidden);
  }, [filteredWishlist, isAdmin, showHidden]);


  const changeViewMode = (mode) => {
    const next = mode === "individual" ? "individual" : "series";
    setViewMode(next);
    setSelectedIds(new Set());
    setMultiMode(false);
  };

  const applyWriteResults = (results) => {
    if (!results?.length) return;
    const applyToList = (list, target) => {
      let next = [...list];
      results
        .filter((r) => r.target === target)
        .forEach((r) => {
          const idx = next.findIndex((i) => i.id === r.id);
          const merged = { ...(idx >= 0 ? next[idx] : {}), ...r.payload, id: r.id, kind: target };
          if (idx >= 0) next[idx] = merged;
          else next.push(merged);
        });
      next.sort(compareByTitleVol);
      return next;
    };
    setLibrary((prev) => applyToList(prev, "library"));
    setWishlist((prev) => applyToList(prev, "wishlist"));
  };

  const toggleSeriesMultiMode = (volumes) => {
    setMultiMode((prev) => {
      const next = !prev;
      if (next) {
        const allowed = new Set((volumes || []).map((v) => v.id));
        setSelectedIds((cur) => new Set([...cur].filter((id) => allowed.has(id))));
      } else {
        setSelectedIds(new Set());
      }
      return next;
    });
  };

  // ----- Multi-select -----

  function toggleMultiMode() {
    if (!isAdmin) return;
    setMultiMode((prev) => {
      if (prev) {
        // Exiting multi-mode clears selection
        return false;
      }
      return true;
    });
    setSelectedIds(new Set());
  }

  function toggleCardSelection(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function applyMultiAction(action, targetOverride = null) {
    if (!isAdmin) {
      alert("Multi-select actions require admin access.");
      return;
    }
    const ids = Array.from(selectedIds);
    if (!ids.length) {
      alert("Select at least one item first.");
      return;
    }

    const source = activeTab === "library" ? "library" : "wishlist";
    const destination = targetOverride
      ? targetOverride
      : source === "library"
        ? "wishlist"
        : "library";
    const isLibraryTab = source === "library";

    try {
      if (action === "move") {
        const sourceList = source === "library" ? library : wishlist;
        if (
          !window.confirm(
            `Move ${ids.length} item(s) from ${source === "library" ? "Library" : "Wishlist"} to ${
              destination === "library" ? "Library" : "Wishlist"
            }?`
          )
        )
          return;
        for (const id of ids) {
          const item = sourceList.find((x) => x.id === id);
          if (!item) continue;
          const payload =
            destination === "library"
              ? {
                  title: item.title,
                  authors: item.authors,
                  publisher: item.publisher,
                  date: item.date,
                  pageCount: item.pageCount || "",
                  cover: item.cover,
                  amountPaid: "",
                  read: false,
                  rating: "",
                  msrp: "",
                  collectiblePrice: "",
                  specialType: "",
                  specialVolumes: "",
                  isbn: item.isbn || "",
                  demographic: item.demographic || "",
                  genre: item.genre || "",
                  subGenre: item.subGenre || "",
                  hidden: !!item.hidden,
                  datePurchased: item.datePurchased || "",
                  dateRead: item.dateRead || "",
                }
              : {
                  title: item.title,
                  authors: item.authors,
                  publisher: item.publisher,
                  date: item.date,
                  pageCount: item.pageCount || "",
                  cover: item.cover,
                  amazonURL: item.amazonURL || "",
                  hidden: !!item.hidden,
                  datePurchased: "",
                  read: false,
                  rating: "",
                  msrp: "",
                  collectiblePrice: "",
                  specialType: "",
                  specialVolumes: "",
                  isbn: "",
                  demographic: "",
                  genre: "",
                  subGenre: "",
                };
          if (destination === "library" && (payload.msrp === "" || payload.msrp === null)) {
            const inherited = getSeriesMsrp(item);
            if (inherited !== "" && inherited !== null && inherited !== undefined) {
              payload.msrp = inherited;
            }
          }
          await addDoc(collection(db, destination), payload);
          await deleteDoc(doc(db, source, id));
        }
        logActivity(
          `Moved ${ids.length} item${ids.length === 1 ? "" : "s"} from ${
            source === "library" ? "Library" : "Wishlist"
          } to ${destination === "library" ? "Library" : "Wishlist"}`,
          {
            action: "move",
            list: source === "library" ? "Library" : "Wishlist",
            details: { count: ids.length, from: source, to: destination },
          }
        );
      } else if (action === "markRead" && isLibraryTab) {
        for (const id of ids) {
          await updateDoc(doc(db, "library", id), {
            read: true,
            dateRead: getLocalDateISO(),
          });
        }
        logActivity(`Marked ${ids.length} library book${ids.length === 1 ? "" : "s"} as read`, {
          action: "markRead",
          list: "Library",
          details: { count: ids.length },
        });
      } else if (action === "markUnread" && isLibraryTab) {
        for (const id of ids) {
          await updateDoc(doc(db, "library", id), {
            read: false,
            dateRead: "",
            rating: "",
          });
        }
        logActivity(`Marked ${ids.length} library book${ids.length === 1 ? "" : "s"} as unread`, {
          action: "markUnread",
          list: "Library",
          details: { count: ids.length },
        });
      } else if (action === "delete") {
        const colName = isLibraryTab ? "library" : "wishlist";
        if (
          !window.confirm(
            `Delete ${ids.length} item(s) from ${isLibraryTab ? "Library" : "Wishlist"}?`
          )
        )
          return;
        for (const id of ids) {
          await deleteDoc(doc(db, colName, id));
        }
        logActivity(
          `Deleted ${ids.length} item${ids.length === 1 ? "" : "s"} from ${
            colName === "library" ? "Library" : "Wishlist"
          }`,
          {
            action: "delete-multi",
            list: colName === "library" ? "Library" : "Wishlist",
            details: { count: ids.length },
          }
        );
      }

      // Reload after any action
      await Promise.all([loadLibrary(), loadWishlist()]);
      setSelectedIds(new Set());
      setMultiMode(false);
    } catch (err) {
      console.error(err);
      alert("Failed to apply multi-select action.");
    }
  }

  // ----- Modal -----

  function openModal(book) {
    setModalBook(book);
  }

  function closeModal() {
    setModalBook(null);
  }

  function openSeriesModal(series) {
    const vols = currentList
      .filter((item) => {
        const parsed = parseTitleForSort(item.title || "");
        const key = parsed.name || (item.title || "").toLowerCase() || item.id;
        return key === series.key;
      })
      .sort((a, b) => parseTitleForSort(a.title).vol - parseTitleForSort(b.title).vol);
    setSeriesModal({ series, volumes: vols });
  }

  function closeSeriesModal() {
    setSeriesModal(null);
  }

  // ----- Rendering helpers -----

  const resetAdminForm = () => {
    setAdminForm((prev) => ({
      ...prev,
      open: false,
      mode: "add",
      editingId: null,
      data: {
        title: "",
        authors: "",
        publisher: "",
        demographic: "",
        genre: "",
        subGenre: "",
        date: "",
        cover: "",
        isbn: "",
        pageCount: "",
        rating: "",
        amountPaid: "",
        dateRead: "",
        datePurchased: "",
        msrp: "",
        special: false,
        specialType: "",
        specialVolumes: "",
        collectiblePrice: "",
        amazonURL: "",
        read: false,
        hidden: false,
      },
      multiAdd: false,
      startVol: "",
      endVol: "",
    }));
    setVolumeEntries([]);
    setVolumeIndex(0);
  };

  const seriesInfoMap = useMemo(() => {
    const map = new Map();
    [...library, ...wishlist].forEach((item) => {
      const parsed = parseTitleForSort(item.title || "");
      if (!parsed.name) return;
      const display =
        (item.title || "").replace(/,?\s*Vol\.?\s*\d+.*/i, "").trim() ||
        item.title ||
        parsed.name;
      if (!map.has(parsed.name)) {
        map.set(parsed.name, {
          display,
          maxVol: parsed.vol,
          authors: item.authors || "",
          publisher: item.publisher || "",
          demographic: item.demographic || "",
        });
      } else {
        const cur = map.get(parsed.name);
        cur.maxVol = Math.max(cur.maxVol, parsed.vol);
        if (!cur.authors && item.authors) cur.authors = item.authors;
        if (!cur.publisher && item.publisher) cur.publisher = item.publisher;
        if (!cur.demographic && item.demographic) cur.demographic = item.demographic;
      }
    });
    return map;
  }, [library, wishlist]);

  const openAdminAdd = (list) => {
    setAdminForm((prev) => ({
      ...prev,
      open: true,
      mode: "add",
      list,
      editingId: null,
      data: { ...prev.data, title: "", list },
    }));
    setVolumeEntries([{
      kind: "new",
      id: null,
      data: {
        title: "",
        authors: "",
        publisher: "",
        demographic: "",
        genre: "",
        subGenre: "",
        date: "",
        cover: "",
        isbn: "",
        pageCount: "",
        rating: "",
        amountPaid: "",
        dateRead: "",
        datePurchased: "",
        msrp: "",
        specialType: "",
        specialVolumes: "",
        collectiblePrice: "",
        amazonURL: "",
        read: false,
      },
    }]);
    setVolumeIndex(0);
  };

  const openAdminEdit = (book) => {
    const data = {
      open: true,
      mode: "edit",
      list: book.kind === "wishlist" ? "wishlist" : "library",
      editingId: book.id,
      data: {
        title: book.title || "",
        authors: book.authors || "",
        publisher: book.publisher || "",
        demographic: book.demographic || "",
        genre: book.genre || "",
        subGenre: book.subGenre || "",
        date: book.date || "",
        cover: book.cover || "",
        isbn: book.isbn || "",
        pageCount: book.pageCount || "",
        rating: book.rating || "",
        amountPaid: book.amountPaid || "",
        dateRead: book.dateRead || "",
        datePurchased: book.datePurchased || "",
        msrp: book.msrp || "",
        special: !!(book.specialType || book.specialVolumes || book.collectiblePrice),
        specialType: book.specialType || "",
        specialVolumes: book.specialVolumes || "",
        collectiblePrice: book.collectiblePrice || "",
        amazonURL: book.amazonURL || "",
        read: !!book.read,
        hidden: !!book.hidden,
      },
    };
    setAdminForm(data);
    setVolumeEntries([{
      kind: "edit",
      id: book.id,
      data: { ...data.data },
    }]);
    setVolumeIndex(0);
  };

  const handleAdminChange = (field, value, type = "text") => {
    setAdminForm((prev) => {
      const nextData = {
        ...prev.data,
        [field]: type === "checkbox" ? !!value : value,
      };
      if (field === "special" && !value) {
        nextData.specialType = "";
        nextData.specialVolumes = "";
        nextData.collectiblePrice = "";
      }
      if (field === "specialType") {
        if (value === "collectible") {
          nextData.specialVolumes = "";
        } else if (value === "specialEdition") {
          nextData.collectiblePrice = "";
        } else {
          nextData.specialVolumes = "";
          nextData.collectiblePrice = "";
        }
      }

      if (field === "title") {
        const parsed = parseTitleForSort(value || "");
        if (parsed.name && seriesInfoMap.has(parsed.name)) {
          const meta = seriesInfoMap.get(parsed.name);
          nextData.authors = meta.authors || nextData.authors;
          nextData.publisher = meta.publisher || nextData.publisher;
          nextData.demographic = meta.demographic || nextData.demographic;
        }
      }

      return { ...prev, data: nextData };
    });

    setVolumeEntries((prev) => {
      if (!prev.length) return prev;
      const items = [...prev];
      const current = { ...items[volumeIndex] };
      current.data = {
        ...current.data,
        [field]: type === "checkbox" ? !!value : value,
      };
      items[volumeIndex] = current;
      return items;
    });

    if (field === "title") {
      const input = String(value || "").trim().toLowerCase();
      if (!input) {
        setTitleMatches([]);
      } else {
        const matches = [];
        seriesInfoMap.forEach((val) => {
          if (val.display.toLowerCase().includes(input)) {
            const nextVol = val.maxVol > 0 ? val.maxVol + 1 : 1;
            matches.push(`${val.display}, Vol. ${nextVol}`);
          }
        });
        setTitleMatches(matches.slice(0, 6));
      }
    }
  };

  const goVolumeEntry = (nextIdx) => {
    if (!volumeEntries[nextIdx]) return;
    setVolumeIndex(nextIdx);
    setAdminForm((prev) => {
      const entry = volumeEntries[nextIdx];
      return { ...prev, data: { ...entry.data } };
    });
  };

  const addNewVolumeEntry = () => {
    const currentTitle = adminForm.data.title || "";
    const parsed = parseTitleForSort(currentTitle);
    if (!parsed.name) {
      alert("Provide a title with a volume number first (e.g., Series, Vol. 1).");
      return;
    }
    const currentEntry = {
      kind: adminForm.mode,
      id: adminForm.editingId,
      data: { ...adminForm.data },
    };
    const workingEntries = volumeEntries.length ? [...volumeEntries] : [];
    if (!workingEntries.length) {
      workingEntries.push(currentEntry);
    } else {
      workingEntries[volumeIndex] = currentEntry;
    }

    const baseDisplay =
      currentTitle.replace(/,?\s*Vol\.?\s*\d+.*/i, "").trim() || currentTitle;

    let maxVol = parsed.vol || 0;
    const seriesMeta = seriesInfoMap.get(parsed.name);
    if (seriesMeta && seriesMeta.maxVol > maxVol) maxVol = seriesMeta.maxVol;
    workingEntries.forEach((v) => {
      const p = parseTitleForSort(v.data.title || "");
      if (p.name === parsed.name) {
        maxVol = Math.max(maxVol, p.vol || 0);
      }
    });
    const nextVol = (maxVol || 0) + 1;
    const newTitle = `${baseDisplay}, Vol. ${nextVol}`;

    const newData = {
      title: newTitle,
      authors: adminForm.data.authors,
      publisher: adminForm.data.publisher,
      demographic: adminForm.data.demographic,
      genre: adminForm.data.genre,
      subGenre: adminForm.data.subGenre,
      msrp: adminForm.data.msrp,
      hidden: adminForm.data.hidden,
      cover: "",
      isbn: "",
      pageCount: "",
      rating: "",
      amountPaid: "",
      date: "",
      dateRead: "",
      datePurchased: "",
      special: false,
      specialType: "",
      specialVolumes: "",
      collectiblePrice: "",
      amazonURL: "",
      read: false,
    };

    workingEntries.push({ kind: "new", id: null, data: newData });
    setVolumeEntries(workingEntries);
    setVolumeIndex(workingEntries.length - 1);
    setAdminForm((prev) => ({ ...prev, mode: "add", data: newData }));
  };

  async function saveAdminForm() {
    if (!isAdmin) return;
    const { list } = adminForm;
    const targetList = list || "library";
    const entries =
      volumeEntries.length > 0
        ? volumeEntries
        : [{
            kind: adminForm.mode,
            id: adminForm.editingId,
            data: adminForm.data,
          }];

    const buildPayload = (d) => {
      const titleTrim = (d.title || "").trim();
      const parsed = parseTitleForSort(titleTrim);
      const meta = seriesInfoMap.get(parsed.name) || {};
      const authorVal = (d.authors || "").trim() || meta.authors || "";
      const publisherVal = (d.publisher || "").trim() || meta.publisher || "";
      const demoVal = (d.demographic || "").trim() || meta.demographic || "";
      const genreVal = (d.genre || "").trim() || meta.genre || "";
      const subVal = (d.subGenre || "").trim() || meta.subGenre || "";

      return {
        title: titleTrim,
        authors: authorVal,
        publisher: publisherVal,
        demographic: demoVal,
        genre: genreVal,
        subGenre: subVal,
        date: normalizeDateString(d.date || ""),
        cover: (d.cover || "").trim(),
        isbn: targetList === "wishlist" ? "" : (d.isbn || "").trim(),
        pageCount: d.pageCount === "" ? "" : Number(d.pageCount),
        rating:
          targetList === "wishlist"
            ? ""
            : d.rating === ""
            ? ""
            : Math.max(0.5, Math.min(5, Number(d.rating))),
        amountPaid: d.amountPaid === "" ? "" : Number(d.amountPaid),
        dateRead: normalizeDateString(d.dateRead || ""),
        datePurchased: normalizeDateString(d.datePurchased || ""),
        msrp: targetList === "wishlist" ? "" : d.msrp === "" ? "" : Number(d.msrp),
        special:
          targetList === "wishlist"
            ? false
            : !!(d.special && (d.specialType || "").trim()),
        specialType:
          targetList === "wishlist" || !(d.special && (d.specialType || "").trim())
            ? ""
            : (d.specialType || "").trim(),
        specialVolumes:
          targetList === "wishlist"
            ? ""
            : d.special && d.specialType === "specialEdition"
            ? d.specialVolumes === ""
              ? ""
              : Number(d.specialVolumes)
            : "",
        collectiblePrice:
          targetList === "wishlist"
            ? ""
            : d.special && d.specialType === "collectible"
            ? d.collectiblePrice === ""
              ? ""
              : Number(d.collectiblePrice)
            : "",
        amazonURL: (d.amazonURL || "").trim(),
        read: targetList === "wishlist" ? false : !!d.read,
        hidden: !!d.hidden,
        kind: list,
      };
    };

    try {
      const results = await Promise.all(entries.map(async (entry) => {
        const payload = buildPayload(entry.data);
        // If adding to library and series exists, inherit shared fields
        if (targetList === "library" && entry.kind !== "edit") {
          const baseTitle = parseTitleForSort(payload.title).name;
          const seriesBooks = library.filter(
            (b) => parseTitleForSort(b.title || b.Title || "").name === baseTitle
          );
          const first = seriesBooks[0];
          if (first) {
            payload.demographic =
              payload.demographic || first.demographic || first.Demographic || "";
            payload.genre = payload.genre || first.genre || first.Genre || "";
            payload.subGenre = payload.subGenre || first.subGenre || first.SubGenre || "";
            if (payload.msrp === "") {
              const msrps = seriesBooks
                .map((b) => Number(b.msrp ?? b.MSRP))
                .filter((n) => Number.isFinite(n));
              if (msrps.length > 0) {
                const allSame = msrps.every((n) => n === msrps[0]);
                if (allSame) payload.msrp = msrps[0];
              }
            }
          }
        }
        if (!payload.title) {
          alert("Title is required for every entry.");
          throw new Error("missing title");
        }
        if (entry.kind === "edit" && entry.id) {
          await updateDoc(doc(db, targetList, entry.id), payload);
          return { target: targetList, id: entry.id, payload };
        } else {
          const ref = await addDoc(collection(db, targetList), payload);
          return { target: targetList, id: ref.id, payload };
        }
      }));
      applyWriteResults(results.filter(Boolean));
      await Promise.all([loadLibrary(), loadWishlist()]);
      logActivity(
        `${adminForm.mode === "add" ? "Added" : "Saved"} ${entries.length} item${
          entries.length === 1 ? "" : "s"
        } in ${targetList === "library" ? "Library" : "Wishlist"}`,
        {
          action: adminForm.mode === "add" ? "create" : "update",
          list: targetList === "library" ? "Library" : "Wishlist",
          details: { entries: entries.length, mode: adminForm.mode },
        }
      );
      resetAdminForm();
    } catch (err) {
      console.error(err);
      alert("Failed to save entry.");
    }
  }

  async function deleteSingle(bookId, kind) {
    if (!isAdmin) return;
    if (!window.confirm("Delete this entry?")) return;
    const sourceList = kind === "wishlist" ? wishlist : library;
    const target = sourceList.find((b) => b.id === bookId);
    try {
      await deleteDoc(doc(db, kind, bookId));
      await Promise.all([loadLibrary(), loadWishlist()]);
      logActivity(
        `Deleted "${target?.title || "Untitled"}" from ${kind === "library" ? "Library" : "Wishlist"}`,
        {
          action: "delete-single",
          list: kind === "library" ? "Library" : "Wishlist",
          details: { title: target?.title || "Untitled" },
        }
      );
    } catch (err) {
      console.error(err);
      alert("Failed to delete entry.");
    }
  }

  const [modalSaving, setModalSaving] = useState(false);

  const resetBulkEdit = () =>
    setBulkEdit({
      open: false,
      index: 0,
      items: [],
    });

  async function saveInline(book, payload, meta = {}) {
    if (!book?.id) return;
    const col = book.kind === "wishlist" ? "wishlist" : "library";
    setModalSaving(true);
    try {
      await updateDoc(doc(db, col, book.id), payload);
      applyWriteResults([{ target: col, id: book.id, payload }]);
      await Promise.all([loadLibrary(), loadWishlist()]);
      logActivity(
        `Updated "${book.title || "Untitled"}" in ${col === "library" ? "Library" : "Wishlist"}`,
        {
          action: meta.action || "inline-update",
          list: col === "library" ? "Library" : "Wishlist",
          details: meta.details || {
            title: book.title || "Untitled",
            fields: Object.keys(payload || {}).join(", "),
            rating: payload.rating ?? undefined,
          },
        }
      );
      setModalBook((prev) => (prev && prev.id === book.id ? { ...prev, ...payload } : prev));
    } catch (err) {
      console.error(err);
      alert("Failed to update entry.");
    } finally {
      setModalSaving(false);
    }
  }

  const handleInlineRating = (book, value) => {
    const ratingValue = value === "" ? "" : Math.max(0.5, Math.min(5, Number(value)));
    saveInline(book, { rating: ratingValue }, {
      action: "rating",
      details: { title: book.title || "Untitled", rating: ratingValue },
    });
  };

  const handleInlineRead = (book, readState) => {
    if (!book) return;
    const payload = readState
      ? { read: true, dateRead: getLocalDateISO(), rating: book.rating ?? "" }
      : { read: false, dateRead: "", rating: "" };
    saveInline(book, payload, {
      action: readState ? "mark-read" : "mark-unread",
      details: {
        title: book.title || "Untitled",
        dateRead: readState ? payload.dateRead : "cleared",
        rating: book.rating || "not set",
      },
    });
  };

  const openBulkEdit = () => {
    if (!selectedIds.size) {
      alert("Select at least one entry first.");
      return;
    }
    const all = [...library, ...wishlist];
    const selected = all.filter((b) => selectedIds.has(b.id));
    if (!selected.length) {
      alert("No items selected.");
      return;
    }
    const items = selected.map((b) => ({
      id: b.id,
      kind: b.kind || (activeTab === "wishlist" ? "wishlist" : "library"),
      data: {
        title: b.title || "",
        authors: b.authors || "",
        publisher: b.publisher || "",
        demographic: b.demographic || "",
        genre: b.genre || "",
        subGenre: b.subGenre || "",
        date: b.date || "",
        cover: b.cover || "",
        isbn: b.isbn || "",
        pageCount: b.pageCount || "",
        rating: b.rating || "",
        amountPaid: b.amountPaid || "",
        dateRead: b.dateRead || "",
        datePurchased: b.datePurchased || "",
        msrp: b.msrp || "",
        special: !!(b.specialType || b.specialVolumes || b.collectiblePrice),
        specialType: b.specialType || "",
        specialVolumes: b.specialVolumes || "",
        collectiblePrice: b.collectiblePrice || "",
        amazonURL: b.amazonURL || "",
        read: !!b.read,
        hidden: !!b.hidden,
      },
    }));
    setBulkEdit({ open: true, index: 0, items });
  };

  const handleBulkChange = (field, value, type = "text") => {
    setBulkEdit((prev) => {
      const items = [...prev.items];
      const current = { ...items[prev.index] };
      const nextData = {
        ...current.data,
        [field]: type === "checkbox" ? !!value : value,
      };
      if (field === "special" && !value) {
        nextData.specialType = "";
        nextData.specialVolumes = "";
        nextData.collectiblePrice = "";
      }
      if (field === "specialType") {
        if (value === "collectible") {
          nextData.specialVolumes = "";
        } else if (value === "specialEdition") {
          nextData.collectiblePrice = "";
        } else {
          nextData.specialVolumes = "";
          nextData.collectiblePrice = "";
        }
      }
      current.data = nextData;
      items[prev.index] = current;
      return { ...prev, items };
    });
  };

  const bulkNext = () => {
    setBulkEdit((prev) => ({
      ...prev,
      index: Math.min(prev.index + 1, prev.items.length - 1),
    }));
  };

  const bulkPrev = () => {
    setBulkEdit((prev) => ({
      ...prev,
      index: Math.max(prev.index - 1, 0),
    }));
  };

  async function applyBulkSave() {
    if (!isAdmin) return;
    const updates = bulkEdit.items;
    if (!updates.length) {
      resetBulkEdit();
      return;
    }
    try {
      const results = await Promise.all(updates.map(async (item) => {
        const isWishlistItem = item.kind === "wishlist";
        const specialOn =
          !isWishlistItem && !!(item.data.special && (item.data.specialType || "").trim());
        const payload = {
          ...item.data,
          pageCount: item.data.pageCount === "" ? "" : Number(item.data.pageCount),
          rating:
            item.data.rating === ""
              ? ""
              : Math.max(0.5, Math.min(5, Number(item.data.rating))),
          amountPaid: item.data.amountPaid === "" ? "" : Number(item.data.amountPaid),
          msrp: item.data.msrp === "" ? "" : Number(item.data.msrp),
          special: specialOn,
          specialType: specialOn ? item.data.specialType : "",
          collectiblePrice:
            specialOn && item.data.specialType === "collectible"
              ? item.data.collectiblePrice === ""
                ? ""
                : Number(item.data.collectiblePrice)
              : "",
          specialVolumes:
            specialOn && item.data.specialType === "specialEdition"
              ? item.data.specialVolumes === ""
                ? ""
                : Number(item.data.specialVolumes)
              : "",
          datePurchased: item.data.datePurchased || "",
          amazonURL: item.data.amazonURL || "",
          read: !!item.data.read,
        };
        const target = item.kind === "wishlist" ? "wishlist" : "library";
        await updateDoc(doc(db, target, item.id), payload);
        return { target, id: item.id, payload };
      }));
      applyWriteResults(results.filter(Boolean));
      await Promise.all([loadLibrary(), loadWishlist()]);
      setSelectedIds(new Set());
      setMultiMode(false);
      logActivity(
        `Bulk edited ${updates.length} item${updates.length === 1 ? "" : "s"} in Library/Wishlist`,
        {
          action: "bulk-edit",
          list: "Library/Wishlist",
          details: { count: updates.length },
        }
      );
      resetBulkEdit();
    } catch (err) {
      console.error(err);
      alert("Failed to save bulk edits.");
    }
  }

  const buildSeriesGroups = (list) => {
    const groups = new Map();
    list.forEach((item) => {
      const parsed = parseTitleForSort(item.title || "");
      const key = parsed.name || (item.title || "").toLowerCase() || item.id;
      const meta = seriesInfoMap.get(parsed.name) || null;
      const baseTitle =
        meta?.display ||
        (item.title || "").replace(/,?\s*Vol\.?\s*\d+.*/i, "").trim() ||
        item.title ||
        "Untitled";
      const metaMissing = isMissingCoreMeta(item, {
        includeIsbn: item.kind === "library",
        includeFinance: item.kind === "library",
      });
      const volumesForItem = extractVolumesFromTitle(item.title || "");
      const fallbackVol = Number.isFinite(parsed.vol) ? parsed.vol : 0;
      const volumeNumbers =
        volumesForItem.length > 0
          ? volumesForItem
          : fallbackVol > 0
            ? [fallbackVol]
            : [];
      const volNumber = volumeNumbers.length ? volumeNumbers[0] : 0;
      const missingPage = isMissingPageCount(item);

      if (!groups.has(key)) {
        groups.set(key, {
          id: `series-${key}`,
          key,
          title: baseTitle,
          authors:
            item.authors && item.authors !== "Unknown"
              ? item.authors
              : meta?.authors || "",
          publisher:
            item.publisher && item.publisher !== "Unknown"
              ? item.publisher
              : meta?.publisher || "",
          demographic: meta?.demographic || item.demographic || "",
          cover: item.cover || "",
          count: 1,
          readCount: item.read ? 1 : 0,
          minVol: volNumber,
          maxVol: volNumber,
          representative: item,
          volumes: [...volumeNumbers],
          missingPageCount: missingPage ? 1 : 0,
          missingMetaCount: metaMissing.any ? 1 : 0,
          missingVolumeCount: missingPage || metaMissing.any ? 1 : 0,
        });
      } else {
        const existing = groups.get(key);
        existing.count += 1;
        if (item.read) existing.readCount += 1;
        if (missingPage) existing.missingPageCount += 1;
        if (metaMissing.any) existing.missingMetaCount += 1;
        if (missingPage || metaMissing.any) existing.missingVolumeCount += 1;
        if (volumeNumbers.length) {
          const vMin = Math.min(...volumeNumbers);
          const vMax = Math.max(...volumeNumbers);
          existing.minVol = Math.min(existing.minVol, vMin);
          existing.maxVol = Math.max(existing.maxVol, vMax);
          existing.volumes.push(...volumeNumbers);
        }
        if (!existing.cover && item.cover) existing.cover = item.cover;
        if (!existing.authors && item.authors && item.authors !== "Unknown") {
          existing.authors = item.authors;
        }
        if (!existing.publisher && item.publisher && item.publisher !== "Unknown") {
          existing.publisher = item.publisher;
        }
      }
    });
    return Array.from(groups.values());
  };

  const formatVolumeLabel = (volumes) => {
    const uniq = Array.from(
      new Set((volumes || []).filter((v) => Number.isFinite(v) && v >= 0))
    ).sort((a, b) => a - b);
    if (!uniq.length) return null;

    const ranges = [];
    let start = uniq[0];
    let prev = uniq[0];

    for (let i = 1; i < uniq.length; i += 1) {
      const cur = uniq[i];
      if (cur === prev + 1) {
        prev = cur;
        continue;
      }
      ranges.push([start, prev]);
      start = cur;
      prev = cur;
    }
    ranges.push([start, prev]);

    if (ranges.length === 1) {
      const [s, e] = ranges[0];
      return s === e ? `Vol. ${s}` : `Vol. ${s}-${e}`;
    }

    const rangeText = ranges.map(([s, e]) => (s === e ? `${s}` : `${s}-${e}`)).join(", ");
    return `Vols. ${rangeText}`;
  };

  function renderCard(book) {
    const selected = selectedIds.has(book.id);
    const isLibraryCard = book.kind === "library";
    const missingPage = isAdmin && isMissingPageCount(book);
    const missingMeta = isAdmin
      ? isMissingCoreMeta(book, { includeIsbn: isLibraryCard, includeFinance: isLibraryCard })
      : {
          any: false,
          authorMissing: false,
          publisherMissing: false,
          dateMissing: false,
          isbnMissing: false,
          amountMissing: false,
          msrpMissing: false,
          purchaseMissing: false,
        };

    const handleClick = () => {
      if (multiMode && isAdmin) {
        toggleCardSelection(book.id);
      } else {
        openModal(book);
      }
    };

    return (
      <div
        key={book.id}
                  className={
                    "manga-card" +
                    (book.read && isLibraryCard ? " read" : "") +
                    (selected ? " multiselect-selected" : "") +
                    (missingPage ? " missing-page" : "") +
                    (missingMeta.any ? " missing-meta" : "")
                  }
                  onClick={handleClick}
                >
        <div className="manga-card-cover-wrap">
          <img
            src={
              book.cover ||
              "https://imgur.com/chUgq4W.png"
            }
            alt="Cover"
            loading="lazy"
            decoding="async"
          />
        </div>
        <div className="manga-card-body">
          <div className="manga-card-title">{book.title || "Untitled"}</div>
          <div className="manga-card-meta">
            <span className={missingMeta.authorMissing ? "missing-field" : ""}>
              {book.authors && book.authors !== "Unknown" ? book.authors : missingMeta.authorMissing ? "Missing author" : ""}
            </span>
            <br />
            <span className={missingMeta.publisherMissing ? "missing-field" : ""}>
              {book.publisher && book.publisher !== "Unknown" ? book.publisher : missingMeta.publisherMissing ? "Missing publisher" : ""}
            </span>
            <br />
            <span className={missingMeta.dateMissing ? "missing-field" : ""}>
              {book.date && book.date !== "Unknown" ? book.date : missingMeta.dateMissing ? "Missing date" : ""}
            </span>
          </div>
          {book.isbn ? (
            <div className="manga-card-isbn">ISBN: {book.isbn}</div>
          ) : (
            isLibraryCard &&
            missingMeta.isbnMissing && <div className="manga-card-isbn missing-field">Missing ISBN</div>
          )}
          {isAdmin && (
            <div className="manga-card-actions">
              <button
                type="button"
                className="manga-btn mini"
                onClick={(e) => {
                  e.stopPropagation();
                  openAdminEdit(book);
                }}
              >
                Edit
              </button>
              <button
                type="button"
                className="manga-btn mini danger"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteSingle(book.id, book.kind === "wishlist" ? "wishlist" : "library");
                }}
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderSeriesCard(series) {
    const volumeLabel = formatVolumeLabel(series.volumes);
    const countLabel = `${series.count} volume${series.count === 1 ? "" : "s"}`;
    const readLabel =
      series.readCount >= series.count && series.count > 0
        ? "Read"
        : `Read ${series.readCount}/${series.count}`;
    const isComplete = series.readCount >= series.count && series.count > 0;
    const missingCount = isAdmin ? series.missingVolumeCount || 0 : 0;
    const hasMissing = missingCount > 0;
    const metaLines = [
      series.authors && series.authors !== "Unknown" ? series.authors : null,
      series.publisher && series.publisher !== "Unknown" ? series.publisher : null,
      volumeLabel ? `${countLabel} - ${volumeLabel}` : countLabel,
    ].filter(Boolean);

    return (
      <div
        key={series.id}
        className={
          "manga-card series-view" +
          (isComplete ? " read" : "") +
          (hasMissing ? " missing-page missing-meta" : "")
        }
        onClick={() => openSeriesModal(series)}
      >
        {hasMissing && (
          <div className="missing-page-badge" title="Volumes missing required data">
            {missingCount}
          </div>
        )}
        <div className="manga-card-cover-wrap">
          <img
            src={
              series.cover ||
              series.representative?.cover ||
              "https://imgur.com/chUgq4W.png"
            }
            alt="Cover"
            loading="lazy"
            decoding="async"
          />
        </div>
        <div className="manga-card-body">
          <div className="manga-card-title">
            {series.title || "Untitled Series"}
          </div>
          <div className="manga-card-meta">
            {metaLines.map((line, idx) => (
              <React.Fragment key={line + idx}>
                {line}
                <br />
              </React.Fragment>
            ))}
          </div>
          <div className="manga-card-series-count">{countLabel}</div>
        </div>
      </div>
    );
  }

  const StarPicker = ({ value, onChange, interactive = true }) => {
    const [hoverVal, setHoverVal] = useState(null);
    const baseVal = Math.max(0, Math.min(5, Number(value) || 0));
    const displayVal = interactive && hoverVal != null ? hoverVal : baseVal;
    const steps = Array.from({ length: 10 }, (_, i) => (i + 1) * 0.5);
    const starCount = 5;
    const stars = Array.from({ length: starCount }, (_, i) => {
      const frac = Math.max(0, Math.min(1, displayVal - i));
      return frac;
    });
    const canInteract = interactive && typeof onChange === "function";

    return (
      <div className={`star-shell${canInteract ? "" : " read-only"}`} role="group" aria-label="Rating">
        <div className="star-visual" style={{ "--star-count": starCount }}>
          <div className="star-row">
            {stars.map((frac, idx) => (
              <div className="star-icon" key={idx}>
                <svg viewBox="0 0 24 24" aria-hidden="true" className="star-base">
                  <path d="M12 2.5l2.9 5.88 6.5.95-4.7 4.58 1.1 6.43L12 17.9l-5.8 3.44 1.1-6.43-4.7-4.58 6.5-.95L12 2.5z" />
                </svg>
                <div
                  className="star-fill"
                  style={{ "--pct": `${(Math.max(0, Math.min(1, frac)) * 100).toFixed(1)}%` }}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 2.5l2.9 5.88 6.5.95-4.7 4.58 1.1 6.43L12 17.9l-5.8 3.44 1.1-6.43-4.7-4.58 6.5-.95L12 2.5z" />
                  </svg>
                </div>
              </div>
            ))}
          </div>
          {canInteract && (
            <div className="star-hit">
              {steps.map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-label={`${v} stars`}
                  onMouseEnter={() => setHoverVal(v)}
                  onMouseLeave={() => setHoverVal(null)}
                  onClick={() => onChange(v)}
                />
              ))}
            </div>
          )}
        </div>
        <div className="star-value">{displayVal ? displayVal.toFixed(1) : "--"}</div>
        {canInteract && (
          <button
            type="button"
            className="star-clear"
            onClick={() => onChange("")}
            aria-label="Clear rating"
          >
            clear
          </button>
        )}
      </div>
    );
  };

  const currentList = activeTab === "library" ? visibleLibrary : visibleWishlist;
  const fullList = activeTab === "library" ? library : wishlist;

  const currentSeriesList = useMemo(
    () => buildSeriesGroups(currentList),
    [currentList, seriesInfoMap]
  );
  const totalSeriesList = useMemo(
    () => buildSeriesGroups(fullList),
    [fullList, seriesInfoMap]
  );

  // Keep any open modals in sync with the latest data coming from Firestore
  useEffect(() => {
    if (!modalBook && !seriesModal) return;

    const allItems = [...library, ...wishlist];

    if (modalBook) {
      const updated = allItems.find((b) => b.id === modalBook.id);
      if (!updated) {
        setModalBook(null);
      } else if (
        updated.title !== modalBook.title ||
        updated.isbn !== modalBook.isbn ||
        updated.publisher !== modalBook.publisher ||
        updated.authors !== modalBook.authors ||
        updated.date !== modalBook.date ||
        updated.pageCount !== modalBook.pageCount ||
        updated.amountPaid !== modalBook.amountPaid ||
        updated.msrp !== modalBook.msrp ||
        updated.rating !== modalBook.rating ||
        updated.read !== modalBook.read ||
        updated.amazonURL !== modalBook.amazonURL
      ) {
        setModalBook(updated);
      }
    }

    if (seriesModal) {
      const updatedSeries = currentSeriesList.find((s) => s.key === seriesModal.series.key);
      if (!updatedSeries) {
        setSeriesModal(null);
        return;
      }

      const vols = currentList
        .filter((item) => {
          const parsed = parseTitleForSort(item.title || "");
          const key = parsed.name || (item.title || "").toLowerCase() || item.id;
          return key === updatedSeries.key;
        })
        .sort((a, b) => parseTitleForSort(a.title).vol - parseTitleForSort(b.title).vol);

      const sameVolumes =
        vols.length === seriesModal.volumes.length &&
        vols.every((v, idx) => seriesModal.volumes[idx]?.id === v.id);

      const volumeChanged =
        vols.length !== seriesModal.volumes.length ||
        vols.some((v, idx) => {
          const prev = seriesModal.volumes[idx];
          if (!prev || prev.id !== v.id) return true;
          return (
            prev.title !== v.title ||
            prev.authors !== v.authors ||
            prev.publisher !== v.publisher ||
            prev.date !== v.date ||
            prev.isbn !== v.isbn ||
            prev.cover !== v.cover ||
            prev.read !== v.read ||
            prev.pageCount !== v.pageCount ||
            prev.datePurchased !== v.datePurchased ||
            prev.amountPaid !== v.amountPaid ||
            prev.msrp !== v.msrp ||
            prev.rating !== v.rating
          );
        });

      const seriesChanged =
        updatedSeries.title !== seriesModal.series.title ||
        updatedSeries.authors !== seriesModal.series.authors ||
        updatedSeries.publisher !== seriesModal.series.publisher ||
        updatedSeries.count !== seriesModal.series.count;

      if (volumeChanged || seriesChanged || !sameVolumes) {
        setSeriesModal({ series: updatedSeries, volumes: vols });
      }
    }

  }, [
    library,
    wishlist,
    modalBook,
    seriesModal,
    currentList,
    currentSeriesList
  ]);

  const displayList = viewMode === "series" ? currentSeriesList : currentList;
  const displayCount = viewMode === "series" ? currentSeriesList.length : currentList.length;
  const totalDisplayCount = viewMode === "series" ? totalSeriesList.length : fullList.length;

  const exportCSV = (rows, filename) => {
    if (!rows.length) return;
    const headers = Array.from(
      rows.reduce((set, row) => {
        Object.keys(row).forEach((k) => set.add(k));
        return set;
      }, new Set())
    );
    const escape = (v) => {
      const s = v == null ? "" : String(v);
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const csv = [headers.join(",")].concat(
      rows.map((r) => headers.map((h) => escape(r[h])).join(","))
    );
    const blob = new Blob([csv.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportJSON = (rows, filename) => {
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadImagesZip = async (rows, filename) => {
    const slugify = (text, fallback = "image") => {
      const slug = (text || "")
        .toString()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 100);
      return slug || fallback;
    };
    const files = rows
      .filter((r) => r.cover)
      .map((r, idx) => ({
        url: r.cover,
        name: slugify(r.title || `manga-${idx + 1}`, `manga-${idx + 1}`),
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
      const fetches = files.map(async (file, idx) => {
        try {
          const res = await fetch(file.url);
          const blob = await res.blob();
          const ext = (file.url.split(".").pop() || "jpg").split(/[?#]/)[0];
          const base = file.name || `image-${idx + 1}`;
          nameCounts[base] = (nameCounts[base] || 0) + 1;
          const suffix = nameCounts[base] > 1 ? `-${nameCounts[base]}` : "";
          folder.file(`${base}${suffix}.${ext}`, blob);
        } catch (err) {
          console.warn("Failed to fetch image", file.url, err);
        }
      });
      await Promise.all(fetches);
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Zip download failed", err);
      alert("Failed to create zip. Please try again.");
    }
  };

  const downloadJson = (dataObj, filename) => {
    const blob = new Blob([JSON.stringify(dataObj, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const buildMovePayload = (book) => ({
    title: book.title || "",
    authors: book.authors || "",
    publisher: book.publisher || "",
    demographic: book.demographic || "",
    genre: book.genre || "",
    subGenre: book.subGenre || "",
    date: book.date || "",
    pageCount: book.pageCount ?? "",
    cover: book.cover || "",
    amountPaid: book.amountPaid ?? "",
    read: !!book.read,
    rating: book.rating ?? "",
    dateRead: book.dateRead || "",
    datePurchased: book.datePurchased || "",
    msrp: book.msrp ?? "",
    collectiblePrice: book.collectiblePrice ?? "",
    specialType: book.specialType || "",
    specialVolumes: book.specialVolumes ?? "",
    isbn: book.isbn || "",
    amazonURL: book.amazonURL || "",
    hidden: !!book.hidden,
  });

  const getSeriesMsrp = (book) => {
    const parsed = parseTitleForSort(book.title || "");
    const key = parsed.name;
    if (!key) return "";
    const source = [...library, ...wishlist];
    const msrps = source
      .map((b) => {
        const p = parseTitleForSort(b.title || "");
        const sameSeries = p.name === key;
        const raw = b.msrp ?? b.MSRP ?? "";
        const str = String(raw).trim();
        if (!sameSeries || !str) return null;
        const num = Number(str);
        return Number.isFinite(num) ? num : null;
      })
      .filter((n) => n !== null);
    if (!msrps.length) return "";
    const first = msrps[0];
    return msrps.every((n) => n === first) ? first : "";
  };

  const getSeriesDemographics = (book) => {
    const parsed = parseTitleForSort(book.title || "");
    const key = parsed.name;
    if (!key) return { demographic: "", genre: "", subGenre: "" };
    const source = [...library, ...wishlist];
    const match = source.find((b) => {
      const p = parseTitleForSort(b.title || "");
      return p.name === key && (b.demographic || b.genre || b.subGenre);
    });
    return {
      demographic: match?.demographic || "",
      genre: match?.genre || "",
      subGenre: match?.subGenre || "",
    };
  };

  const moveSingle = async (book) => {
    if (!isAdmin || !book?.id) return;
    const from = book.kind === "wishlist" ? "wishlist" : "library";
    const to = from === "library" ? "wishlist" : "library";
    try {
      const payload = buildMovePayload(book);
      if (to === "library") {
        const inheritedMsrp = getSeriesMsrp(book);
        if (payload.msrp === "" || payload.msrp === null || payload.msrp === undefined) {
          payload.msrp = inheritedMsrp;
        }
        const inheritedDemo = getSeriesDemographics(book);
        if (!payload.demographic) payload.demographic = inheritedDemo.demographic;
        if (!payload.genre) payload.genre = inheritedDemo.genre;
        if (!payload.subGenre) payload.subGenre = inheritedDemo.subGenre;
      }
      await addDoc(collection(db, to), payload);
      await deleteDoc(doc(db, from, book.id));
      await Promise.all([loadLibrary(), loadWishlist()]);
      // Remove the moved book from the series modal view if it's open
      setSeriesModal((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          volumes: prev.volumes.filter((v) => v.id !== book.id),
        };
      });
      // Close the detail modal since the item has moved lists
      closeModal();
    } catch (err) {
      console.error("Move failed", err);
      alert("Failed to move item.");
    }
  };

  const isWishlistForm = adminForm.list === "wishlist";
  const bulkCurrent = bulkEdit.items[bulkEdit.index] || null;
  const bulkIsWishlist = bulkCurrent?.kind === "wishlist";
  const bulkMissing = useMemo(() => {
    if (!bulkCurrent) {
      return {
        author: false,
        publisher: false,
        date: false,
        purchaseDate: false,
        page: false,
        isbn: false,
        amountPaid: false,
        collectiblePrice: false,
        msrp: false,
      };
    }
    const data = bulkCurrent.data || {};
    const isLib = bulkCurrent.kind === "library";
    const isCollectible = isLib && data.special && data.specialType === "collectible";
    const amountVisible = isLib && !isCollectible;
    return {
      author: isMissingValue(data.authors),
      publisher: isMissingValue(data.publisher),
      date: isMissingValue(data.date),
      purchaseDate: isLib ? isMissingValue(data.datePurchased) : false,
      page: isMissingPageCount({ pageCount: data.pageCount }),
      isbn: isLib ? isMissingValue(data.isbn) : false,
      amountPaid: amountVisible ? isMissingValue(data.amountPaid) : false,
      collectiblePrice: isCollectible ? isMissingValue(data.collectiblePrice) : false,
      msrp: isLib ? isMissingValue(data.msrp) : false,
    };
  }, [bulkCurrent]);

  return (
    <div className="manga-page">
      <header
        className="manga-header"
        style={{ flexDirection: "column", alignItems: "center", textAlign: "center" }}
      >
        <div
          className="manga-header-title"
          style={{
            justifyContent: "center",
            gap: "0.6rem",
            fontSize: "2rem",
            color: "#ffb6c1",
            textShadow: "0 0 8px rgba(255,182,193,0.8)",
            fontWeight: 700,
          }}
        >
          Tyler&apos;s Manga Library
        </div>
        <div className="manga-header-sub" style={{ textAlign: "center" }}>
          This is my Manga Library and Wishlist. Check and see all the Manga I have in my possession!
        </div>
      </header>

      {canSuggest && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "6px" }}>
          <button
            className="suggestion-trigger"
            type="button"
            onClick={() => {
              setSuggestionStatus("");
              setSuggestionOpen(true);
            }}
          >
            + Suggestion
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="manga-tabs">
        <button
          className={
            "manga-tab-btn" + (activeTab === "library" ? " active" : "")
          }
          onClick={() => {
            setActiveTab("library");
            setMultiMode(false);
            setSelectedIds(new Set());
          }}
        >
          Library
        </button>
        <button
          className={
            "manga-tab-btn" + (activeTab === "wishlist" ? " active" : "")
          }
          onClick={() => {
            setActiveTab("wishlist");
            setMultiMode(false);
            setSelectedIds(new Set());
          }}
        >
          Wishlist
        </button>
      </div>

      {/* Toolbar */}
      {activeTab !== "dashboard" && (
        <>
          <div className="manga-toolbar">
            <div className="manga-toolbar-left">
              <input
                type="text"
                className="manga-search-input"
                placeholder={
                  activeTab === "library"
                    ? "Search library by title, author, ISBN..."
                    : "Search wishlist..."
                }
                value={
                  activeTab === "library" ? searchLibrary : searchWishlist
                }
                onChange={(e) =>
                  activeTab === "library"
                    ? setSearchLibrary(e.target.value)
                    : setSearchWishlist(e.target.value)
                }
              />
              <div className="manga-counter">
                {(() => {
                  const isLib = activeTab === "library";
                  const searchVal = (isLib ? searchLibrary : searchWishlist).trim();
                  const total = isLib ? library.length : wishlist.length; // include hidden
                  const filtered = isLib ? filteredLibrary.length : filteredWishlist.length;
                  if (searchVal) {
                    return `${filtered} / ${total} Volumes`;
                  }
                  return `${total} Volumes`;
                })()}
              </div>
            </div>

            <div className="manga-toolbar-right">
              <div className="manga-view-toggle">
                <button
                  className={"manga-btn secondary" + (viewMode === "series" ? " active" : "")}
                  type="button"
                  aria-pressed={viewMode === "series"}
                  aria-label="Series view"
                  title="Series View"
                  onClick={() => changeViewMode("series")}
                >
                  ◻
                </button>
                <button
                  className={"manga-btn secondary" + (viewMode === "individual" ? " active" : "")}
                  type="button"
                  aria-pressed={viewMode === "individual"}
                  aria-label="Volume view"
                  title="Volume View"
                  onClick={() => changeViewMode("individual")}
                >
                  ▦
                </button>
              </div>
              {isAdmin && (
                <button
                  className="manga-btn secondary"
                  type="button"
                  onClick={() => setShowHidden((v) => !v)}
                >
                  {showHidden ? "Hide Hidden" : "Show Hidden"}
                </button>
              )}
              {isAdmin && (
                <button
                  className={
                    "manga-btn secondary" + (multiMode ? " active" : "")
                  }
                  disabled={viewMode === "series"}
                  onClick={toggleMultiMode}
                >
                  {multiMode ? "Exit Multi-select" : "Multi-select"}
                </button>
              )}
            </div>
          </div>

          {/* Multi-select toolbar */}
          {isAdmin && multiMode && viewMode === "individual" && (
            <div className="manga-multiselect-bar">
              <span>
                Selected: <strong>{selectedIds.size}</strong>
              </span>
              <button className="manga-btn" onClick={openBulkEdit}>
                Bulk Edit
              </button>
              <button
                className="manga-btn secondary"
                onClick={() => applyMultiAction("move")}
              >
                Move to {activeTab === "library" ? "Wishlist" : "Library"}
              </button>
              {activeTab === "library" && (
                <>
                  <button
                    className="manga-btn"
                    onClick={() => applyMultiAction("markRead")}
                  >
                    Mark Read
                  </button>
                  <button
                    className="manga-btn secondary"
                    onClick={() => applyMultiAction("markUnread")}
                  >
                    Mark Unread
                  </button>
                </>
              )}
              <button
                className="manga-btn danger"
                onClick={() => applyMultiAction("delete")}
              >
                Delete
              </button>
            </div>
          )}
        </>
      )}

      {/* Main content */}
      {loading ? (
        <div className="manga-empty-state">Loading manga from Firestore...</div>
      ) : error ? (
        <div className="manga-empty-state">{error}</div>
      ) : displayList.length === 0 ? (
        <div className="manga-empty-state">
          No manga found. Try changing your search.
        </div>
      ) : (
        <div className="manga-grid">
          {displayList.map((b) =>
            viewMode === "series" ? renderSeriesCard(b) : renderCard(b)
          )}
        </div>
      )}

      {/* Series modal (shows volumes inside a series) */}
      {seriesModal && (
        <div
          className="manga-modal-backdrop visible"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeSeriesModal();
          }}
        >
          <div className="manga-modal series">
            <div className="manga-modal-body">
              <div className="manga-modal-header">
                <div className="manga-modal-title">
                  {seriesModal.series.title || "Series"}
                </div>
                <button className="manga-modal-close" onClick={closeSeriesModal} type="button" aria-label="Close">
                  X
                </button>
              </div>
              <div className="manga-modal-subtitle">
                {seriesModal.series.count} volume{seriesModal.series.count === 1 ? "" : "s"} in this series
              </div>
              {isAdmin && (
                <div className="series-bulk-controls">
                  <button
                    type="button"
                    className={"manga-btn mini secondary" + (multiMode ? " active" : "")}
                    onClick={() => toggleSeriesMultiMode(seriesModal.volumes)}
                  >
                    {multiMode ? "Exit Multi-select" : "Multi-select"}
                  </button>
                  {multiMode && (
                    <>
                      <button
                        type="button"
                        className="manga-btn mini secondary"
                        onClick={() => {
                          const ids = seriesModal.volumes.map((v) => v.id);
                          setSelectedIds(new Set(ids));
                        }}
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        className="manga-btn mini secondary"
                        onClick={() => {
                          setSelectedIds(new Set());
                        }}
                      >
                        Clear
                      </button>
                      {activeTab === "wishlist" ? (
                        <button
                          type="button"
                          className="manga-btn mini"
                          disabled={!selectedIds.size}
                          onClick={() => {
                            if (!selectedIds.size) return;
                            applyMultiAction("move", "library");
                          }}
                        >
                          Move to Library
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="manga-btn mini"
                          disabled={!selectedIds.size}
                          onClick={() => {
                            if (!selectedIds.size) return;
                            applyMultiAction("move", "wishlist");
                          }}
                        >
                          Move to Wishlist
                        </button>
                      )}
                      <button
                        type="button"
                        className="manga-btn mini"
                        disabled={!selectedIds.size}
                        onClick={() => {
                          if (!selectedIds.size) return;
                          const ids = new Set(seriesModal.volumes.map((v) => v.id));
                          setSelectedIds((prev) => new Set([...prev].filter((id) => ids.has(id))));
                          openBulkEdit();
                        }}
                      >
                        Bulk Edit Selected ({selectedIds.size || 0})
                      </button>
                    </>
                  )}
                </div>
              )}
              <div className="manga-series-modal-grid">
                {seriesModal.volumes.map((vol) => {
                  const volMeta = isMissingCoreMeta(vol, {
                    includeIsbn: vol.kind === "library",
                    includeFinance: vol.kind === "library",
                  });
                  return (
                    <div
                      key={vol.id}
                      className={
                        "manga-card mini-card" +
                        (vol.read ? " read" : "") +
                        (isAdmin && isMissingPageCount(vol) ? " missing-page" : "") +
                        (isAdmin && volMeta.any ? " missing-meta" : "")
                      }
                      onClick={() => {
                        if (!isAdmin) {
                          openModal(vol);
                          return;
                        }
                        if (multiMode) {
                          toggleCardSelection(vol.id);
                          return;
                        }
                        openModal(vol);
                      }}
                    >
                      <div className="manga-card-cover-wrap">
                        {multiMode && isAdmin && (
                          <div
                            className={
                              "mini-select-indicator" +
                              (selectedIds.has(vol.id) ? " selected" : "")
                            }
                          >
                            {selectedIds.has(vol.id) ? "X" : ""}
                          </div>
                        )}
                        <img
                          src={vol.cover || "https://imgur.com/chUgq4W.png"}
                          alt={vol.title || "Cover"}
                          loading="lazy"
                          decoding="async"
                        />
                      </div>
                      <div className="manga-card-body">
                        <div className="manga-card-title">{vol.title || "Untitled"}</div>
                        <div className="manga-card-meta">
                          <span className={volMeta.authorMissing ? "missing-field" : ""}>
                            {vol.authors && vol.authors !== "Unknown" ? vol.authors : "Missing author"}
                          </span>
                          <br />
                          <span className={volMeta.publisherMissing ? "missing-field" : ""}>
                            {vol.publisher && vol.publisher !== "Unknown" ? vol.publisher : "Missing publisher"}
                          </span>
                          <br />
                          <span className={volMeta.dateMissing ? "missing-field" : ""}>
                            {vol.date && vol.date !== "Unknown" ? vol.date : "Missing date"}
                          </span>
                        </div>
                        {vol.isbn ? (
                          <div className="manga-card-isbn">ISBN: {vol.isbn}</div>
                        ) : (
                          vol.kind === "library" &&
                          volMeta.isbnMissing && (
                            <div className="manga-card-isbn missing-field">Missing ISBN</div>
                          )
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="manga-floating-actions">
          <button
            className="manga-btn"
            type="button"
            aria-label="Add item"
            onClick={() => openAdminAdd(activeTab === "wishlist" ? "wishlist" : "library")}
          >
            + {activeTab === "wishlist" ? "Wishlist" : "Library"}
          </button>
          <div className="manga-export-actions">
            {admin && (
              <button
                className="manga-btn secondary"
                type="button"
                onClick={() => downloadJson({ library, wishlist }, "manga-library-wishlist.json")}
              >
                Export JSON
              </button>
            )}
            <button
              className="manga-btn secondary"
              type="button"
              onClick={() =>
                exportCSV(
                  activeTab === "library" ? library : wishlist,
                  activeTab === "library" ? "manga-library.csv" : "manga-wishlist.csv"
                )
              }
            >
              Export CSV
            </button>
            <button
              className="manga-btn secondary"
              type="button"
              onClick={() =>
                downloadImagesZip(
                  activeTab === "library" ? library : wishlist,
                  activeTab === "library" ? "manga-library-images.zip" : "manga-wishlist-images.zip"
                )
              }
            >
              Download Images
            </button>
          </div>
        </div>
      )}

      {/* Modal */}
      {modalBook && (
        <div
          className="manga-modal-backdrop visible"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div className="manga-modal">
            <div className="manga-modal-cover-wrap">
              {modalBook.kind === "library" && modalBook.read && (
                <div className="manga-modal-read-pill">Read</div>
              )}
              <img
                src={
                  modalBook.cover ||
                  "https://imgur.com/chUgq4W.png"
                }
                alt="Cover"
              />
            </div>
            <div className="manga-modal-body">
              <div className="manga-modal-header">
                <div className="manga-modal-title">
                  {modalBook.title || "Untitled"}
                </div>
                <button
                  className="manga-modal-close"
                  onClick={closeModal}
                  type="button"
                  aria-label="Close"
                >
                  X
                </button>
              </div>
              <div className="manga-modal-meta">
                {modalBook.authors && modalBook.authors !== "Unknown" && (
                  <>
                    <strong>Author(s):</strong> {modalBook.authors}
                    <br />
                  </>
                )}
                {modalBook.publisher && modalBook.publisher !== "Unknown" && (
                  <>
                    <strong>Publisher:</strong> {modalBook.publisher}
                    <br />
                  </>
                )}
                {modalBook.date && (
                  <>
                    <strong>Release:</strong> {modalBook.date}
                    <br />
                  </>
                )}
                {modalBook.isbn && (
                  <>
                    <strong>ISBN:</strong> {modalBook.isbn}
                    <br />
                  </>
                )}
              </div>
              <div className="manga-modal-details">
                {modalBook.pageCount && (
                  <>
                    <strong>Pages:</strong> {modalBook.pageCount}
                    <br />
                  </>
                )}
                <div style={{ margin: "6px 0" }}>
                  <strong>Rating:</strong>{" "}
                  <StarPicker
                    value={modalBook.rating || ""}
                    onChange={isAdmin ? (v) => handleInlineRating(modalBook, v) : undefined}
                    interactive={isAdmin}
                  />
                </div>
                {modalBook.amountPaid && (
                  <>
                    <strong>Amount Paid:</strong> ${modalBook.amountPaid}
                    <br />
                  </>
                )}
                {modalBook.msrp && (
                  <>
                    <strong>MSRP:</strong> ${modalBook.msrp}
                    <br />
                  </>
                )}
                {modalBook.collectiblePrice && (
                  <>
                    <strong>Collectible:</strong> $
                    {modalBook.collectiblePrice}
                    <br />
                  </>
                )}
                {modalBook.read && modalBook.dateRead && (
                  <>
                    <strong>Date Read:</strong> {modalBook.dateRead}
                    <br />
                  </>
                )}
                {modalBook.amazonURL && (
                  <div style={{ marginTop: "6px" }}>
                    <a
                      href={modalBook.amazonURL}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View on Amazon
                    </a>
                  </div>
                )}
              </div>
              <div className="manga-modal-footer" style={{ gap: "10px", alignItems: "center" }}>
                <div>
                  {modalBook.kind === "library" && modalBook.read
                    ? "Marked as read in your library."
                    : modalBook.kind === "library"
                    ? "In your library (unread)."
                    : "Wishlist item - not in library yet."}
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {isAdmin && (
                    <button
                      className="manga-btn mini secondary"
                      type="button"
                      onClick={() => openAdminEdit(modalBook)}
                    >
                      Edit
                    </button>
                  )}
                  {modalBook.kind === "library" && isAdmin && (
                    <>
                      {!modalBook.read ? (
                        <button
                          className="manga-btn mini"
                          disabled={modalSaving}
                          onClick={() => handleInlineRead(modalBook, true)}
                          type="button"
                        >
                          Mark as read
                        </button>
                      ) : (
                        <button
                          className="manga-btn mini secondary"
                          disabled={modalSaving}
                          onClick={() => handleInlineRead(modalBook, false)}
                          type="button"
                        >
                          Mark as unread
                        </button>
                      )}
                    </>
                  )}
                  {isAdmin && (
                    <button
                      className="manga-btn mini"
                      type="button"
                      onClick={() => moveSingle(modalBook)}
                    >
                      Move to {modalBook.kind === "library" ? "Wishlist" : "Library"}
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      className="manga-btn mini danger"
                      type="button"
                      onClick={() => deleteSingle(modalBook.id, modalBook.kind === "library" ? "library" : "wishlist")}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Admin form modal */}
      {isAdmin && adminForm.open && (
        <div
          className="manga-modal-backdrop visible"
          onClick={(e) => {
            if (e.target === e.currentTarget) resetAdminForm();
          }}
        >
          <div className="manga-modal admin">
            <div className="manga-modal-body">
              <div className="manga-modal-header">
                <div className="manga-modal-title">
                  {adminForm.mode === "add" ? "Add Entry" : "Edit Entry"}
                </div>
                <button
                  className="manga-modal-close"
                  onClick={resetAdminForm}
                  type="button"
                  aria-label="Close"
                >
                  X
                </button>
              </div>

              <div className="admin-form-layout">
                <div className="admin-cover-frame">
                  <img
                    src={adminForm.data.cover || "https://imgur.com/chUgq4W.png"}
                    alt="Cover preview"
                  />
                </div>

                <div className="admin-form-fields">
                  <div className="admin-row">
                    <label>
                      Title
                      <input
                        type="text"
                        value={adminForm.data.title}
                        onChange={(e) => handleAdminChange("title", e.target.value)}
                      />
                    </label>
                  </div>
                  {titleMatches.length > 0 && (
                    <div className="title-suggestions">
                      {titleMatches.map((s, i) => (
                        <button
                          key={s + i}
                          type="button"
                          className="manga-btn mini"
                          onClick={() => handleAdminChange("title", s)}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="admin-row two" style={{ alignItems: "flex-end", marginTop: "-8px" }}>
                    <div>
                      <div className="manga-modal-subtitle" style={{ marginBottom: "6px" }}>
                        Entry {volumeIndex + 1} / {Math.max(1, volumeEntries.length || 1)}
                      </div>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button
                          className="manga-btn secondary"
                          type="button"
                          onClick={() => volumeIndex > 0 && goVolumeEntry(volumeIndex - 1)}
                          disabled={volumeIndex === 0}
                        >
                          Previous
                        </button>
                        <button
                          className="manga-btn secondary"
                          type="button"
                          onClick={() =>
                            volumeEntries.length && volumeIndex < volumeEntries.length - 1
                              ? goVolumeEntry(volumeIndex + 1)
                              : null
                          }
                          disabled={!volumeEntries.length || volumeIndex === volumeEntries.length - 1}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <button
                        className="manga-btn"
                        type="button"
                        onClick={addNewVolumeEntry}
                        disabled={!parseTitleForSort(adminForm.data.title || "").vol}
                      >
                        Add New Volume
                      </button>
                      <div className="manga-stat-sub" style={{ marginTop: "4px" }}>
                        Auto-fills the next volume number for this series.
                      </div>
                    </div>
                  </div>

                  <div className="admin-row">
                    <label className={adminMissing.author ? "missing-field-input" : ""}>
                      Authors
                      <input
                        type="text"
                        value={adminForm.data.authors}
                        onChange={(e) => handleAdminChange("authors", e.target.value)}
                      />
                    </label>
                  </div>

                  <div className="admin-row">
                    <label className={adminMissing.publisher ? "missing-field-input" : ""}>
                      Publisher
                      <input
                        type="text"
                        value={adminForm.data.publisher}
                        onChange={(e) => handleAdminChange("publisher", e.target.value)}
                      />
                    </label>
                  </div>

                  <div className="admin-row three">
                    <label className={adminMissing.date ? "missing-field-input" : ""}>
                      Release Date
                      <input
                        type="date"
                        value={adminForm.data.date}
                        onChange={(e) => handleAdminChange("date", e.target.value)}
                      />
                    </label>
                    <label className={adminMissing.purchaseDate ? "missing-field-input" : ""}>
                      Purchase Date
                      <input
                        type="date"
                        value={adminForm.data.datePurchased}
                        onChange={(e) => handleAdminChange("datePurchased", e.target.value)}
                      />
                    </label>
                    {!isWishlistForm && (
                      <label>
                        Date Read
                        <input
                          type="date"
                          value={adminForm.data.dateRead}
                          onChange={(e) => handleAdminChange("dateRead", e.target.value)}
                        />
                      </label>
                    )}
                  </div>

                  <div className="admin-row two">
                    <label className={adminMissing.page ? "missing-field-input" : ""}>
                      Page Count
                      <input
                        type="number"
                        placeholder="e.g. 192"
                        value={adminForm.data.pageCount}
                        onChange={(e) => handleAdminChange("pageCount", e.target.value)}
                      />
                    </label>
                    {!isWishlistForm && (
                      <label className={adminMissing.isbn ? "missing-field-input" : ""}>
                        ISBN (library only)
                        <input
                          type="text"
                          value={adminForm.data.isbn}
                          onChange={(e) => handleAdminChange("isbn", e.target.value)}
                        />
                      </label>
                    )}
                  </div>

                  <div className="admin-row">
                    <label>
                      Cover URL
                      <input
                        type="text"
                        placeholder="Paste image URL here"
                        value={adminForm.data.cover}
                        onChange={(e) => handleAdminChange("cover", e.target.value)}
                      />
                    </label>
                  </div>

                  {!isWishlistForm && (
                    <>
                      <div className="admin-row two">
                        {!(adminForm.data.special && adminForm.data.specialType === "collectible") && (
                          <label className={adminMissing.amountPaid ? "missing-field-input" : ""}>
                            Amount Paid
                            <input
                              type="number"
                              step="0.01"
                              value={adminForm.data.amountPaid}
                              onChange={(e) => handleAdminChange("amountPaid", e.target.value)}
                            />
                          </label>
                        )}
                        <label className={adminMissing.msrp ? "missing-field-input" : ""}>
                          MSRP
                          <input
                            type="number"
                            step="0.01"
                            value={adminForm.data.msrp}
                            onChange={(e) => handleAdminChange("msrp", e.target.value)}
                          />
                        </label>
                      </div>

                      <div className="admin-row">
                        <label className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={!!adminForm.data.special}
                            onChange={(e) => handleAdminChange("special", e.target.checked, "checkbox")}
                          />
                          <span>Special item?</span>
                        </label>
                      </div>
                      {adminForm.data.special && (
                        <>
                          <div className="admin-row two">
                          <label>
                            Special Type
                            <select
                              value={adminForm.data.specialType}
                              onChange={(e) => handleAdminChange("specialType", e.target.value)}
                            >
                              <option value="">Select type</option>
                              <option value="specialEdition">Special Edition</option>
                              <option value="collectible">Collectible</option>
                            </select>
                          </label>
                          {adminForm.data.specialType === "collectible" && (
                              <label className={adminMissing.collectiblePrice ? "missing-field-input" : ""}>
                                Collectible Price
                                <input
                                  type="number"
                                  step="0.01"
                                  value={adminForm.data.collectiblePrice}
                                  onChange={(e) =>
                                    handleAdminChange("collectiblePrice", e.target.value)
                                  }
                                />
                              </label>
                            )}
                          </div>
                          {adminForm.data.specialType === "specialEdition" && (
                            <div className="admin-row">
                              <label>
                                Special Volumes
                                <input
                                  type="number"
                                  min="0"
                                  value={adminForm.data.specialVolumes}
                                  onChange={(e) =>
                                    handleAdminChange("specialVolumes", e.target.value)
                                  }
                                />
                              </label>
                            </div>
                          )}
                        </>
                      )}
                    </>
                  )}
                  {isWishlistForm && (
                    <div className="admin-row">
                      <label>
                        Amazon URL
                        <input
                          type="text"
                          value={adminForm.data.amazonURL}
                          onChange={(e) => handleAdminChange("amazonURL", e.target.value)}
                        />
                      </label>
                    </div>
                  )}

                  {!isWishlistForm && (
                    <>
                      <div className="admin-row">
                        <label>
                          Rating (1-5 stars)
                          <StarPicker
                            value={adminForm.data.rating}
                            onChange={(v) => handleAdminChange("rating", v)}
                          />
                        </label>
                      </div>

                      <div className="admin-row two">
                        <label className="checkbox-inline">
                          <input
                            type="checkbox"
                            checked={adminForm.data.read}
                            onChange={(e) =>
                              handleAdminChange("read", e.target.checked, "checkbox")
                            }
                          />
                          <span>Mark as read</span>
                        </label>
                        <label className="checkbox-inline">
                          <input
                            type="checkbox"
                            checked={!!adminForm.data.hidden}
                            onChange={(e) =>
                              handleAdminChange("hidden", e.target.checked, "checkbox")
                            }
                          />
                          <span>Hide from public</span>
                        </label>
                      </div>
                    </>
                  )}
                  {isWishlistForm && (
                    <div className="admin-row">
                      <label className="checkbox-inline">
                        <input
                          type="checkbox"
                          checked={!!adminForm.data.hidden}
                          onChange={(e) =>
                            handleAdminChange("hidden", e.target.checked, "checkbox")
                          }
                        />
                        <span>Hide from public</span>
                      </label>
                    </div>
                  )}
                </div>
              </div>

              <div
                className="manga-modal-footer"
                style={{ justifyContent: "flex-end", gap: "10px" }}
              >
                <button className="manga-btn secondary" onClick={resetAdminForm} type="button">
                  Cancel
                </button>
                <button className="manga-btn" onClick={saveAdminForm} type="button">
                  {adminForm.mode === "add" ? "Add" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk edit modal */}
      {isAdmin && bulkEdit.open && (
        <div
          className="manga-modal-backdrop visible"
          onClick={(e) => {
            if (e.target === e.currentTarget) resetBulkEdit();
          }}
        >
          <div className="manga-modal admin">
            <div className="manga-modal-body">
              <div className="manga-modal-header">
                <div className="manga-modal-title">
                  Bulk Edit ({bulkEdit.index + 1} / {bulkEdit.items.length})
                </div>
                <button
                  className="manga-modal-close"
                  onClick={resetBulkEdit}
                  type="button"
                  aria-label="Close"
                >
                  X
                </button>
              </div>

              {bulkEdit.items.length > 0 && (
                <>
                  <div className="manga-modal-subtitle">
                    Editing: {bulkEdit.items[bulkEdit.index].data.title || "Untitled"}
                  </div>
                  <div className="admin-form-grid two-col">
                    <div className="admin-cover">
                      <div className="manga-card-cover-wrap">
                        <img
                          src={bulkEdit.items[bulkEdit.index].data.cover || "https://imgur.com/chUgq4W.png"}
                          alt={bulkEdit.items[bulkEdit.index].data.title || "Cover"}
                          loading="lazy"
                          decoding="async"
                        />
                      </div>
                    </div>

                    <div className="admin-fields">
                      <div className="admin-row two">
                        <label className="full">
                          Title
                          <input
                            type="text"
                            value={bulkEdit.items[bulkEdit.index].data.title}
                            onChange={(e) => handleBulkChange("title", e.target.value)}
                          />
                        </label>
                        <div className="admin-entry-info">Entry {bulkEdit.index + 1} / {bulkEdit.items.length}</div>
                      </div>

                      <div className="admin-row">
                        <label className={bulkMissing.author ? "missing-field-input" : ""}>
                          Authors
                          <input
                            type="text"
                            value={bulkEdit.items[bulkEdit.index].data.authors}
                            onChange={(e) => handleBulkChange("authors", e.target.value)}
                          />
                        </label>
                      </div>

                      <div className="admin-row">
                        <label className={bulkMissing.publisher ? "missing-field-input" : ""}>
                          Publisher
                          <input
                            type="text"
                            value={bulkEdit.items[bulkEdit.index].data.publisher}
                            onChange={(e) => handleBulkChange("publisher", e.target.value)}
                          />
                        </label>
                      </div>

                      <div className="admin-row three">
                        <label className={bulkMissing.date ? "missing-field-input" : ""}>
                          Release Date
                          <input
                            type="date"
                            value={bulkEdit.items[bulkEdit.index].data.date}
                            onChange={(e) => handleBulkChange("date", e.target.value)}
                          />
                        </label>
                        <label className={bulkMissing.purchaseDate ? "missing-field-input" : ""}>
                          Purchase Date
                          <input
                            type="date"
                            value={bulkEdit.items[bulkEdit.index].data.datePurchased}
                            onChange={(e) => handleBulkChange("datePurchased", e.target.value)}
                          />
                        </label>
                        {!bulkIsWishlist && (
                          <label>
                            Date Read
                            <input
                              type="date"
                              value={bulkEdit.items[bulkEdit.index].data.dateRead}
                              onChange={(e) => handleBulkChange("dateRead", e.target.value)}
                            />
                          </label>
                        )}
                      </div>

                      <div className="admin-row two">
                        <label className={bulkMissing.page ? "missing-field-input" : ""}>
                          Page Count
                          <input
                            type="number"
                            value={bulkEdit.items[bulkEdit.index].data.pageCount}
                            onChange={(e) => handleBulkChange("pageCount", e.target.value)}
                          />
                        </label>
                        {!bulkIsWishlist && (
                          <label className={bulkMissing.isbn ? "missing-field-input" : ""}>
                            ISBN (library only)
                            <input
                              type="text"
                              value={bulkEdit.items[bulkEdit.index].data.isbn}
                              onChange={(e) => handleBulkChange("isbn", e.target.value)}
                            />
                          </label>
                        )}
                      </div>

                      <div className="admin-row">
                        <label>
                          Cover URL
                          <input
                            type="text"
                            value={bulkEdit.items[bulkEdit.index].data.cover}
                            onChange={(e) => handleBulkChange("cover", e.target.value)}
                          />
                        </label>
                      </div>

                      {!bulkIsWishlist && (
                        <div className="admin-row two">
                          <label className={bulkMissing.amountPaid ? "missing-field-input" : ""}>
                            Amount Paid
                            <input
                              type="number"
                              step="0.01"
                              value={bulkEdit.items[bulkEdit.index].data.amountPaid}
                              onChange={(e) => handleBulkChange("amountPaid", e.target.value)}
                            />
                          </label>
                          <label className={bulkMissing.msrp ? "missing-field-input" : ""}>
                            MSRP
                            <input
                              type="number"
                              step="0.01"
                              value={bulkEdit.items[bulkEdit.index].data.msrp}
                              onChange={(e) => handleBulkChange("msrp", e.target.value)}
                            />
                          </label>
                        </div>
                      )}

                      {!bulkIsWishlist && (
                        <div className="admin-row two">
                          <div>
                            <div className="star-label">Rating (1-5 stars)</div>
                            <StarPicker
                              value={bulkEdit.items[bulkEdit.index].data.rating}
                              onChange={(v) => handleBulkChange("rating", v)}
                            />
                          </div>
                        </div>
                      )}

                      {!bulkIsWishlist && (
                        <div className="admin-row two">
                          <label className="checkbox-row">
                            <input
                              type="checkbox"
                              checked={!!bulkEdit.items[bulkEdit.index].data.special}
                              onChange={(e) =>
                                handleBulkChange("special", e.target.checked, "checkbox")
                              }
                            />
                            <span>Special item?</span>
                          </label>
                          <label className="checkbox-row">
                            <input
                              type="checkbox"
                              checked={bulkEdit.items[bulkEdit.index].data.read}
                              onChange={(e) =>
                                handleBulkChange("read", e.target.checked, "checkbox")
                              }
                            />
                            <span>Mark as read</span>
                          </label>
                        </div>
                      )}

                      {bulkEdit.items[bulkEdit.index].data.special && !bulkIsWishlist && (
                        <div className="admin-row two">
                          <label>
                            Special Type
                            <select
                              value={bulkEdit.items[bulkEdit.index].data.specialType}
                              onChange={(e) => handleBulkChange("specialType", e.target.value)}
                            >
                              <option value="">Select type</option>
                              <option value="specialEdition">Special Edition</option>
                              <option value="collectible">Collectible</option>
                            </select>
                          </label>
                          {bulkEdit.items[bulkEdit.index].data.specialType === "specialEdition" && (
                            <label>
                              Special Volumes
                              <input
                                type="number"
                                value={bulkEdit.items[bulkEdit.index].data.specialVolumes}
                                onChange={(e) =>
                                  handleBulkChange("specialVolumes", e.target.value)
                                }
                              />
                            </label>
                          )}
                          {bulkEdit.items[bulkEdit.index].data.specialType === "collectible" && (
                            <label className={bulkMissing.collectiblePrice ? "missing-field-input" : ""}>
                              Collectible Price
                              <input
                                type="number"
                                step="0.01"
                                value={bulkEdit.items[bulkEdit.index].data.collectiblePrice}
                                onChange={(e) =>
                                  handleBulkChange("collectiblePrice", e.target.value)
                                }
                              />
                            </label>
                          )}
                        </div>
                      )}

                      {bulkIsWishlist && (
                        <div className="admin-row two">
                          <label>
                            Amazon URL
                            <input
                              type="text"
                              value={bulkEdit.items[bulkEdit.index].data.amazonURL}
                              onChange={(e) => handleBulkChange("amazonURL", e.target.value)}
                            />
                          </label>
                          <label className="checkbox-row">
                            <input
                              type="checkbox"
                              checked={!!bulkEdit.items[bulkEdit.index].data.hidden}
                              onChange={(e) =>
                                handleBulkChange("hidden", e.target.checked, "checkbox")
                              }
                            />
                            <span>Hidden from public</span>
                          </label>
                        </div>
                      )}
                      {!bulkIsWishlist && (
                        <div className="admin-row">
                          <label className="checkbox-row">
                            <input
                              type="checkbox"
                              checked={!!bulkEdit.items[bulkEdit.index].data.hidden}
                              onChange={(e) =>
                                handleBulkChange("hidden", e.target.checked, "checkbox")
                              }
                            />
                            <span>Hidden from public</span>
                          </label>
                        </div>
                      )}
                    </div>
                  </div>

                  <div
                    className="manga-modal-footer"
                    style={{ justifyContent: "space-between", gap: "10px" }}
                  >
                    <div>
                      <button
                        className="manga-btn secondary"
                        onClick={bulkPrev}
                        type="button"
                        disabled={bulkEdit.index === 0}
                      >
                        Previous
                      </button>
                      <button
                        className="manga-btn secondary"
                        onClick={bulkNext}
                        type="button"
                        disabled={bulkEdit.index === bulkEdit.items.length - 1}
                        style={{ marginLeft: "6px" }}
                      >
                        Next
                      </button>
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button className="manga-btn secondary" onClick={resetBulkEdit} type="button">
                        Cancel
                      </button>
                      <button className="manga-btn" onClick={applyBulkSave} type="button">
                        Save Edits
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {canSuggest && (
        <SuggestionModal
          open={suggestionOpen}
          title="Suggest a Manga"
          placeholder="Type a manga you'd like me to collect/read..."
          value={suggestionText}
          status={suggestionStatus}
          loading={suggestionSending}
          onChange={setSuggestionText}
          onSubmit={submitSuggestion}
          onClose={() => setSuggestionOpen(false)}
        />
      )}
      <datalist id="adminTitleSuggestions">
        {titleSuggestions.map((t) => (
          <option value={t} key={t} />
        ))}
      </datalist>
    </div>
  );
}
