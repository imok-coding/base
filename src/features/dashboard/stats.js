// Dashboard stats. Works on the normalized volumes from MangaData
// (fields: seriesKey, series, vol, read, dateRead, datePurchased, date, etc).
import { parseDate, toNumber } from "../../lib/format";

const MS_DAY = 86400000;

export function buildSeriesMap(library) {
  const map = new Map();
  for (const v of library) {
    let s = map.get(v.seriesKey);
    if (!s) {
      s = {
        key: v.seriesKey,
        title: v.series || v.title,
        publisher: v.publisher,
        genre: v.genre,
        demographic: v.demographic,
        volumes: 0,
        pages: 0,
        readPages: 0,
        readVolumes: 0,
        ratingSum: 0,
        ratingCount: 0,
        msrp: 0,
        paid: 0,
        collectible: 0,
      };
      map.set(v.seriesKey, s);
    }
    s.volumes += 1;
    const pages = toNumber(v.pageCount);
    s.pages += pages;
    if (v.read) {
      s.readVolumes += 1;
      s.readPages += pages;
    }
    if (Number(v.rating) > 0) {
      s.ratingSum += Number(v.rating);
      s.ratingCount += 1;
    }
    s.msrp += toNumber(v.msrp);
    s.paid += toNumber(v.amountPaid);
    s.collectible += toNumber(v.collectiblePrice);
    for (const f of ["publisher", "genre", "demographic"]) if (!s[f] && v[f]) s[f] = v[f];
  }
  return map;
}

