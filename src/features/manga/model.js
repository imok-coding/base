// Manga model: normalizing Firestore docs, parsing series/volume
// numbers out of titles, grouping volumes into series and data-health checks.
import { isBlank, normalizeDate, parseDate, toNumber } from "../../lib/format";

export const LISTS = ["library", "wishlist"];
export const LIST_LABEL = { library: "Library", wishlist: "Wishlist" };

export const DEMOGRAPHICS = ["Shounen", "Shoujo", "Seinen", "Josei", "Kodomo"];

// "Series Name, Vol. 3 (Manga)" gives name "Series Name", vol 3.  Handles "Volume",
// "Vol 3", "Vol. #3", ranges like "Vol. 1-3" and trailing parentheticals.
const TITLE_RE =
  /^(.*?)(?:[\s,:\u2013\u2014-]*\b(?:vol(?:ume)?)\b\.?\s*#?\s*(\d+)(?:\s*[-\u2013\u2014]\s*(\d+))?)?\s*(?:\([^)]*\)\s*)*$/i;

const titleCache = new Map();

export function parseTitle(title) {
  const raw = String(title || "").trim();
  if (titleCache.has(raw)) return titleCache.get(raw);
  const m = raw.match(TITLE_RE);
  const series = (m ? m[1] : raw).replace(/[\s,:\u2013\u2014-]+$/, "").trim() || raw;
  const start = m && m[2] ? parseInt(m[2], 10) : 0;
  const end = m && m[3] ? parseInt(m[3], 10) : start;
  const volumes = [];
  if (start > 0) for (let v = start; v <= Math.max(start, end) && volumes.length < 50; v += 1) volumes.push(v);
  const parsed = {
    series,
    key: series.toLowerCase().replace(/\s+/g, " "),
    vol: start,
    volumes,
  };
  if (titleCache.size > 5000) titleCache.clear();
  titleCache.set(raw, parsed);
  return parsed;
}

export const seriesKeyOf = (title) => parseTitle(title).key;

export function seriesSlug(key) {
  return encodeURIComponent(key);
}

const str = (v) => (v == null ? "" : String(v).trim());
const num = (v) => {
  if (v === undefined || v === null || v === "") return "";
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : "";
};
const unknownToBlank = (v) => (str(v).toLowerCase() === "unknown" ? "" : str(v));

/** Normalize a raw Firestore doc (also handles old capitalized field names). */
export function normalizeVolume(raw, kind) {
  const title = str(raw.title ?? raw.Title);
  const parsed = parseTitle(title);
  const specialType = str(raw.specialType ?? raw.SpecialType);
  const rating = num(raw.rating ?? raw.Rating);
  return {
    id: raw.id,
    kind,
    title,
    authors: unknownToBlank(raw.authors ?? raw.Authors),
    publisher: unknownToBlank(raw.publisher ?? raw.Publisher),
    demographic: str(raw.demographic ?? raw.Demographic),
    genre: str(raw.genre ?? raw.Genre),
    subGenre: str(raw.subGenre ?? raw.SubGenre),
    date: normalizeDate(raw.date ?? raw.releaseDate ?? raw.ReleaseDate ?? raw.Date),
    cover: str(raw.cover ?? raw.Cover),
    isbn: str(raw.isbn ?? raw.ISBN),
    pageCount: num(raw.pageCount ?? raw.PageCount ?? raw.pages ?? raw.Pages),
    rating: rating === "" || rating <= 0 ? "" : Math.max(0.5, Math.min(5, rating)),
    amountPaid: num(raw.amountPaid ?? raw.AmountPaid ?? raw.pricePaid),
    msrp: num(raw.msrp ?? raw.MSRP),
    collectiblePrice: num(raw.collectiblePrice ?? raw.CollectiblePrice),
    specialType,
    specialVolumes: num(raw.specialVolumes ?? raw.SpecialVolumes ?? raw.volumesContained),
    dateRead: normalizeDate(raw.dateRead ?? raw.DateRead),
    datePurchased: normalizeDate(raw.datePurchased ?? raw.DatePurchased),
    read: kind === "library" && (!!raw.read || raw.Read === true || raw.status === "Read"),
    amazonURL: str(raw.amazonURL),
    hidden: !!raw.hidden,
    // derived
    series: parsed.series,
    seriesKey: parsed.key || title.toLowerCase() || raw.id,
    vol: parsed.vol,
    volumes: parsed.volumes,
  };
}

export function compareVolumes(a, b) {
  const byName = a.seriesKey.localeCompare(b.seriesKey);
  if (byName) return byName;
  if (a.vol !== b.vol) return a.vol - b.vol;
  return a.title.localeCompare(b.title);
}

export const isCollectible = (v) => (v.specialType || "").toLowerCase() === "collectible";
export const isSpecialEdition = (v) => (v.specialType || "").toLowerCase() === "specialedition";

/** Fields an admin should fill in, used for the amber "needs info" markers. */
export const FIELD_LABELS = {
  authors: "Author",
  publisher: "Publisher",
  date: "Release date",
  pageCount: "Page count",
  isbn: "ISBN",
  datePurchased: "Purchase date",
  msrp: "MSRP",
  amountPaid: "Amount paid",
  collectiblePrice: "Collectible price",
  specialVolumes: "Volumes contained",
  demographic: "Demographic",
  genre: "Genre",
};

export function missingFields(v) {
  const missing = [];
  if (isBlank(v.authors)) missing.push("authors");
  if (isBlank(v.publisher)) missing.push("publisher");
  if (isBlank(v.date)) missing.push("date");
  if (!(toNumber(v.pageCount) > 0)) missing.push("pageCount");
  if (v.kind === "library") {
    if (isBlank(v.isbn)) missing.push("isbn");
    if (isBlank(v.datePurchased)) missing.push("datePurchased");
    if (isBlank(v.msrp)) missing.push("msrp");
    if (isCollectible(v)) {
      if (isBlank(v.collectiblePrice)) missing.push("collectiblePrice");
    } else if (isBlank(v.amountPaid)) missing.push("amountPaid");
    if (isSpecialEdition(v) && isBlank(v.specialVolumes)) missing.push("specialVolumes");
    if (isBlank(v.demographic)) missing.push("demographic");
    if (isBlank(v.genre)) missing.push("genre");
  }
  return missing;
}

/** A series is hidden if any of its volumes (in either list) is hidden. */
export function hiddenSeriesKeys(library, wishlist) {
  const keys = new Set();
  for (const v of library) if (v.hidden) keys.add(v.seriesKey);
  for (const v of wishlist) if (v.hidden) keys.add(v.seriesKey);
  return keys;
}

/**
 * The cover a series shows: the first volume in the library that hasn't been
 * read yet, or the newest one once they're all read (until the next volume is
 * added). Series with nothing in the library use their first cover.
 */
export function seriesCover(items) {
  const withCover = items.filter((v) => v.cover);
  const owned = withCover.filter((v) => v.kind === "library");
  if (!owned.length) return withCover[0]?.cover || "";
  // numbered volumes only, so a box set or artbook doesn't take over
  const numbered = owned.filter((v) => v.vol > 0);
  const list = (numbered.length ? numbered : owned).slice().sort((a, b) => a.vol - b.vol);
  return (list.find((v) => !v.read) || list.at(-1)).cover;
}

/** Group volumes into series summaries (input should already be sorted). */
export function groupSeries(volumes) {
  const map = new Map();
  for (const v of volumes) {
    let s = map.get(v.seriesKey);
    if (!s) {
      s = {
        key: v.seriesKey,
        title: v.series || v.title || "Untitled",
        authors: "",
        publisher: "",
        demographic: "",
        genre: "",
        cover: "",
        items: [],
        count: 0,
        readCount: 0,
        volNumbers: [],
        missingCount: 0,
        hidden: false,
        lastPurchased: "",
        lastRead: "",
        nextRelease: "",
        ratingSum: 0,
        ratingCount: 0,
      };
      map.set(v.seriesKey, s);
    }
    s.items.push(v);
    s.count += 1;
    if (v.read) s.readCount += 1;
    s.volNumbers.push(...v.volumes);
    if (!s.authors && v.authors) s.authors = v.authors;
    if (!s.publisher && v.publisher) s.publisher = v.publisher;
    if (!s.demographic && v.demographic) s.demographic = v.demographic;
    if (!s.genre && v.genre) s.genre = v.genre;
    if (v.hidden) s.hidden = true;
    if (v.datePurchased > s.lastPurchased) s.lastPurchased = v.datePurchased;
    if (v.dateRead > s.lastRead) s.lastRead = v.dateRead;
    if (v.rating) {
      s.ratingSum += Number(v.rating);
      s.ratingCount += 1;
    }
  }
  const today = new Date().toISOString().slice(0, 10);
  for (const s of map.values()) {
    s.missingCount = 0;
    for (const v of s.items) {
      if (missingFields(v).length) s.missingCount += 1;
      if (v.date && v.date >= today && (!s.nextRelease || v.date < s.nextRelease)) s.nextRelease = v.date;
    }
    s.avgRating = s.ratingCount ? s.ratingSum / s.ratingCount : 0;
    s.cover = seriesCover(s.items);
  }
  return [...map.values()];
}

/** "Vol. 1-5, 7, 9-10" */
export function formatVolumeRange(numbers) {
  const uniq = [...new Set(numbers.filter((n) => Number.isFinite(n) && n > 0))].sort((a, b) => a - b);
  if (!uniq.length) return "";
  const ranges = [];
  let start = uniq[0];
  let prev = uniq[0];
  for (const n of uniq.slice(1)) {
    if (n === prev + 1) {
      prev = n;
      continue;
    }
    ranges.push([start, prev]);
    start = prev = n;
  }
  ranges.push([start, prev]);
  const text = ranges.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(", ");
  return `${ranges.length === 1 && ranges[0][0] === ranges[0][1] ? "Vol." : "Vols."} ${text}`;
}

/** Per-series shared info, used to pre-fill new volumes and suggest titles. */
export function buildSeriesInfo(library, wishlist) {
  const map = new Map();
  for (const v of [...library, ...wishlist]) {
    let info = map.get(v.seriesKey);
    if (!info) {
      info = {
        key: v.seriesKey,
        display: v.series,
        maxVol: 0,
        authors: "",
        publisher: "",
        demographic: "",
        genre: "",
        subGenre: "",
        msrps: new Set(),
      };
      map.set(v.seriesKey, info);
    }
    info.maxVol = Math.max(info.maxVol, ...v.volumes, v.vol || 0);
    for (const f of ["authors", "publisher", "demographic", "genre", "subGenre"]) {
      if (!info[f] && v[f]) info[f] = v[f];
    }
    if (v.kind === "library" && v.msrp !== "") info.msrps.add(Number(v.msrp));
  }
  for (const info of map.values()) {
    info.msrp = info.msrps.size === 1 ? [...info.msrps][0] : "";
    delete info.msrps;
  }
  return map;
}

export function nextVolumeTitle(display, vol) {
  return `${display}, Vol. ${vol}`;
}

export const EMPTY_ENTRY = Object.freeze({
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
  hidden: false,
});

/** Editable form values for an existing volume. */
export function toFormValues(v) {
  const out = {};
  for (const key of Object.keys(EMPTY_ENTRY)) out[key] = v[key] ?? EMPTY_ENTRY[key];
  for (const key of ["pageCount", "rating", "amountPaid", "msrp", "specialVolumes", "collectiblePrice"]) {
    out[key] = out[key] === "" ? "" : String(out[key]);
  }
  return out;
}

const formNum = (v, int = false) => {
  const s = (v ?? "").toString().trim();
  if (!s) return "";
  const n = int ? parseInt(s, 10) : parseFloat(s);
  return Number.isFinite(n) ? n : "";
};

/**
 * Convert form values into the Firestore document shape for `list`.
 * Blank shared fields inherit from the series (`info`) like the old editor did.
 */
export function toPayload(form, list, info) {
  const isLib = list === "library";
  const specialType = isLib ? str(form.specialType) : "";
  const rating = formNum(form.rating);
  const read = isLib && !!form.read;
  return {
    title: str(form.title),
    authors: str(form.authors) || info?.authors || "",
    publisher: str(form.publisher) || info?.publisher || "",
    demographic: str(form.demographic) || info?.demographic || "",
    genre: str(form.genre) || info?.genre || "",
    subGenre: str(form.subGenre) || info?.subGenre || "",
    date: normalizeDate(form.date),
    cover: str(form.cover),
    isbn: isLib ? str(form.isbn) : "",
    pageCount: formNum(form.pageCount, true),
    rating: isLib && rating !== "" ? Math.max(0.5, Math.min(5, rating)) : "",
    amountPaid: formNum(form.amountPaid),
    dateRead: read ? normalizeDate(form.dateRead) : "",
    datePurchased: normalizeDate(form.datePurchased),
    msrp: isLib ? (formNum(form.msrp) === "" ? (info?.msrp ?? "") : formNum(form.msrp)) : "",
    special: !!specialType,
    specialType,
    specialVolumes: specialType === "specialEdition" ? formNum(form.specialVolumes, true) : "",
    collectiblePrice: specialType === "collectible" ? formNum(form.collectiblePrice) : "",
    amazonURL: str(form.amazonURL),
    read,
    hidden: !!form.hidden,
  };
}

/** Document to write when moving a volume to the other list. */
export function movePayload(v, to, info, { purchasedToday = false } = {}) {
  const base = toPayload({ ...toFormValues(v), read: to === "library" ? v.read : false }, to, info);
  // A wishlist item with a purchase date is a pre-order; keep it when moving.
  if (to === "library" && purchasedToday && !base.datePurchased) {
    base.datePurchased = normalizeDate(new Date());
  }
  return base;
}

export function sumBy(items, fn) {
  let total = 0;
  for (const it of items) total += toNumber(fn(it));
  return total;
}

export function releaseDate(v) {
  return parseDate(v.date);
}
