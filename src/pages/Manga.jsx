// src/pages/Manga.jsx
import React, { useEffect, useMemo, useState } from "react";
import "../styles/manga.css";
import { db } from "../firebaseConfig";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { useAuth } from "../contexts/AuthContext";

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
  const { admin } = useAuth();
  const isAdmin = admin;

  const [activeTab, setActiveTab] = useState("library"); // 'library' | 'wishlist'

  const [library, setLibrary] = useState([]);
  const [wishlist, setWishlist] = useState([]);
  const [titleSuggestions, setTitleSuggestions] = useState([]);
  const [titleMatches, setTitleMatches] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [searchLibrary, setSearchLibrary] = useState("");
  const [searchWishlist, setSearchWishlist] = useState("");

  const [multiMode, setMultiMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const [modalBook, setModalBook] = useState(null);
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
  const [bulkEdit, setBulkEdit] = useState({
    open: false,
    index: 0,
    items: [], // [{id, kind, data}]
  });

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

    async function loadAll() {
      setLoading(true);
      setError("");
      try {
        await Promise.all([loadLibrary(), loadWishlist()]);
        if (!cancelled) setLoading(false);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError("Failed to load manga data from Firestore.");
          setLoading(false);
        }
      }
    }

    loadAll();
    return () => {
      cancelled = true;
    };
  }, []);

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

  async function applyMultiAction(action) {
    if (!isAdmin) {
      alert("Multi-select actions require admin access.");
      return;
    }
    const ids = Array.from(selectedIds);
    if (!ids.length) {
      alert("Select at least one item first.");
      return;
    }

    const isLibraryTab = activeTab === "library";

    try {
      if (action === "move") {
        if (isLibraryTab) {
          if (!window.confirm(`Move ${ids.length} item(s) to Wishlist?`)) return;
          for (const id of ids) {
            const item = library.find((x) => x.id === id);
            if (!item) continue;
            const payload = {
              title: item.title,
              authors: item.authors,
              publisher: item.publisher,
              date: item.date,
              isbn: item.isbn,
              pageCount: item.pageCount || "",
              cover: item.cover,
              amazonURL: item.amazonURL || "",
              specialType: item.specialType || "",
              specialVolumes: item.specialVolumes || "",
              collectiblePrice: item.collectiblePrice || "",
              rating: item.rating || "",
            };
            await addDoc(collection(db, "wishlist"), payload);
            await deleteDoc(doc(db, "library", id));
          }
        } else {
          if (!window.confirm(`Move ${ids.length} item(s) to Library?`)) return;
          for (const id of ids) {
            const item = wishlist.find((x) => x.id === id);
            if (!item) continue;
            const payload = {
              title: item.title,
              authors: item.authors,
              publisher: item.publisher,
              date: item.date,
              isbn: item.isbn,
              pageCount: item.pageCount || "",
              cover: item.cover,
              amountPaid: "",
              read: false,
              rating: "",
              specialType: item.specialType || "",
              specialVolumes: item.specialVolumes || "",
              collectiblePrice: item.collectiblePrice || "",
            };
            await addDoc(collection(db, "library"), payload);
            await deleteDoc(doc(db, "wishlist", id));
          }
        }
      } else if (action === "markRead" && isLibraryTab) {
        for (const id of ids) {
          await updateDoc(doc(db, "library", id), {
            read: true,
            dateRead: new Date().toISOString().slice(0, 10),
          });
        }
      } else if (action === "markUnread" && isLibraryTab) {
        for (const id of ids) {
          await updateDoc(doc(db, "library", id), {
            read: false,
            dateRead: "",
            rating: "",
          });
        }
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

  // ----- Rendering helpers -----

  const resetAdminForm = () =>
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
        specialType: "",
        specialVolumes: "",
        collectiblePrice: "",
        amazonURL: "",
        read: false,
      },
      multiAdd: false,
      startVol: "",
      endVol: "",
    }));

  const seriesVolumeMap = useMemo(() => {
    const map = new Map();
    [...library, ...wishlist].forEach((item) => {
      const parsed = parseTitleForSort(item.title || "");
      if (!parsed.name) return;
      if (!map.has(parsed.name)) {
        const display =
          (item.title || "").replace(/,?\s*Vol\.?\s*\d+.*/i, "").trim() ||
          item.title ||
          parsed.name;
        map.set(parsed.name, { display, maxVol: parsed.vol });
      } else {
        const cur = map.get(parsed.name);
        cur.maxVol = Math.max(cur.maxVol, parsed.vol);
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
  };

  const openAdminEdit = (book) => {
    setAdminForm({
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
        specialType: book.specialType || "",
        specialVolumes: book.specialVolumes || "",
        collectiblePrice: book.collectiblePrice || "",
        amazonURL: book.amazonURL || "",
        read: !!book.read,
      },
    });
  };

  const handleAdminChange = (field, value, type = "text") => {
    setAdminForm((prev) => ({
      ...prev,
      data: {
        ...prev.data,
        [field]: type === "checkbox" ? !!value : value,
      },
    }));

    if (field === "title") {
      const input = String(value || "").trim().toLowerCase();
      if (!input) {
        setTitleMatches([]);
      } else {
        const matches = [];
        seriesVolumeMap.forEach((val, key) => {
          if (val.display.toLowerCase().includes(input)) {
            const nextVol = val.maxVol > 0 ? val.maxVol + 1 : 1;
            matches.push(`${val.display}, Vol. ${nextVol}`);
          }
        });
        setTitleMatches(matches.slice(0, 6));
      }
    }
  };

  async function saveAdminForm() {
    if (!isAdmin) return;
    const { mode, list, data, editingId, multiAdd, startVol, endVol } = adminForm;
    const targetList = list || "library";
    if (!data.title.trim()) {
      alert("Title is required.");
      return;
    }
    const buildPayload = (overrideTitle) => ({
      title: overrideTitle || data.title.trim(),
      authors: data.authors.trim(),
      publisher: data.publisher.trim(),
      demographic: data.demographic.trim(),
      genre: data.genre.trim(),
      subGenre: data.subGenre.trim(),
      date: data.date.trim(),
      cover: data.cover.trim(),
      isbn: data.isbn.trim(),
      pageCount: data.pageCount === "" ? "" : Number(data.pageCount),
      rating:
        data.rating === "" ? "" : Math.max(0.5, Math.min(5, Number(data.rating))),
      amountPaid: data.amountPaid === "" ? "" : Number(data.amountPaid),
      dateRead: data.dateRead.trim(),
      datePurchased: data.datePurchased.trim(),
      msrp: data.msrp === "" ? "" : Number(data.msrp),
      specialType: data.specialType.trim(),
      specialVolumes: data.specialVolumes === "" ? "" : Number(data.specialVolumes),
      collectiblePrice:
        data.collectiblePrice === "" ? "" : Number(data.collectiblePrice),
      amazonURL: data.amazonURL.trim(),
      read: !!data.read,
      kind: list,
    });
    try {
      if (mode === "add" && multiAdd) {
        const start = Number(startVol || 0);
        const end = Number(endVol || 0);
        if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end < start) {
          alert("Provide valid start/end volumes (start > 0, end >= start).");
          return;
        }
        const writes = [];
        for (let v = start; v <= end; v++) {
          const title = `${data.title.trim()} Vol. ${v}`;
          writes.push(addDoc(collection(db, targetList), buildPayload(title)));
        }
        await Promise.all(writes);
      } else if (mode === "add") {
        await addDoc(collection(db, targetList), buildPayload());
      } else if (mode === "edit" && editingId) {
        await updateDoc(doc(db, targetList, editingId), buildPayload());
      }
      await Promise.all([loadLibrary(), loadWishlist()]);
      resetAdminForm();
    } catch (err) {
      console.error(err);
      alert("Failed to save entry.");
    }
  }

  async function deleteSingle(bookId, kind) {
    if (!isAdmin) return;
    if (!window.confirm("Delete this entry?")) return;
    try {
      await deleteDoc(doc(db, kind, bookId));
      await Promise.all([loadLibrary(), loadWishlist()]);
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

  async function saveInline(book, payload) {
    if (!book?.id) return;
    const col = book.kind === "wishlist" ? "wishlist" : "library";
    setModalSaving(true);
    try {
      await updateDoc(doc(db, col, book.id), payload);
      await Promise.all([loadLibrary(), loadWishlist()]);
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
    saveInline(book, { rating: ratingValue });
  };

  const handleInlineRead = (book, readState) => {
    if (!book) return;
    const payload = readState
      ? { read: true, dateRead: new Date().toISOString().slice(0, 10) }
      : { read: false, dateRead: "" };
    saveInline(book, payload);
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
        specialType: b.specialType || "",
        specialVolumes: b.specialVolumes || "",
        collectiblePrice: b.collectiblePrice || "",
        amazonURL: b.amazonURL || "",
        read: !!b.read,
      },
    }));
    setBulkEdit({ open: true, index: 0, items });
  };

  const handleBulkChange = (field, value, type = "text") => {
    setBulkEdit((prev) => {
      const items = [...prev.items];
      const current = { ...items[prev.index] };
      current.data = {
        ...current.data,
        [field]: type === "checkbox" ? !!value : value,
      };
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
      const promises = updates.map((item) => {
        const payload = {
          ...item.data,
          pageCount: item.data.pageCount === "" ? "" : Number(item.data.pageCount),
          rating:
            item.data.rating === ""
              ? ""
              : Math.max(0.5, Math.min(5, Number(item.data.rating))),
          amountPaid: item.data.amountPaid === "" ? "" : Number(item.data.amountPaid),
          msrp: item.data.msrp === "" ? "" : Number(item.data.msrp),
          collectiblePrice:
            item.data.collectiblePrice === "" ? "" : Number(item.data.collectiblePrice),
          specialVolumes:
            item.data.specialVolumes === "" ? "" : Number(item.data.specialVolumes),
          read: !!item.data.read,
        };
        const target = item.kind === "wishlist" ? "wishlist" : "library";
        return updateDoc(doc(db, target, item.id), payload);
      });
      await Promise.all(promises);
      await Promise.all([loadLibrary(), loadWishlist()]);
      setSelectedIds(new Set());
      setMultiMode(false);
      resetBulkEdit();
    } catch (err) {
      console.error(err);
      alert("Failed to save bulk edits.");
    }
  }

  function renderCard(book) {
    const selected = selectedIds.has(book.id);
    const isLibraryCard = book.kind === "library";

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
          (selected ? " multiselect-selected" : "")
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
            {book.authors && book.authors !== "Unknown" && (
              <>
                {book.authors}
                <br />
              </>
            )}
            {book.publisher && book.publisher !== "Unknown" && (
              <>
                {book.publisher}
                <br />
              </>
            )}
            {book.date && book.date !== "Unknown" && book.date}
          </div>
          {book.isbn && (
            <div className="manga-card-isbn">ISBN: {book.isbn}</div>
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

  const StarPicker = ({ value, onChange }) => {
    const [hoverVal, setHoverVal] = useState(null);
    const baseVal = Math.max(0, Math.min(5, Number(value) || 0));
    const displayVal = hoverVal != null ? hoverVal : baseVal;
    const pct = (displayVal / 5) * 100;
    const steps = Array.from({ length: 10 }, (_, i) => (i + 1) * 0.5);

    const renderStars = (filled) => {
      const color = filled ? "#ff7ccf" : "rgba(255, 182, 193, 0.25)";
      return Array.from({ length: 5 }, (_, i) => (
        <svg
          key={i}
          viewBox="0 0 24 24"
          aria-hidden="true"
          style={{ width: "30px", height: "30px" }}
        >
          <path
            fill={color}
            d="M12 2.5l2.9 5.88 6.5.95-4.7 4.58 1.1 6.43L12 17.9l-5.8 3.44 1.1-6.43-4.7-4.58 6.5-.95L12 2.5z"
          />
        </svg>
      ));
    };

    return (
      <div className="star-shell" role="group" aria-label="Rating">
        <div className="star-visual">
          <div className="star-layer track">{renderStars(false)}</div>
          <div className="star-layer fill" style={{ width: `${pct}%` }}>
            {renderStars(true)}
          </div>
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
        </div>
        <div className="star-value">{displayVal ? displayVal.toFixed(1) : "--"}</div>
        <button
          type="button"
          className="star-clear"
          onClick={() => onChange("")}
          aria-label="Clear rating"
        >
          clear
        </button>
      </div>
    );
  };

  const currentList = activeTab === "library" ? filteredLibrary : filteredWishlist;

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

  const exportImagesList = (rows, filename) => {
    const urls = Array.from(
      new Set(
        rows
          .map((r) => r.cover)
          .filter(Boolean)
      )
    );
    const blob = new Blob([urls.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="manga-page">
      <header className="manga-header">
        <div>
          <div className="manga-header-title">
            Tyler&apos;s Manga Library
            <span className="manga-badge">Firestore synced</span>
          </div>
          <div className="manga-header-sub">
            Library &amp; Wishlist are managed via Firestore. This React port reuses the
            same collections as your original index.html.
          </div>
        </div>
        {isAdmin && (
          <div className="manga-admin-actions">
            <button
              className="manga-btn"
              onClick={() => openAdminAdd(activeTab === "wishlist" ? "wishlist" : "library")}
            >
              Add {activeTab === "wishlist" ? "Wishlist" : "Library"} Item
            </button>
            <button
              className="manga-btn secondary"
              type="button"
              onClick={() =>
                exportJSON(
                  activeTab === "library" ? library : wishlist,
                  activeTab === "library" ? "manga-library.json" : "manga-wishlist.json"
                )
              }
            >
              Export JSON
            </button>
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
                exportImagesList(
                  activeTab === "library" ? library : wishlist,
                  activeTab === "library" ? "manga-library-images.txt" : "manga-wishlist-images.txt"
                )
              }
            >
              Download Images
            </button>
          </div>
        )}
      </header>

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
                {activeTab === "library" ? (
                  <>
                    Library: {filteredLibrary.length} / {library.length}
                  </>
                ) : (
                  <>
                    Wishlist: {filteredWishlist.length} / {wishlist.length}
                  </>
                )}
              </div>
            </div>

            <div className="manga-toolbar-right">
              {isAdmin && (
                <button
                  className={
                    "manga-btn secondary" + (multiMode ? " active" : "")
                  }
                  onClick={toggleMultiMode}
                >
                  {multiMode ? "Exit Multi-select" : "Multi-select"}
                </button>
              )}
            </div>
          </div>

          {/* Multi-select toolbar */}
          {isAdmin && multiMode && (
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
      ) : currentList.length === 0 ? (
        <div className="manga-empty-state">
          No manga found. Try changing your search.
        </div>
      ) : (
        <div className="manga-grid">
          {currentList.map((b) => renderCard(b))}
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
                >
                  Close
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
                    onChange={(v) => handleInlineRating(modalBook, v)}
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
                {modalBook.kind === "library" && (
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
                >
                  Close
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

                  <div className="admin-row">
                    <label>
                      Authors
                      <input
                        type="text"
                        value={adminForm.data.authors}
                        onChange={(e) => handleAdminChange("authors", e.target.value)}
                      />
                    </label>
                  </div>

                  <div className="admin-row">
                    <label>
                      Publisher
                      <input
                        type="text"
                        value={adminForm.data.publisher}
                        onChange={(e) => handleAdminChange("publisher", e.target.value)}
                      />
                    </label>
                  </div>

                  <div className="admin-row three">
                    <label>
                      Release Date
                      <input
                        type="date"
                        value={adminForm.data.date}
                        onChange={(e) => handleAdminChange("date", e.target.value)}
                      />
                    </label>
                    <label>
                      Date Purchased
                      <input
                        type="date"
                        value={adminForm.data.datePurchased}
                        onChange={(e) => handleAdminChange("datePurchased", e.target.value)}
                      />
                    </label>
                    <label>
                      Date Read
                      <input
                        type="date"
                        value={adminForm.data.dateRead}
                        onChange={(e) => handleAdminChange("dateRead", e.target.value)}
                      />
                    </label>
                  </div>

                  <div className="admin-row two">
                    <label>
                      Page Count
                      <input
                        type="number"
                        placeholder="e.g. 192"
                        value={adminForm.data.pageCount}
                        onChange={(e) => handleAdminChange("pageCount", e.target.value)}
                      />
                    </label>
                    <label>
                      ISBN (library only)
                      <input
                        type="text"
                        value={adminForm.data.isbn}
                        onChange={(e) => handleAdminChange("isbn", e.target.value)}
                      />
                    </label>
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

                  <div className="admin-row two">
                    <label>
                      Amount Paid
                      <input
                        type="number"
                        step="0.01"
                        value={adminForm.data.amountPaid}
                        onChange={(e) => handleAdminChange("amountPaid", e.target.value)}
                      />
                    </label>
                    <label>
                      MSRP
                      <input
                        type="number"
                        step="0.01"
                        value={adminForm.data.msrp}
                        onChange={(e) => handleAdminChange("msrp", e.target.value)}
                      />
                    </label>
                  </div>

                  <div className="admin-row two">
                    <label>
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
                    <label>
                      Special Volumes
                      <input
                        type="number"
                        min="0"
                        value={adminForm.data.specialVolumes}
                        onChange={(e) => handleAdminChange("specialVolumes", e.target.value)}
                      />
                    </label>
                  </div>

                  <div className="admin-row two">
                    <label>
                      Special Type
                      <input
                        type="text"
                        value={adminForm.data.specialType}
                        onChange={(e) => handleAdminChange("specialType", e.target.value)}
                      />
                    </label>
                    <label>
                      Amazon URL
                      <input
                        type="text"
                        value={adminForm.data.amazonURL}
                        onChange={(e) => handleAdminChange("amazonURL", e.target.value)}
                      />
                    </label>
                  </div>

                  <div className="admin-row two">
                    <label>
                      Demographic
                      <input
                        type="text"
                        value={adminForm.data.demographic}
                        onChange={(e) => handleAdminChange("demographic", e.target.value)}
                      />
                    </label>
                    <label>
                      Genre
                      <input
                        type="text"
                        value={adminForm.data.genre}
                        onChange={(e) => handleAdminChange("genre", e.target.value)}
                      />
                    </label>
                  </div>

                  <div className="admin-row two">
                    <label>
                      Sub Genre
                      <input
                        type="text"
                        value={adminForm.data.subGenre}
                        onChange={(e) => handleAdminChange("subGenre", e.target.value)}
                      />
                    </label>
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
                        checked={adminForm.multiAdd}
                        onChange={(e) =>
                          setAdminForm((prev) => ({ ...prev, multiAdd: e.target.checked }))
                        }
                      />
                      <span>Multi-create volumes</span>
                    </label>
                  </div>

                  {adminForm.multiAdd && (
                    <div className="admin-row two">
                      <label>
                        Start Volume
                        <input
                          type="number"
                          min="1"
                          value={adminForm.startVol}
                          onChange={(e) =>
                            setAdminForm((prev) => ({ ...prev, startVol: e.target.value }))
                          }
                        />
                      </label>
                      <label>
                        End Volume
                        <input
                          type="number"
                          min="1"
                          value={adminForm.endVol}
                          onChange={(e) =>
                            setAdminForm((prev) => ({ ...prev, endVol: e.target.value }))
                          }
                        />
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
                >
                  Close
                </button>
              </div>

              {bulkEdit.items.length > 0 && (
                <>
                  <div className="manga-modal-subtitle">
                    Editing: {bulkEdit.items[bulkEdit.index].data.title || "Untitled"}
                  </div>
                  <div className="admin-form-grid">
                    <label>
                      Title
                      <input
                        type="text"
                        value={bulkEdit.items[bulkEdit.index].data.title}
                        onChange={(e) => handleBulkChange("title", e.target.value)}
                      />
                    </label>
                    <label>
                      Authors
                      <input
                        type="text"
                        value={bulkEdit.items[bulkEdit.index].data.authors}
                        onChange={(e) => handleBulkChange("authors", e.target.value)}
                      />
                    </label>
                    <label>
                      Publisher
                      <input
                        type="text"
                        value={bulkEdit.items[bulkEdit.index].data.publisher}
                        onChange={(e) => handleBulkChange("publisher", e.target.value)}
                      />
                    </label>
                    <label>
                      Demographic
                      <input
                        type="text"
                        value={bulkEdit.items[bulkEdit.index].data.demographic}
                        onChange={(e) => handleBulkChange("demographic", e.target.value)}
                      />
                    </label>
                    <label>
                      Genre
                      <input
                        type="text"
                        value={bulkEdit.items[bulkEdit.index].data.genre}
                        onChange={(e) => handleBulkChange("genre", e.target.value)}
                      />
                    </label>
                    <label>
                      Sub Genre
                      <input
                        type="text"
                        value={bulkEdit.items[bulkEdit.index].data.subGenre}
                        onChange={(e) => handleBulkChange("subGenre", e.target.value)}
                      />
                    </label>
                    <label>
                      Release Date
                      <input
                        type="date"
                        value={bulkEdit.items[bulkEdit.index].data.date}
                        onChange={(e) => handleBulkChange("date", e.target.value)}
                      />
                    </label>
                    <label>
                      ISBN
                      <input
                        type="text"
                        value={bulkEdit.items[bulkEdit.index].data.isbn}
                        onChange={(e) => handleBulkChange("isbn", e.target.value)}
                      />
                    </label>
                    <label>
                      Cover URL
                      <input
                        type="text"
                        value={bulkEdit.items[bulkEdit.index].data.cover}
                        onChange={(e) => handleBulkChange("cover", e.target.value)}
                      />
                    </label>
                    <label>
                      Page Count
                      <input
                        type="number"
                        value={bulkEdit.items[bulkEdit.index].data.pageCount}
                        onChange={(e) => handleBulkChange("pageCount", e.target.value)}
                      />
                    </label>
                    <label>
                      Rating (1-5 stars)
                      <StarPicker
                        value={bulkEdit.items[bulkEdit.index].data.rating}
                        onChange={(v) => handleBulkChange("rating", v)}
                      />
                    </label>
                    <label>
                      Amount Paid
                      <input
                        type="number"
                        step="0.01"
                        value={bulkEdit.items[bulkEdit.index].data.amountPaid}
                        onChange={(e) => handleBulkChange("amountPaid", e.target.value)}
                      />
                    </label>
                    <label>
                      MSRP
                      <input
                        type="number"
                        step="0.01"
                        value={bulkEdit.items[bulkEdit.index].data.msrp}
                        onChange={(e) => handleBulkChange("msrp", e.target.value)}
                      />
                    </label>
                    <label>
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
                    <label>
                      Date Purchased
                      <input
                        type="date"
                        value={bulkEdit.items[bulkEdit.index].data.datePurchased}
                        onChange={(e) =>
                          handleBulkChange("datePurchased", e.target.value)
                        }
                      />
                    </label>
                    <label>
                      Date Read
                      <input
                        type="date"
                        value={bulkEdit.items[bulkEdit.index].data.dateRead}
                        onChange={(e) => handleBulkChange("dateRead", e.target.value)}
                      />
                    </label>
                    <label>
                      Special Type
                      <input
                        type="text"
                        value={bulkEdit.items[bulkEdit.index].data.specialType}
                        onChange={(e) => handleBulkChange("specialType", e.target.value)}
                      />
                    </label>
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
                        checked={bulkEdit.items[bulkEdit.index].data.read}
                        onChange={(e) =>
                          handleBulkChange("read", e.target.checked, "checkbox")
                        }
                      />
                      <span>Marked as read</span>
                    </label>
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
      <datalist id="adminTitleSuggestions">
        {titleSuggestions.map((t) => (
          <option value={t} key={t} />
        ))}
      </datalist>
    </div>
  );
}
