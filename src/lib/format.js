export function toNumber(val) {
  if (typeof val === "number") return Number.isFinite(val) ? val : 0;
  if (val == null || val === "") return 0;
  const num = parseFloat(String(val).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(num) ? num : 0;
}

/** Parse a form value into a number, or "" when blank/invalid (Firestore stores "" for unset). */
export function numberOrBlank(val, { int = false } = {}) {
  const str = (val ?? "").toString().trim();
  if (str === "") return "";
  const num = int ? parseInt(str, 10) : parseFloat(str);
  return Number.isFinite(num) ? num : "";
}

export function isBlank(val) {
  return val === undefined || val === null || String(val).trim() === "";
}

const currency = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" });
const currencyWhole = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function money(val, { whole = false } = {}) {
  return (whole ? currencyWhole : currency).format(toNumber(val));
}

export function count(n) {
  return Number(n || 0).toLocaleString();
}

export function plural(n, word, pluralWord = `${word}s`) {
  return `${count(n)} ${n === 1 ? word : pluralWord}`;
}

/** Parse "YYYY-MM-DD", "M/D/YY(YY)", Firestore Timestamps or Dates as a local date. */
export function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value.toDate === "function") return value.toDate();
  const str = String(value).trim();
  if (!str || str.toLowerCase() === "unknown") return null;
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const us = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (us) {
    const year = us[3].length === 2 ? Number(`20${us[3]}`) : Number(us[3]);
    return new Date(year, Number(us[1]) - 1, Number(us[2]));
  }
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toISODate(date) {
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Turn any supported date into "YYYY-MM-DD", or "" if it can't be parsed. */
export function normalizeDate(value) {
  return toISODate(parseDate(value));
}

export function todayISO() {
  return toISODate(new Date());
}

export function formatDate(value, opts = { year: "numeric", month: "short", day: "numeric" }) {
  const d = parseDate(value);
  return d ? d.toLocaleDateString(undefined, opts) : "";
}

const MS_DAY = 86400000;

export function daysBetween(a, b) {
  const start = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const end = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((end - start) / MS_DAY);
}

export function relativeDays(value) {
  const d = parseDate(value);
  if (!d) return "";
  const diff = daysBetween(new Date(), d);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  if (diff > 0) return diff < 60 ? `in ${diff} days` : `in ${Math.round(diff / 30)} months`;
  return -diff < 60 ? `${-diff} days ago` : `${Math.round(-diff / 30)} months ago`;
}

export function timeAgo(date) {
  if (!date) return "";
  const s = Math.round((Date.now() - date.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function slugify(text, fallback = "item") {
  const slug = String(text || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || fallback;
}