/** Rank values of `field` by number of series (not volumes). */
export function topBySeries(seriesMap, field, limit = 5) {
  const counts = new Map();
  for (const s of seriesMap.values()) {
    for (const part of String(s[field] || "").split(/[/,]/)) {
      const p = part.trim();
      if (p) counts.set(p, (counts.get(p) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

export function monthlyReads(library, year) {
  const months = Array.from({ length: 12 }, (_, m) => ({
    label: new Date(year, m, 1).toLocaleString(undefined, { month: "short" }),
    month: m,
    value: 0,
  }));
  for (const v of library) {
    const d = parseDate(v.dateRead);
    if (d && d.getFullYear() === year) months[d.getMonth()].value += 1;
  }
  return months;
}

export function readYears(library) {
  const years = new Set([new Date().getFullYear()]);
  for (const v of library) {
    const d = parseDate(v.dateRead);
    if (d) years.add(d.getFullYear());
  }
  return [...years].sort((a, b) => b - a);
}

export function weekdayReads(library) {
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const counts = Array(7).fill(0);
  for (const v of library) {
    const d = parseDate(v.dateRead);
    if (d) counts[d.getDay()] += 1;
  }
  return labels.map((label, i) => ({ label, value: counts[i] }));
}

export function ratingDistribution(library) {
  const buckets = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map((r) => ({ label: r.toFixed(1), rating: r, value: 0 }));
  for (const v of library) {
    const r = Number(v.rating);
    if (!(r > 0)) continue;
    const idx = Math.round(Math.max(0.5, Math.min(5, r)) * 2) - 1;
    buckets[idx].value += 1;
  }
  return buckets;
}

/** Every dated volume across both lists, oldest first. */
export function releaseEntries(library, wishlist) {
  const out = [];
  for (const [list, source] of [
    [wishlist, "wishlist"],
    [library, "library"],
  ]) {
    for (const v of list) {
      const date = parseDate(v.date);
      if (!date) continue;
      out.push({
        id: v.id,
        date,
        title: v.title,
        series: v.series,
        seriesKey: v.seriesKey,
        volume: v.vol || null,
        purchased: !!v.datePurchased,
        source,
      });
    }
  }
  return out.sort((a, b) => a.date - b.date || a.title.localeCompare(b.title));
}

export function nextRelease(releases) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return releases.find((r) => r.date >= start) || null;
}

export function purchaseToRead(library) {
  let total = 0;
  let count = 0;
  const bySeries = new Map();
  for (const v of library) {
    const dp = parseDate(v.datePurchased);
    const dr = parseDate(v.dateRead);
    if (!dp || !dr || dr <= dp) continue;
    const days = (dr - dp) / MS_DAY;
    total += days;
    count += 1;
    let row = bySeries.get(v.seriesKey);
    if (!row) {
      row = { key: v.seriesKey, title: v.series, total: 0, count: 0, min: days, max: days };
      bySeries.set(v.seriesKey, row);
    }
    row.total += days;
    row.count += 1;
    row.min = Math.min(row.min, days);
    row.max = Math.max(row.max, days);
  }
  const series = [...bySeries.values()].map((r) => ({ ...r, avg: r.total / r.count })).sort((a, b) => b.avg - a.avg);
  return { avg: count ? total / count : null, count, series };
}

export function dailyReadRate(library) {
  const reads = library
    .map((v) => parseDate(v.dateRead))
    .filter(Boolean)
    .sort((a, b) => a - b);
  if (!reads.length) return { lifetime: null, ytd: null, ytdCount: 0 };
  const now = new Date();
  const lifetimeDays = Math.max(1, Math.round((now - reads[0]) / MS_DAY) + 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const ytdDays = Math.max(1, Math.floor((now - startOfYear) / MS_DAY) + 1);
  const ytdCount = reads.filter((d) => d.getFullYear() === now.getFullYear()).length;
  return { lifetime: reads.length / lifetimeDays, ytd: ytdCount / ytdDays, ytdCount };
}

/** Paid falls back to MSRP when a price wasn't recorded (matches the old dashboard). */
export function collectionValue(library) {
  let msrp = 0;
  let paid = 0;
  let paidRecorded = 0;
  let collectible = 0;
  for (const v of library) {
    const m = toNumber(v.msrp);
    const p = toNumber(v.amountPaid);
    msrp += m;
    paid += p || m;
    paidRecorded += p;
    collectible += toNumber(v.collectiblePrice);
  }
  return { msrp, paid, paidRecorded, collectible, savingsPct: msrp > 0 ? (1 - paid / msrp) * 100 : null };
}

export function pageTotals(library) {
  let total = 0;
  let read = 0;
  for (const v of library) {
    const p = toNumber(v.pageCount);
    total += p;
    if (v.read) read += p;
  }
  return { total, read };
}

export function averageSeriesRating(seriesMap) {
  let sum = 0;
  let count = 0;
  for (const s of seriesMap.values()) {
    if (s.ratingCount) {
      sum += s.ratingSum / s.ratingCount;
      count += 1;
    }
  }
  return count ? sum / count : null;
}

// Read next / purchase next

export function seriesProgress(library, wishlist) {
  const map = new Map();
  let globalSum = 0;
  let globalCount = 0;
  for (const v of library) {
    let e = map.get(v.seriesKey);
    if (!e) {
      e = {
        key: v.seriesKey,
        title: v.series,
        cover: v.cover,
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
      };
      map.set(v.seriesKey, e);
    }
    e.libraryCount += 1;
    e.total += 1;
    e.highestOwnedVolume = Math.max(e.highestOwnedVolume, v.vol || 0);
    if (v.read) {
      e.lastReadVolume = Math.max(e.lastReadVolume, v.vol || 0);
      e.readVolumes += 1;
    } else {
      e.unreadCount += 1;
      if (!e.firstUnread || (v.vol || 0) < (e.firstUnread.vol || 0)) e.firstUnread = v;
    }
    const m = Number(v.msrp);
    if (m > 0) {
      e.msrpSum += m;
      e.msrpCount += 1;
      globalSum += m;
      globalCount += 1;
    }
    const dp = parseDate(v.datePurchased);
    if (dp && dp.getTime() > e.latestPurchaseTs) e.latestPurchaseTs = dp.getTime();
    if (!e.cover && v.cover) e.cover = v.cover;
  }
  for (const v of wishlist) {
    const e = map.get(v.seriesKey);
    if (e) e.wishlistCount += 1;
  }
  const now = Date.now();
  for (const e of map.values()) {
    e.avgMsrp = e.msrpCount ? e.msrpSum / e.msrpCount : null;
    const owned = e.libraryCount + e.wishlistCount;
    e.ownershipRatio = owned ? e.libraryCount / owned : 0;
    e.fullyOwned = e.wishlistCount === 0;
    e.recentPurchaseScore = e.latestPurchaseTs ? Math.max(0, 1 - (now - e.latestPurchaseTs) / (MS_DAY * 120)) : 0;
    e.latestPurchaseDays = e.latestPurchaseTs ? Math.round((now - e.latestPurchaseTs) / MS_DAY) : null;
  }
  return { map, globalAvgMsrp: globalCount ? globalSum / globalCount : null };
}

function upcomingBySeries(releases) {
  const now = new Date();
  const out = new Map();
  for (const r of releases) {
    if (r.date < now || !r.seriesKey) continue;
    const cur = out.get(r.seriesKey);
    if (!cur || r.date < cur.date) out.set(r.seriesKey, r);
  }
  return out;
}

/** Weighted "read next" pick balancing backlog, upcoming releases and recency. */
export function readNextSuggestion(progress, releases, snoozed = {}, seed = 0) {
  if (!progress?.size) return null;
  const now = new Date();
  const upcoming = upcomingBySeries(releases);
  const candidates = [...progress.values()].filter((s) => s.unreadCount > 0).map((s) => ({ ...s }));
  if (!candidates.length) return null;

  candidates.forEach((c, idx) => {
    const until = snoozed[c.key] ? new Date(snoozed[c.key]) : null;
    if (until && until > now) {
      c.snoozedUntil = until;
      c.score = -Infinity;
      return;
    }
    const next = upcoming.get(c.key) || null;
    const daysToRelease = next ? Math.round((next.date - now) / MS_DAY) : null;
    const releaseVolume = next?.volume || null;
    const gapOwned = releaseVolume ? Math.max(0, releaseVolume - c.highestOwnedVolume - 1) : 0;
    const catchUpTarget = releaseVolume
      ? Math.max(c.highestOwnedVolume || 0, releaseVolume - 1)
      : c.highestOwnedVolume || c.total;
    const behind = Math.max(
      c.unreadCount,
      Math.max(0, catchUpTarget - c.lastReadVolume),
      releaseVolume ? Math.max(0, releaseVolume - 1 - c.lastReadVolume) : 0
    );
    const backlog = Math.min(behind, 8) / 8;
    const urgency = daysToRelease != null && daysToRelease >= 0 ? Math.max(0, 120 - daysToRelease) / 120 : 0;
    const soon = daysToRelease != null && daysToRelease <= 45 ? 0.6 : 0;
    const gapPenalty = releaseVolume ? Math.min(gapOwned, 12) / 12 : 0;
    const bigGap = gapOwned >= 6 ? 0.6 : 0;
    const ownership = c.ownershipRatio * 1.05 - (Math.min(c.wishlistCount, 6) / 6) * 0.35;
    const fullyOwned = c.fullyOwned ? 0.35 : 0;
    const recency = c.recentPurchaseScore * 0.8;
    const jitter = 0.85 + (Math.abs(Math.sin(seed + idx + 1)) % 0.35);
    const base =
      1 + backlog * 1.15 + urgency * 1.1 + soon + ownership + fullyOwned + recency - gapPenalty * 1.25 - bigGap;
    Object.assign(c, {
      score: Math.max(base, 0.05) * jitter,
      nextRelease: next,
      daysToRelease,
      catchUpTarget,
      behindCount: behind,
      upcomingVolume: releaseVolume,
      ownedVsUpcomingGap: gapOwned,
      weights: { backlog, urgency, soon, ownership, fullyOwned, recency, gapPenalty: gapPenalty + bigGap },
    });
  });

  const available = candidates.filter((c) => c.score > -Infinity).sort((a, b) => b.score - a.score);
  const snoozedList = candidates.filter((c) => c.score === -Infinity);
  return { pick: available[0] || null, backup: available[1] || null, snoozed: snoozedList, seed };
}

export function purchaseNextSuggestion(progress, releases, globalAvgMsrp) {
  if (!progress?.size) return null;
  const now = new Date();
  const upcoming = upcomingBySeries(releases);
  const candidates = [];
  for (const e of progress.values()) {
    const next = upcoming.get(e.key);
    if (!next || next.purchased || !next.volume) continue;
    const missingCount = Math.max(0, next.volume - 1 - e.highestOwnedVolume);
    if (missingCount <= 0) continue;
    const daysToRelease = Math.round((next.date - now) / MS_DAY);
    const avgMsrp = e.avgMsrp || globalAvgMsrp || 0;
    const costEstimate = avgMsrp > 0 ? avgMsrp * missingCount : 0;
    const affordability = avgMsrp > 0 ? 1 / (1 + costEstimate / 60) : 0.7;
    const urgency = daysToRelease >= 0 ? Math.max(0, 120 - daysToRelease) / 120 : 0;
    const readPct = e.total ? e.readVolumes / e.total : 0;
    const score =
      urgency * 1.2 +
      affordability +
      (1 / Math.max(1, missingCount)) * 0.8 +
      e.ownershipRatio * 0.9 +
      readPct * 0.8 +
      (daysToRelease <= 45 ? 0.5 : 0) -
      (Math.min(missingCount, 12) / 12) * 0.9;
    candidates.push({
      ...e,
      nextRelease: next,
      releaseVolume: next.volume,
      daysToRelease,
      missingCount,
      costEstimate,
      avgMsrp,
      readPct,
      score,
    });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  return { pick: candidates[0], list: candidates };
}

export function sanitizeSnoozed(raw) {
  const out = {};
  const now = Date.now();
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw)) {
    const ts = Number(v);
    if (Number.isFinite(ts) && ts > now) out[k] = ts;
  }
  return out;
}

/** Everything the overview needs, in one pass. */
export function computeStats(library, wishlist, year = new Date().getFullYear()) {
  const seriesMap = buildSeriesMap(library);
  const releases = releaseEntries(library, wishlist);
  const readCount = library.filter((v) => v.read).length;
  const { map: progress, globalAvgMsrp } = seriesProgress(library, wishlist);
  return {
    totalLibrary: library.length,
    totalWishlist: wishlist.length,
    readCount,
    unreadCount: library.length - readCount,
    readPct: library.length ? Math.round((readCount / library.length) * 100) : 0,
    seriesMap,
    seriesCount: seriesMap.size,
    monthly: monthlyReads(library, year),
    previousYear: monthlyReads(library, year - 1),
    years: readYears(library),
    weekday: weekdayReads(library),
    ratings: ratingDistribution(library),
    releases,
    nextRelease: nextRelease(releases),
    purchaseToRead: purchaseToRead(library),
    daily: dailyReadRate(library),
    value: collectionValue(library),
    pages: pageTotals(library),
    avgRating: averageSeriesRating(seriesMap),
    topPublishers: topBySeries(seriesMap, "publisher", 100),
    topGenres: topBySeries(seriesMap, "genre", 100),
    topDemographics: topBySeries(seriesMap, "demographic", 100),
    topSeries: [...seriesMap.values()]
      .sort((a, b) => b.volumes - a.volumes || a.title.localeCompare(b.title))
      .slice(0, 8),
    progress,
    globalAvgMsrp,
  };
}
