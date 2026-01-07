// src/pages/Dashboard.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import "../styles/dashboard.css";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import { useAuth } from "../contexts/AuthContext";
import {
  ACTIVITY_STORAGE_KEY,
  DEFAULT_ACTIVITY_WEBHOOK,
  persistActivityEntries,
  recordActivity,
} from "../utils/activity";

const DEFAULT_YEARLY_WEBHOOK =
  "https://discord.com/api/webhooks/1448287168845054004/cGWGPoH5LaTFlBZ1vxtgMjOfV9au6qyQ_9ZRnOWN9-AX0MNfwxKNWVcZYQHz0ESA7_4k";
const DEFAULT_RELEASE_WEBHOOK =
  "https://discord.com/api/webhooks/1448288240871276616/101WI-B2p8tDR34Hl9fZxxb0QG01f1Eo5w1IvbttlQmP2wWFNJ0OI7UnJfJujKRNWW2Q";
const READ_NEXT_STATE_COLLECTION = "readNextState";

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
  const withoutParens = text.replace(/\s*\([^)]*\)\s*$/, "");
  const volMatch = withoutParens.match(/\b(?:vol\.?|volume)\s*#?\s*(\d+)\b/i);
  const volNum = volMatch && volMatch[1] ? parseInt(volMatch[1], 10) : 0;
  const base = withoutParens
    .replace(/\b(?:vol\.?|volume)\s*#?\s*\d+\b/i, "")
    .replace(/\s*[,.-]\s*$/, "")
    .trim()
    .toLowerCase();
  return {
    name: base,
    vol: Number.isFinite(volNum) ? volNum : 0,
  };
}

function sortEntriesByTitle(a, b) {
  const aTitle = a?.title || "";
  const bTitle = b?.title || "";
  const aParsed = parseTitleForSort(aTitle);
  const bParsed = parseTitleForSort(bTitle);
  const nameCmp = aParsed.name.localeCompare(bParsed.name);
  if (nameCmp !== 0) return nameCmp;
  if (aParsed.vol !== bParsed.vol) return aParsed.vol - bParsed.vol;
  return aTitle.localeCompare(bTitle);
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

// Releases across wishlist + library: array of { date, title, purchased, source }
function buildReleaseEntries(library, wishlist) {
  const collect = (item, source) => {
    const date = parseDate(item.releaseDate || item.ReleaseDate || item.date || item.Date);
    if (!date) return null;
    const rawTitle = (item.title || item.series || item.Title || "Unknown Title").trim();
    const parsed = parseTitleForSort(rawTitle);
    const releaseVolume = parsed?.vol ? parsed.vol : null;
    const title = rawTitle;
    const purchased = !!(item.datePurchased || item.DatePurchased || "").trim();
    const seriesKey = stripVolumeInfo(title || "").toLowerCase();
    return { date, title, purchased, source, seriesKey, volume: releaseVolume };
  };

  const merged = [];
  (wishlist || []).forEach((item) => {
    const entry = collect(item, "wishlist");
    if (entry) merged.push(entry);
  });
  (library || []).forEach((item) => {
    const entry = collect(item, "library");
    if (entry) merged.push(entry);
  });

  merged.sort((a, b) => a.date - b.date);
  return merged;
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

function computeAverageDailyReads(library) {
  const msPerDay = 1000 * 60 * 60 * 24;
  const reads = library
    .map((item) => parseDate(item.dateRead || item.DateRead))
    .filter(Boolean)
    .sort((a, b) => a - b);
  if (!reads.length) return { lifetime: null, ytd: null };
  const now = Date.now();
  const firstTs = reads[0].getTime();
  const lifetimeDays = Math.max(1, Math.round((now - firstTs) / msPerDay) + 1);
  const today = new Date();
  const startOfYear = new Date(today.getFullYear(), 0, 1);
  const daysElapsedYear = Math.max(
    1,
    Math.floor((today.getTime() - startOfYear.getTime()) / msPerDay) + 1
  );
  const currentYearReads = reads.filter((d) => d.getFullYear() === today.getFullYear()).length;
  return {
    lifetime: reads.length / lifetimeDays,
    ytd: currentYearReads / daysElapsedYear,
  };
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

function buildSeriesProgress(library, wishlist = []) {
  const map = new Map();
  let globalMsrpSum = 0;
  let globalMsrpCount = 0;
  library.forEach((book) => {
    const key = getSeriesKey(book) || book.id;
    if (!key) return;
    const parsed = parseTitleForSort(book.title || book.Title || book.series || "");
    const vol = parsed.vol || 0;
    if (!map.has(key)) {
      map.set(key, {
        key,
        title: getSeriesDisplayName(book),
        highestOwnedVolume: 0,
        lastReadVolume: 0,
        unreadCount: 0,
        readVolumes: 0,
        libraryCount: 0,
        wishlistCount: 0,
        total: 0,
        msrpSum: 0,
        msrpCount: 0,
        latestPurchaseTs: 0,
        latestPurchaseDate: null,
      });
    }
    const entry = map.get(key);
    entry.libraryCount += 1;
    entry.total += 1;
    entry.highestOwnedVolume = Math.max(entry.highestOwnedVolume, vol);
    const readFlag = !!book.read || book.status === "Read" || book.Read === true;
    if (readFlag) {
      entry.lastReadVolume = Math.max(entry.lastReadVolume, vol);
      entry.readVolumes += 1;
    } else {
      entry.unreadCount += 1;
    }
    const msrpVal = Number(book.msrp || book.MSRP);
    if (!Number.isNaN(msrpVal) && msrpVal > 0) {
      entry.msrpSum += msrpVal;
      entry.msrpCount += 1;
      globalMsrpSum += msrpVal;
      globalMsrpCount += 1;
    }
    const latestPurchase = parseDate(book.datePurchased || book.DatePurchased);
    if (latestPurchase) {
      const ts = latestPurchase.getTime();
      if (ts > entry.latestPurchaseTs) {
        entry.latestPurchaseTs = ts;
        entry.latestPurchaseDate = latestPurchase;
      }
    }
  });
  wishlist.forEach((book) => {
    const key = getSeriesKey(book) || book.id;
    if (!key) return;
    const entry = map.get(key);
    if (!entry) return;
    entry.wishlistCount += 1;
  });
  map.forEach((entry) => {
    entry.avgMsrp = entry.msrpCount ? entry.msrpSum / entry.msrpCount : null;
    const ownedTotal = entry.libraryCount + entry.wishlistCount;
    entry.ownershipRatio = ownedTotal ? entry.libraryCount / ownedTotal : 0;
    entry.fullyOwned = entry.wishlistCount === 0;
    entry.recentPurchaseScore = entry.latestPurchaseTs
      ? Math.max(0, 1 - (Date.now() - entry.latestPurchaseTs) / (1000 * 60 * 60 * 24 * 120))
      : 0;
    entry.latestPurchaseDays = entry.latestPurchaseTs
      ? Math.round((Date.now() - entry.latestPurchaseTs) / (1000 * 60 * 60 * 24))
      : null;
  });
  const globalAvgMsrp = globalMsrpCount ? globalMsrpSum / globalMsrpCount : null;
  return { map, globalAvgMsrp };
}

// Lightweight "AI-ish" read-next pick that blends backlog, upcoming releases, and some randomness
function buildReadNextSuggestion(seriesProgress, releases, snoozed = {}, seed = 0) {
  if (!seriesProgress || !seriesProgress.size) return null;
  const now = new Date();

  const releaseBySeries = new Map();
  (releases || []).forEach((rel) => {
    if (!rel || !rel.date) return;
    if (rel.date < now) return;
    const key = rel.seriesKey || stripVolumeInfo(rel.title || "").toLowerCase();
    if (!key) return;
    const existing = releaseBySeries.get(key);
    if (!existing || rel.date < existing.date) {
      releaseBySeries.set(key, rel);
    }
  });

  const candidates = [...seriesProgress.values()].filter((s) => s.unreadCount > 0);
  if (!candidates.length) return null;

  let idx = 0;
  for (const c of candidates) {
    const ownershipRatio = Number.isFinite(c.ownershipRatio) ? c.ownershipRatio : 0;
    const recentPurchaseBoost = Number.isFinite(c.recentPurchaseScore) ? c.recentPurchaseScore : 0;
    const wishlistPressure = Math.min(c.wishlistCount || 0, 6) / 6;
    const snoozeUntil = snoozed?.[c.key] ? new Date(snoozed[c.key]) : null;
    if (snoozeUntil && snoozeUntil > now) {
      c.snoozedUntil = snoozeUntil;
      c.score = -Infinity;
      continue;
    }
    const nextRelease = releaseBySeries.get(c.key) || null;
    const daysToRelease = nextRelease
      ? Math.round((nextRelease.date - now) / (1000 * 60 * 60 * 24))
      : null;
    const releaseVolume = nextRelease && Number.isFinite(nextRelease.volume) ? nextRelease.volume : null;
    const releaseGapOwned = releaseVolume ? Math.max(0, releaseVolume - c.highestOwnedVolume - 1) : 0;
    const catchUpTarget = releaseVolume
      ? Math.max(c.highestOwnedVolume || 0, releaseVolume - 1)
      : c.highestOwnedVolume || c.total;
    const behindToCatchUp = Math.max(0, catchUpTarget - c.lastReadVolume);
    const behindToUpcoming = releaseVolume ? Math.max(0, releaseVolume - 1 - c.lastReadVolume) : 0;
    const behindCount = Math.max(c.unreadCount, behindToCatchUp, behindToUpcoming);
    const backlogWeight = Math.min(behindCount, 8) / 8;
    const urgency = daysToRelease != null && daysToRelease >= 0 ? Math.max(0, 120 - daysToRelease) / 120 : 0;
    const upcomingSoon = daysToRelease != null && daysToRelease <= 45 ? 0.6 : 0;
    const ownedGapPenalty = releaseVolume ? Math.min(releaseGapOwned, 12) / 12 : 0;
    const bigGapPenalty = releaseGapOwned >= 6 ? 0.6 : 0;
    const ownershipBonus = ownershipRatio * 1.05 - wishlistPressure * 0.35;
    const fullyOwnedBoost = c.fullyOwned ? 0.35 : 0;
    const recencyBoost = recentPurchaseBoost * 0.8;
    const jitter = 0.85 + (Math.abs(Math.sin(seed + idx + 1)) % 0.35);
    const baseScore =
      1 +
      backlogWeight * 1.15 +
      urgency * 1.1 +
      upcomingSoon +
      ownershipBonus +
      fullyOwnedBoost +
      recencyBoost -
      ownedGapPenalty * 1.25 -
      bigGapPenalty;
    const weightBreakdown = {
      backlogWeight,
      urgency,
      upcomingSoon,
      ownershipBonus,
      fullyOwnedBoost,
      recencyBoost,
      gapPenalty: ownedGapPenalty + bigGapPenalty,
    };
    c.score = Math.max(baseScore, 0.05) * jitter;
    c.nextRelease = nextRelease;
    c.daysToRelease = daysToRelease;
    c.catchUpTarget = catchUpTarget;
    c.behindCount = behindCount;
    c.upcomingVolume = releaseVolume;
    c.ownedVolume = c.highestOwnedVolume;
    c.ownedVsUpcomingGap = releaseGapOwned;
    c.ownershipRatio = ownershipRatio;
    c.latestPurchaseDays = c.latestPurchaseDays ?? null;
    c.weightBreakdown = weightBreakdown;
    idx += 1;
  }

  candidates.sort((a, b) => b.score - a.score);
  const available = candidates.filter((c) => c.score > -Infinity);
  const pick = available[0] || null;
  const backup = available.find((c, i) => i > 0 && c.unreadCount > 0) || null;
  const weights = {
    pick: pick?.weightBreakdown || null,
    seed,
  };
  return { pick, backup, weights };
}

function sanitizeReadNextSnoozed(raw) {
  const cleaned = {};
  const now = Date.now();
  if (!raw || typeof raw !== "object") return cleaned;
  Object.entries(raw).forEach(([k, v]) => {
    const ts = Number(v);
    if (Number.isFinite(ts) && ts > now) cleaned[k] = ts;
  });
  return cleaned;
}

function buildPurchaseNextSuggestion(seriesProgress, releases, globalAvgMsrp) {
  if (!seriesProgress || !seriesProgress.size) return null;
  const now = new Date();
  const releaseBySeries = new Map();
  (releases || []).forEach((rel) => {
    if (!rel || !rel.date) return;
    if (rel.date < now) return;
    const key = rel.seriesKey;
    if (!key) return;
    const existing = releaseBySeries.get(key);
    if (!existing || rel.date < existing.date) {
      releaseBySeries.set(key, rel);
    }
  });

  const candidates = [];
  seriesProgress.forEach((entry) => {
    const nextRelease = releaseBySeries.get(entry.key);
    if (!nextRelease || nextRelease.purchased) return;
    const releaseVolume = nextRelease && Number.isFinite(nextRelease.volume) ? nextRelease.volume : null;
    if (!releaseVolume) return;
    const missingCount = Math.max(0, releaseVolume - 1 - entry.highestOwnedVolume);
    if (missingCount <= 0) return;
    const daysToRelease =
      nextRelease.date instanceof Date ? Math.round((nextRelease.date - now) / (1000 * 60 * 60 * 24)) : null;
    const avgMsrp = entry.avgMsrp || globalAvgMsrp || 0;
    const costEstimate = avgMsrp > 0 ? avgMsrp * missingCount : 0;
    const affordability = avgMsrp > 0 ? 1 / (1 + costEstimate / 60) : 0.7;
    const urgency = daysToRelease != null && daysToRelease >= 0 ? Math.max(0, 120 - daysToRelease) / 120 : 0;
    const gapPenalty = Math.min(missingCount, 12) / 12;
    const ownershipBonus = Number.isFinite(entry.ownershipRatio) ? entry.ownershipRatio * 0.9 : 0;
    const catchUpSpeed = 1 / Math.max(1, missingCount);
    const readPct = entry.total ? (entry.readVolumes || 0) / entry.total : 0;
    const engagement = readPct * 0.8;
    const soonBoost = daysToRelease != null && daysToRelease <= 45 ? 0.5 : 0;
    const score =
      urgency * 1.2 +
      affordability * 1 +
      catchUpSpeed * 0.8 +
      ownershipBonus +
      engagement +
      soonBoost -
      gapPenalty * 0.9;
    candidates.push({
      ...entry,
      nextRelease,
      releaseVolume,
      daysToRelease,
      missingCount,
      costEstimate,
      avgMsrp,
      ownershipRatio: entry.ownershipRatio ?? 0,
      readPct,
      score,
    });
  });

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  return { pick: candidates[0], list: candidates };
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
  byDay.forEach((list) => list.sort(sortEntriesByTitle));

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
  const [usersList, setUsersList] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsErr, setSuggestionsErr] = useState("");
  const [readNextSnoozed, setReadNextSnoozed] = useState({});
  const [readNextSeed, setReadNextSeed] = useState(() => Math.random());
  const [readNextStateLoaded, setReadNextStateLoaded] = useState(false);
  const readNextPersistRef = useRef(null);
  const [calendarExpandedDay, setCalendarExpandedDay] = useState(null);
  const [calendarModalDay, setCalendarModalDay] = useState(null);
  const refreshUsers = async () => {
    if (!admin) return;
    try {
      setUsersLoading(true);
      const snap = await getDocs(collection(db, "users"));
      const rows = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
      setUsersList(rows);
    } catch (e) {
      console.error("Failed to load users", e);
    } finally {
      setUsersLoading(false);
    }
  };

  const updateUserRole = async (uid, newRole) => {
    const target = (uid || "").trim();
    if (!target) {
      alert("UID is required.");
      return;
    }
    try {
      await setDoc(
        doc(db, "users", target),
        {
          role: newRole,
          updatedBy: user?.uid || "manual",
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      await refreshUsers();
    } catch (e) {
      console.error("Failed to update role", e);
      alert("Failed to update role.");
    }
  };

  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [readCalendarOpen, setReadCalendarOpen] = useState(false);
  const [readCalendarMonth, setReadCalendarMonth] = useState(() => new Date());
  const [readCalendarModalDay, setReadCalendarModalDay] = useState(null);
  const [purchaseCalendarOpen, setPurchaseCalendarOpen] = useState(false);
  const [purchaseMonth, setPurchaseMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [purchaseDayModal, setPurchaseDayModal] = useState(null); // { date, items[] }

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
    readNextPersistRef.current = null;
  }, [user?.uid]);

  useEffect(() => {
    const hasOpenModal =
      calendarOpen ||
      detailModal.open ||
      settingsOpen ||
      !!calendarModalDay ||
      readCalendarOpen ||
      !!readCalendarModalDay ||
      purchaseCalendarOpen ||
      !!purchaseDayModal;
    if (hasOpenModal) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [
    calendarOpen,
    detailModal.open,
    settingsOpen,
    calendarModalDay,
    readCalendarOpen,
    readCalendarModalDay,
    purchaseCalendarOpen,
    purchaseDayModal,
  ]);

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
          setWebhooks({
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

  // Load users/roles for the admin settings modal
  useEffect(() => {
    if (!admin) return;
    let cancelled = false;
    (async () => {
      await refreshUsers();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [admin]);

  useEffect(() => {
    let cancelled = false;
    if (!user || !admin) {
      setSuggestions([]);
      setSuggestionsErr("");
      return;
    }
    (async () => {
      try {
        setSuggestionsLoading(true);
        const snap = await getDocs(collection(db, "suggestions"));
        const items = snap.docs.map((d) => {
          const data = d.data();
          let created = null;
          if (data?.createdAt?.toDate) {
            created = data.createdAt.toDate();
          } else if (data?.createdAt) {
            const dt = new Date(data.createdAt);
            created = isNaN(dt.getTime()) ? null : dt;
          }
          return { id: d.id, ...data, createdAt: created };
        });
        items.sort(
          (a, b) =>
            (b.createdAt?.getTime?.() || 0) - (a.createdAt?.getTime?.() || 0)
        );
        if (!cancelled) {
          setSuggestions(items);
          setSuggestionsErr("");
        }
      } catch (e) {
        console.error("Failed to load suggestions", e);
        if (!cancelled) {
          setSuggestionsErr("Failed to load suggestions.");
          setSuggestions([]);
        }
      } finally {
        if (!cancelled) setSuggestionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, admin]);

  const deleteSuggestion = async (id) => {
    if (!admin || !id) return;
    try {
      await deleteDoc(doc(db, "suggestions", id));
      setSuggestions((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      console.error("Failed to delete suggestion", e);
      setSuggestionsErr("Failed to delete suggestion.");
    }
  };

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

  const { map: seriesProgress, globalAvgMsrp } = useMemo(
    () => buildSeriesProgress(library, wishlist),
    [library, wishlist]
  );

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
    const releases = buildReleaseEntries(library, wishlist);
    const nextRelease = getNextRelease(releases);

    const avgDays = computeAvgPurchaseToRead(library);
    const collectionValue = computeCollectionValue(library);
    const pages = computePages(library);
    const avgRating = computeAverageRating(seriesMap);
    const purchaseToReadSeries = computePurchaseToReadSeries(library);
    const avgBooksPerDay = computeAverageDailyReads(library);

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
      avgBooksPerDay,
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
    avgBooksPerDay,
    topPublishers,
    topGenres,
    topDemographics,
    seriesAggregates,
  } = stats;

  const nextDate = nextRelease ? nextRelease.date : null;
  const hasError = Boolean(err);
  const todayKey = formatDateKey(new Date());
  const readEntries = useMemo(() => {
    return library
      .map((item) => {
        const dt = parseDate(item.dateRead || item.DateRead);
        if (!dt || !(item.read || item.status === "Read" || item.Read === true)) return null;
        return { date: dt, title: item.title || item.Title || "Untitled" };
      })
      .filter(Boolean)
      .sort((a, b) => a.date - b.date);
  }, [library]);
  const readCalendarCells = useMemo(
    () => buildCalendarGrid(readCalendarMonth, readEntries, todayKey),
    [readCalendarMonth, readEntries, todayKey]
  );

  const purchasesByDate = useMemo(() => {
    const map = new Map();
    const items = [...library, ...wishlist];
    items.forEach((item) => {
      const dp = parseDate(item.datePurchased || item.DatePurchased);
      if (!dp) return;
      const key = formatDateKey(dp);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({
        id: item.id || item.Title || item.title || key,
        title: item.title || item.Title || "Untitled",
      });
    });
    map.forEach((list) => list.sort(sortEntriesByTitle));
    return map;
  }, [library, wishlist]);

  const purchaseCalendarCells = useMemo(() => {
    const { year, month } = purchaseMonth;
    const firstDay = new Date(year, month, 1);
    const startPad = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let hasItems = false;
    const cells = [];
    for (let i = 0; i < startPad; i += 1) cells.push({ type: "pad" });
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(year, month, day);
      const dateKey = formatDateKey(date);
      const items = purchasesByDate.get(dateKey) || [];
      if (items.length) hasItems = true;
      cells.push({ type: "day", day, dateKey, items, releases: items, isToday: dateKey === todayKey });
    }
    const totalCells = Math.ceil(cells.length / 7) * 7;
    while (cells.length < totalCells) cells.push({ type: "pad" });
    return { cells, hasItems };
  }, [purchaseMonth, purchasesByDate, todayKey]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("dashboard.readNextSnoozed");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        setReadNextSnoozed(sanitizeReadNextSnoozed(parsed));
      }
    } catch (e) {
      console.error("Failed to load read-next snoozed state", e);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setReadNextStateLoaded(false);
      setReadNextSnoozed({});
      setReadNextSeed(Math.random());
      return;
    }
    const ref = doc(db, READ_NEXT_STATE_COLLECTION, user.uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.exists() ? snap.data() || {} : {};
        if (data.snoozed) {
          setReadNextSnoozed(sanitizeReadNextSnoozed(data.snoozed));
        } else {
          setReadNextSnoozed({});
        }
        if (Number.isFinite(data.seed)) {
          setReadNextSeed(data.seed);
        }
        setReadNextStateLoaded(true);
      },
      (err) => {
        console.error("Failed to load read-next state", err);
        setReadNextStateLoaded(true);
      }
    );
    return () => {
      unsub?.();
    };
  }, [user]);

  useEffect(() => {
    const cleaned = sanitizeReadNextSnoozed(readNextSnoozed);
    if (JSON.stringify(cleaned) !== JSON.stringify(readNextSnoozed)) {
      setReadNextSnoozed(cleaned);
      return;
    }
    try {
      localStorage.setItem("dashboard.readNextSnoozed", JSON.stringify(cleaned));
    } catch (e) {
      console.error("Failed to persist read-next snoozed state", e);
    }
    if (!user || !readNextStateLoaded) return;
    const ref = doc(db, READ_NEXT_STATE_COLLECTION, user.uid);
    (async () => {
      try {
        await setDoc(
          ref,
          {
            snoozed: cleaned,
            seed: readNextSeed,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } catch (e) {
        console.error("Failed to persist read-next state", e);
      }
    })();
  }, [readNextSnoozed, readNextSeed, user, readNextStateLoaded]);

  const readNextSuggestion = useMemo(
    () => buildReadNextSuggestion(seriesProgress, releases, readNextSnoozed, readNextSeed),
    [seriesProgress, releases, readNextSnoozed, readNextSeed]
  );

  const readNextPick = readNextSuggestion?.pick || null;
  const readNextBackup = readNextSuggestion?.backup || null;
  const readNextSnoozedUntil = readNextPick?.snoozedUntil || null;
  useEffect(() => {
    if (!user || !readNextStateLoaded) return;
    if (!readNextSuggestion) return;
    if (!readNextPick && !readNextBackup) return;
    const ref = doc(db, READ_NEXT_STATE_COLLECTION, user.uid);
    const summary = {
      pick: readNextPick
        ? {
            key: readNextPick.key,
            title: readNextPick.title,
            score: Number.isFinite(readNextPick.score) ? Number(readNextPick.score.toFixed(3)) : null,
            ownershipRatio: readNextPick.ownershipRatio ?? null,
            behindCount: readNextPick.behindCount ?? null,
          }
        : null,
      backup: readNextBackup
        ? {
            key: readNextBackup.key,
            title: readNextBackup.title,
            behindCount: readNextBackup.behindCount ?? null,
          }
        : null,
      weights: readNextSuggestion.weights || null,
      updatedAt: new Date().toISOString(),
    };
    const summaryKey = JSON.stringify(summary);
    if (readNextPersistRef.current === summaryKey) return;
    readNextPersistRef.current = summaryKey;
    (async () => {
      try {
        await setDoc(ref, { lastSuggestion: summary }, { merge: true });
      } catch (e) {
        console.error("Failed to persist read-next suggestion", e);
      }
    })();
  }, [readNextSuggestion, readNextPick, readNextBackup, user, readNextStateLoaded]);
  const handleSnoozeReadNext = (days = 7) => {
    if (!readNextPick?.key) return;
    const until = Date.now() + days * 24 * 60 * 60 * 1000;
    setReadNextSnoozed((prev) => ({ ...prev, [readNextPick.key]: until }));
    setReadNextSeed((s) => s + 1);
  };

  const purchaseNextSuggestion = useMemo(
    () => buildPurchaseNextSuggestion(seriesProgress, releases, globalAvgMsrp),
    [seriesProgress, releases, globalAvgMsrp]
  );
  const purchaseNextPick = purchaseNextSuggestion?.pick || null;

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

    const content = `Wishlist releases for ${releaseKey}:
${todays.map((r) => `- ${r.title}`).join("\n")}`;

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

  const addActivity = (message) => {
    if (!message) return;
    const entry = { message, ts: new Date() };
    setActivityLog((prev) => {
      const next = [entry, ...prev].slice(0, 100);
      persistActivityEntries(next);
      return next;
    });
    recordActivity(message, {
      email: user?.email || "anonymous",
      name: user?.displayName || "",
      webhookOverride: webhooks.activity,
      persistLocal: false,
    });
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

  const calendarCells = buildCalendarGrid(calendarMonth, releases, todayKey);

  const changePurchaseMonth = (delta) => {
    setPurchaseMonth((prev) => {
      const d = new Date(prev.year, prev.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  const changeReadCalendarMonth = (delta) => {
    setReadCalendarMonth((prev) => {
      const d = new Date(prev.getFullYear(), prev.getMonth() + delta, 1);
      return d;
    });
  };

  const closePurchaseCalendar = () => {
    setPurchaseCalendarOpen(false);
    setPurchaseDayModal(null);
  };

  const openPurchaseCalendar = () => {
    // Jump to most recent purchase month if available
    const keys = Array.from(purchasesByDate.keys()).sort();
    if (keys.length) {
      const latest = keys[keys.length - 1];
      const [y, m] = latest.split("-");
      const year = Number(y);
      const month = Number(m) - 1;
      if (!Number.isNaN(year) && !Number.isNaN(month)) {
        setPurchaseMonth({ year, month });
      }
    }
    setPurchaseCalendarOpen(true);
  };

  const openReadCalendar = () => {
    if (readEntries.length) {
      const latest = readEntries[readEntries.length - 1].date;
      setReadCalendarMonth(new Date(latest.getFullYear(), latest.getMonth(), 1));
    } else {
      setReadCalendarMonth(new Date());
    }
    setReadCalendarOpen(true);
  };

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
          <h3>Library & Wishlist Releases</h3>
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
            <div className="stat-card mini clickable" onClick={openPurchaseCalendar}>
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

          <div
            className="stat-card clickable"
            onClick={openReadCalendar}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openReadCalendar();
              }
            }}
          >
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
              MSRP | Paid | Collectible overrides
            </div>
          </div>

          <div className="stat-card">
            <h3>Current Year Reads</h3>
            <div className="stat-value">{currentYearReadsTotal}</div>
            <div className="stat-sub">Reads in {currentYear}</div>
          </div>

          <div className="stat-stack">
            <div className="stat-card mini">
              <h3>Avg Books / Day</h3>
              <div className="stat-value">
                {avgBooksPerDay?.ytd != null ? avgBooksPerDay.ytd.toFixed(2) : "-"}
              </div>
              <div className="stat-sub">
                {avgBooksPerDay?.lifetime != null
                  ? `YTD from Jan 1 · Lifetime ${avgBooksPerDay.lifetime.toFixed(2)}`
                  : "No reads logged yet"}
              </div>
            </div>
            <div className="stat-card mini clickable" onClick={() => openDetail("timeToRead")}>
              <h3>Avg Days From Purchase to Read</h3>
              <div className="stat-value">
                {avgDays == null ? "-" : `${avgDays.toFixed(1)} days`}
              </div>
              <div className="stat-sub">When both dates exist</div>
            </div>
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

          <div
            className="stat-card wide"
            style={{
              position: "relative",
              overflow: "hidden",
              background:
                "linear-gradient(135deg, rgba(255,182,193,0.08), rgba(255,105,180,0.08)) , radial-gradient(120% 120% at 0% 0%, rgba(255,182,193,0.14), rgba(36,12,24,0.8))",
              border: "1px solid rgba(255,182,193,0.24)",
              boxShadow: "0 16px 50px rgba(0,0,0,0.52)",
              paddingTop: 18,
              marginTop: 12,
            }}
          >
            <div
              style={{
                position: "absolute",
                right: -32,
                top: -32,
                width: 180,
                height: 180,
                background: "radial-gradient(circle, rgba(255,105,180,0.16), rgba(255,105,180,0))",
                pointerEvents: "none",
              }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <div
                style={{
                  width: 6,
                  height: 40,
                  borderRadius: 999,
                  background: "linear-gradient(180deg, #ff7fb0, #ffb6c1)",
                }}
              />
              <div style={{ flex: 1 }}>
                <h3 style={{ marginBottom: 4 }}>Read Next</h3>
                <div className="stat-sub" style={{ color: "#f7d0dc", fontSize: "0.9rem" }}>
                  Weighted pick that balances backlog and upcoming releases.
                </div>
              </div>
              <span
                style={{
                  background: "rgba(255,182,193,0.18)",
                  border: "1px solid rgba(255,182,193,0.32)",
                  color: "#ffb6c1",
                  fontSize: "0.78rem",
                  padding: "6px 11px",
                  borderRadius: "999px",
                  letterSpacing: "0.02em",
                }}
              >
                Smart
              </span>
            </div>
            {readNextPick ? (
              <>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 14,
                    alignItems: "stretch",
                    textAlign: "center",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div
                      style={{
                        padding: "12px 14px",
                        borderRadius: "14px",
                        border: "1px solid rgba(255,255,255,0.08)",
                        background: "rgba(255,255,255,0.04)",
                        display: "grid",
                        gridTemplateColumns: "1fr",
                        gap: 8,
                        textAlign: "center",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <div className="stat-value" style={{ lineHeight: 1.2 }}>{readNextPick.title}</div>
                        {readNextSnoozedUntil && readNextSnoozedUntil > new Date() && (
                          <span
                            className="stat-sub"
                            style={{
                              padding: "4px 8px",
                              borderRadius: "999px",
                              border: "1px solid rgba(255,218,123,0.5)",
                              background: "rgba(255,218,123,0.12)",
                              color: "#ffda7b",
                              fontSize: "0.75rem",
                            }}
                          >
                            Snoozed to {readNextSnoozedUntil.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                          </span>
                        )}
                      </div>
                      <div className="stat-sub" style={{ color: "#f7d0dc" }}>
                        Catch up {readNextPick.behindCount} volume{readNextPick.behindCount === 1 ? "" : "s"} to reach vol {readNextPick.catchUpTarget}.
                      </div>
                      {readNextPick.upcomingVolume ? (
                        <div className="stat-sub" style={{ color: "#c5b3bc" }}>
                          Own to vol {readNextPick.ownedVolume || 0}; next release is vol {readNextPick.upcomingVolume}
                          {readNextPick.ownedVsUpcomingGap > 0 ? ` (gap ${readNextPick.ownedVsUpcomingGap})` : ""}.
                        </div>
                      ) : null}
                      <div className="stat-sub" style={{ color: "#b6a6af" }}>
                        Ownership {Math.round((readNextPick.ownershipRatio || 0) * 100)}%
                        {readNextPick.latestPurchaseDays != null
                          ? ` · Latest buy ${readNextPick.latestPurchaseDays}d ago`
                          : ""}
                      </div>
                      <div className="stat-sub" style={{ color: "#b6a6af" }}>
                        Queued after:{" "}
                        {readNextBackup ? `${readNextBackup.title} (${readNextBackup.unreadCount} unread)` : "Shuffle for another option"}
                        .
                      </div>
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 12,
                        textAlign: "center",
                      }}
                    >
                      <div
                        style={{
                          padding: "10px",
                          borderRadius: "12px",
                          border: "1px solid rgba(255,182,193,0.22)",
                          background: "rgba(255,182,193,0.08)",
                        }}
                      >
                        <div className="stat-sub" style={{ marginBottom: 4 }}>Next release</div>
                        <div style={{ fontWeight: 700, marginBottom: 2 }}>
                          {readNextPick.nextRelease
                            ? readNextPick.nextRelease.date.toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })
                            : "None scheduled"}
                        </div>
                        <div className="stat-sub">
                          {readNextPick.nextRelease ? `${readNextPick.daysToRelease} days out` : "Backlog focus"}
                        </div>
                      </div>
                      <div
                        style={{
                          padding: "10px",
                          borderRadius: "12px",
                          border: "1px solid rgba(255,255,255,0.12)",
                          background: "rgba(255,255,255,0.05)",
                        }}
                      >
                        <div className="stat-sub" style={{ marginBottom: 4 }}>Up next</div>
                        <div style={{ fontWeight: 700, marginBottom: 2 }}>
                          {readNextBackup ? readNextBackup.title : "Shuffle for another pick"}
                        </div>
                        <div className="stat-sub">
                          {readNextBackup ? `${readNextBackup.unreadCount} unread` : "Queue empty"}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      padding: "12px 14px",
                      borderRadius: "14px",
                    border: "1px solid rgba(255,182,193,0.24)",
                    background: "rgba(255,182,193,0.08)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    textAlign: "center",
                  }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                      <h4 style={{ margin: 0 }}>Purchase Next</h4>
                      <span
                        className="stat-sub"
                        style={{
                          padding: "2px 8px",
                          borderRadius: "999px",
                          border: "1px solid rgba(255,255,255,0.18)",
                          background: "rgba(255,255,255,0.06)",
                          fontSize: "0.7rem",
                        }}
                      >
                        Catch-up buy
                      </span>
                    </div>
                    {purchaseNextPick ? (
                      <>
                        <div style={{ fontWeight: 700, fontSize: "1rem" }}>{purchaseNextPick.title}</div>
                        <div className="stat-sub" style={{ color: "#f7d0dc" }}>
                          Need {purchaseNextPick.missingCount} volume{purchaseNextPick.missingCount === 1 ? "" : "s"} to reach vol {purchaseNextPick.releaseVolume}.
                        </div>
                        <div className="stat-sub" style={{ color: "#b6a6af" }}>
                          Ownership {Math.round((purchaseNextPick.ownershipRatio || 0) * 100)}% · Read{" "}
                          {Math.round((purchaseNextPick.readPct || 0) * 100)}% of owned
                        </div>
                        <div className="stat-sub" style={{ color: "#c5b3bc" }}>
                          Own to vol {purchaseNextPick.highestOwnedVolume || 0}; est. catch-up cost{" "}
                          {purchaseNextPick.costEstimate
                            ? `$${purchaseNextPick.costEstimate.toFixed(2)}`
                            : "n/a"}{" "}
                          {purchaseNextPick.avgMsrp ? `(avg $${purchaseNextPick.avgMsrp.toFixed(2)})` : ""}
                        </div>
                        <div className="stat-sub">
                          Next release:{" "}
                          {purchaseNextPick.nextRelease
                            ? `${purchaseNextPick.nextRelease.date.toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })} (${purchaseNextPick.daysToRelease} days)`
                            : "No date"}
                        </div>
                      </>
                    ) : (
                      <div className="stat-sub">No purchase catch-ups needed right now.</div>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12, justifyContent: "center" }}>
                  <button className="stat-link" type="button" onClick={() => setReadNextSeed((s) => s + 1)}>
                    Shuffle pick
                  </button>
                  <button
                    type="button"
                    className="stat-link"
                    style={{ background: "rgba(255,218,123,0.1)", borderColor: "rgba(255,218,123,0.4)", color: "#ffda7b" }}
                    onClick={() => handleSnoozeReadNext(7)}
                  >
                    Delay 7 days
                  </button>
                  <button
                    type="button"
                    className="stat-link"
                    style={{ background: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.22)" }}
                    onClick={() => setReadNextSnoozed({})}
                  >
                    Clear delays
                  </button>
                </div>
              </>
            ) : (
              <div className="stat-sub">Add some unread volumes to get a tailored pick.</div>
            )}
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

          <div className="stat-card wide" style={{ minHeight: "340px", maxHeight: "480px" }}>
            <h3>Suggestions</h3>
            {suggestionsErr && (
              <div className="error" style={{ textAlign: "center" }}>
                {suggestionsErr}
              </div>
            )}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px",
                alignItems: "stretch",
              }}
            >
              {["anime", "manga"].map((bucket) => {
                const bucketItems = suggestions
                  .filter((s) => (s.type || "").toLowerCase() === bucket)
                  .sort(
                    (a, b) =>
                      (b.createdAt?.getTime?.() || 0) - (a.createdAt?.getTime?.() || 0)
                  );
                return (
                  <div
                    key={bucket}
                    style={{
                      border: "1px solid rgba(255,182,193,0.18)",
                      borderRadius: "16px",
                      padding: "10px 12px",
                      display: "flex",
                      flexDirection: "column",
                      background: "rgba(255,182,193,0.04)",
                      minHeight: "240px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        marginBottom: "8px",
                        position: "relative",
                      }}
                    >
                      <h4
                        style={{
                          margin: 0,
                          color: "#ffb6c1",
                          textAlign: "center",
                          flex: 1,
                        }}
                      >
                        {bucket === "anime" ? "Anime" : "Manga"}
                      </h4>
                      <span
                        className="stat-sub"
                        style={{ position: "absolute", right: 0 }}
                      >
                        {bucketItems.length} suggestion{bucketItems.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div
                      className="scrollable"
                      style={{ maxHeight: "280px", height: "280px", paddingRight: "4px", overflowY: "auto" }}
                    >
                      {suggestionsLoading ? (
                        <div className="stat-sub">Loading suggestions...</div>
                      ) : bucketItems.length ? (
                        bucketItems.map((s) => {
                          const created =
                            s.createdAt instanceof Date
                              ? s.createdAt
                              : s.createdAt
                              ? new Date(s.createdAt)
                              : null;
                          return (
                            <div
                              key={s.id}
                              style={{
                                border: "1px solid rgba(255,182,193,0.25)",
                                borderRadius: "12px",
                                padding: "8px 10px",
                                marginBottom: "8px",
                                background: "rgba(255,182,193,0.06)",
                                display: "grid",
                                gridTemplateColumns: "1fr auto",
                                gap: "6px",
                                alignItems: "center",
                              }}
                            >
                              <div>
                                <div style={{ fontWeight: 600, color: "#f7d0dc" }}>
                                  {s.content || "(no content)"}
                                </div>
                                <div className="stat-sub" style={{ fontSize: "0.8rem" }}>
                                  {created
                                    ? created.toLocaleString(undefined, {
                                        month: "short",
                                        day: "numeric",
                                        hour: "numeric",
                                        minute: "2-digit",
                                      })
                                    : ""}{" "}
                                  {s.from ? `| ${s.from}` : ""}
                                </div>
                              </div>
                              <div style={{ display: "flex", gap: "6px" }}>
                                {admin && (
                                  <button
                                    type="button"
                                    className="stat-link"
                                    onClick={() => deleteSuggestion(s.id)}
                                  >
                                    Delete
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="stat-sub">No suggestions yet.</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="stat-sub" style={{ marginTop: "8px", textAlign: "center" }}>
              Total suggestions: {suggestions.length}
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
                            {group.books.length ? ` | ${readCount} read` : ""}
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
                                  {book.Title || book.title || "Untitled"}
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
                      {!seriesForm.dateMixed && (
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
                        </div>
                      )}
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

      {/* Purchase calendar (opens from Total Library Books) */}
      {purchaseCalendarOpen && (
        <div
          id="calendarOverlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) closePurchaseCalendar();
          }}
        >
          <div
            id="calendarCard"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="calendar-header">
              <div className="calendar-title">
                {new Date(purchaseMonth.year, purchaseMonth.month).toLocaleString(undefined, {
                  month: "long",
                  year: "numeric",
                })}
              </div>
              <div className="calendar-nav">
                <button
                  className="calendar-nav-btn"
                  onClick={() => changePurchaseMonth(-1)}
                  type="button"
                >
                  {"<"}
                </button>
                <button
                  className="calendar-nav-btn"
                  onClick={() => changePurchaseMonth(1)}
                  type="button"
                >
                  {">"}
                </button>
              </div>
              {/* Close handled by top-right X */}
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

            <div className="calendar-grid">
              {purchaseCalendarCells.cells.map((cell, idx) => {
                if (cell.type === "pad") return <div key={`pad-${idx}`} className="calendar-day pad" />;
                const { day, dateKey, items, isToday } = cell;
                return (
                  <div
                    key={dateKey}
                    className={
                      "calendar-day" +
                      (items.length ? " has-releases" : "") +
                      (isToday ? " today" : "")
                    }
                    onClick={() => {
                      if (!items.length) return;
                      setPurchaseDayModal({ date: dateKey, items });
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        if (!items.length) return;
                        setPurchaseDayModal({ date: dateKey, items });
                      }
                    }}
                  >
                    <div className="day-num">{day}</div>
                    <div className="calendar-releases">
                      {items.slice(0, 2).map((item) => (
                        <div key={item.id} className="calendar-release purchased">
                          {item.title || "Untitled"}
                        </div>
                      ))}
                      {items.length > 2 && (
                        <div className="calendar-release more">+{items.length - 2} more</div>
                      )}
                    </div>
                  </div>
                );
              })}
              {!purchaseCalendarCells.hasItems && (
                <div className="calendar-empty">No purchases for this month.</div>
              )}
            </div>
            <button
              id="calendarClose"
              onClick={closePurchaseCalendar}
              type="button"
            >
              x
            </button>
          </div>
        </div>
      )}

      {purchaseDayModal && (
        <div
          className="purchase-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPurchaseDayModal(null);
          }}
        >
          <div className="purchase-day-modal" onClick={(e) => e.stopPropagation()}>
            <div className="purchase-day-header">
              <div className="purchase-day-title">
                {new Date(purchaseDayModal.date).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </div>
              <button className="manga-btn secondary" onClick={() => setPurchaseDayModal(null)} type="button">
                x
              </button>
            </div>
            <div className="purchase-day-list">
              {purchaseDayModal.items.map((item) => (
                <div key={item.id} className="purchase-day-item">
                  {item.title || "Untitled"}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Read calendar (from Read/Unread stat) */}
      {readCalendarOpen && (
        <div
          id="calendarOverlay"
          onClick={() => setReadCalendarOpen(false)}
          style={{ zIndex: 10060 }}
        >
          <div
            id="calendarCard"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="calendar-header">
              <div className="calendar-title">
                {readCalendarMonth.toLocaleString(undefined, {
                  month: "long",
                  year: "numeric",
                })}
              </div>
              <div className="calendar-nav">
                <button
                  className="calendar-nav-btn"
                  onClick={() => changeReadCalendarMonth(-1)}
                  type="button"
                >
                  {"<"}
                </button>
                <button
                  className="calendar-nav-btn"
                  onClick={() => changeReadCalendarMonth(1)}
                  type="button"
                >
                  {">"}
                </button>
              </div>
              {/* Close handled by top-right X */}
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

            <div className="calendar-grid">
              {readCalendarCells.map((cell, idx) =>
                cell.type === "pad" ? (
                  <div key={idx} className="calendar-day pad" />
                ) : (
                  <div
                    key={cell.dateKey || idx}
                    className={
                      "calendar-day" +
                      (cell.isToday ? " today" : "") +
                      (cell.releases?.length ? " has-releases" : "")
                    }
                    onClick={() => {
                      if (!cell.releases?.length) return;
                      const fullDate = new Date(
                        readCalendarMonth.getFullYear(),
                        readCalendarMonth.getMonth(),
                        cell.day
                      );
                      setReadCalendarModalDay({
                        dateLabel: fullDate.toLocaleDateString(undefined, {
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        }),
                        releases: cell.releases,
                      });
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        if (!cell.releases?.length) return;
                        const fullDate = new Date(
                          readCalendarMonth.getFullYear(),
                          readCalendarMonth.getMonth(),
                          cell.day
                        );
                        setReadCalendarModalDay({
                          dateLabel: fullDate.toLocaleDateString(undefined, {
                            month: "long",
                            day: "numeric",
                            year: "numeric",
                          }),
                          releases: cell.releases,
                        });
                      }
                    }}
                  >
                    <div className="day-num">{cell.day}</div>
                    <div className="calendar-releases">
                      {(cell.releases || []).slice(0, 2).map((r, i) => (
                        <div className="calendar-release purchased" key={i} title={r.title}>
                          {r.title}
                        </div>
                      ))}
                      {(cell.releases || []).length > 2 && (
                        <div className="calendar-release more">
                          +{(cell.releases || []).length - 2} more
                        </div>
                      )}
                    </div>
                  </div>
                )
              )}
            </div>

            {!readEntries.length && (
              <div className="calendar-empty">No reads recorded yet.</div>
            )}

            <button
              id="calendarClose"
              onClick={() => setReadCalendarOpen(false)}
              type="button"
            >
              x
            </button>
          </div>
        </div>
      )}

      {readCalendarModalDay && (
        <div
          id="calendarOverlay"
          onClick={() => setReadCalendarModalDay(null)}
          style={{ zIndex: 10080 }}
        >
          <div
            id="calendarCard"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "520px" }}
          >
            <div className="calendar-header">
              <div className="calendar-title">{readCalendarModalDay.dateLabel}</div>
              <button
                className="calendar-close-btn"
                onClick={() => setReadCalendarModalDay(null)}
                type="button"
              >
                x
              </button>
            </div>
            <div className="calendar-releases modal-list">
              {readCalendarModalDay.releases.map((r, idx) => (
                <div className="calendar-release purchased" key={idx} title={r.title}>
                  {r.title}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

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
                          className={"calendar-release" + (r.purchased ? " purchased" : "")}
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
              {detailModal.type === "releases" && "Library & Wishlist Releases"}
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
                x
              </button>
            </div>
            <div className="calendar-releases modal-list">
              {calendarModalDay.releases.map((r, idx) => (
                <div
                  className={"calendar-release" + (r.purchased ? " purchased" : "")}
                  key={idx}
                  title={r.title}
                >
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
                X
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
                <span>User roles</span>
                <div style={{ marginTop: 8, fontSize: "0.85rem", color: "var(--text-soft)" }}>
                  {usersLoading ? (
                    <span>Loading usersâ€¦</span>
                  ) : usersList.length === 0 ? (
                    <span>No users found.</span>
                  ) : (
                    <ul
                      style={{
                        listStyle: "none",
                        margin: "6px 0 0",
                        padding: 0,
                        display: "flex",
                        gap: 6,
                        flexDirection: "column",
                      }}
                    >
                      {usersList.map((u) => (
                        <li
                          key={u.uid}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 8,
                            background: "rgba(24,5,18,0.7)",
                            border: "1px solid rgba(255,182,193,0.18)",
                            borderRadius: 10,
                            padding: "6px 8px",
                            flexWrap: "wrap",
                          }}
                        >
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            <strong>{u.displayName || u.email || u.uid}</strong>
                            <span style={{ fontSize: "0.85rem", opacity: 0.8 }}>{u.email || u.uid}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span className="role-pill">{u.role || "viewer"}</span>
                            {u.role === "admin" ? (
                              <button
                                className="dashboard-close"
                                type="button"
                                onClick={() => updateUserRole(u.uid, "viewer")}
                                style={{ padding: "4px 10px" }}
                              >
                                Make viewer
                              </button>
                            ) : (
                              <button
                                className="stat-link"
                                type="button"
                                onClick={() => updateUserRole(u.uid, "admin")}
                                style={{ padding: "4px 10px" }}
                              >
                                Make admin
                              </button>
                            )}
                          </div>
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



