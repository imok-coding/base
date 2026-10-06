// Game domain model. Fields mirror the "Backlog" sheet of
// Game_Library_and_Backlog_Tracker_Expanded.xlsx; option lists mirror its "Lists" sheet.
import { isBlank, normalizeDate } from "../../lib/format";

export const OPTIONS = {
  platform: [
    "Nintendo Switch",
    "Nintendo Switch 2",
    "Nintendo 3DS",
    "Nintendo DS",
    "Wii U",
    "Wii",
    "GameCube",
    "PlayStation 5",
    "PlayStation 4",
    "PlayStation 3",
    "PlayStation 2",
    "PS Vita",
    "PSP",
    "Xbox Series X|S",
    "Xbox One",
    "Xbox 360",
    "Xbox",
    "PC / Windows",
    "Steam Deck",
    "Mac",
    "iOS / Android",
    "Other",
  ],
  format: ["Physical", "Digital", "Both"],
  status: ["Owned", "Wishlist", "Borrowed", "Sold / Traded"],
  backlog: ["Not Started", "In Progress", "Completed", "On Hold", "Dropped"],
  priority: ["Must Play", "High", "Medium", "Low"],
  genre: [
    "Action",
    "Adventure",
    "Action-Adventure",
    "RPG",
    "JRPG",
    "Strategy",
    "Simulation",
    "Platformer",
    "Puzzle",
    "Shooter",
    "Racing",
    "Sports",
    "Fighting",
    "Horror",
    "Visual Novel",
    "Party",
    "Other",
  ],
  playMode: ["Solo", "Local Co-op", "Online Co-op", "Competitive", "Mixed"],
  store: [
    "Retail",
    "Nintendo eShop",
    "PlayStation Store",
    "Xbox Store",
    "Steam",
    "Epic Games Store",
    "GOG",
    "Humble",
    "Itch.io",
    "Mobile Store",
    "Gift",
    "Other",
  ],
  region: ["North America", "Europe", "Japan", "Other", "Digital / N/A"],
  condition: ["Sealed", "Like New", "Good", "Fair", "Digital"],
};

const SHORT = {
  "Nintendo Switch": "Switch",
  "Nintendo Switch 2": "Switch 2",
  "Nintendo 3DS": "3DS",
  "Nintendo DS": "DS",
  "Wii U": "Wii U",
  Wii: "Wii",
  GameCube: "GameCube",
  "PlayStation 5": "PS5",
  "PlayStation 4": "PS4",
  "PlayStation 3": "PS3",
  "PlayStation 2": "PS2",
  "PS Vita": "Vita",
  PSP: "PSP",
  "Xbox Series X|S": "Series X|S",
  "Xbox One": "Xbox One",
  "Xbox 360": "Xbox 360",
  Xbox: "Xbox",
  "PC / Windows": "PC",
  "Steam Deck": "Steam Deck",
  Mac: "Mac",
  "iOS / Android": "Mobile",
};

export const platformShort = (p) => SHORT[p] || p || "-";

export function platformFamily(p = "") {
  if (/playstation|ps vita|psp/i.test(p)) return "playstation";
  if (/xbox/i.test(p)) return "xbox";
  if (/nintendo|wii|gamecube/i.test(p)) return "nintendo";
  if (/pc|steam|mac/i.test(p)) return "pc";
  return "other";
}

export const FAMILY_LABEL = {
  playstation: "PlayStation",
  xbox: "Xbox",
  nintendo: "Nintendo",
  pc: "PC",
  other: "Other",
};

/** Platforms in a sensible shelf order (newest generation first within a family). */
export function platformOrder(p) {
  const i = OPTIONS.platform.indexOf(p);
  return i === -1 ? 999 : i;
}

const str = (v) => (v == null ? "" : String(v).trim());
const num = (v) => {
  if (v === undefined || v === null || v === "") return "";
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : "";
};

export const EMPTY_GAME = Object.freeze({
  title: "",
  platform: "",
  edition: "",
  format: "Physical",
  status: "Owned",
  backlog: "Not Started",
  priority: "",
  rating: "",
  genre: "",
  releaseYear: "",
  acquired: "",
  price: "",
  hoursPlayed: "",
  hoursEstimated: "",
  completion: "",
  lastPlayed: "",
  completedDate: "",
  playMode: "",
  store: "",
  region: "",
  condition: "",
  revisit: "",
  notes: "",
  cover: "",
  reviewUrl: "",
  hidden: false,
  // filled from IGDB
  summary: "",
  developer: "",
  publisher: "",
  criticScore: "",
  screenshots: [],
  igdbId: "",
  igdbUrl: "",
});

export function normalizeGame(raw) {
  const rating = num(raw.rating);
  return {
    id: raw.id,
    title: str(raw.title),
    platform: str(raw.platform),
    edition: str(raw.edition),
    format: str(raw.format) || "Physical",
    status: str(raw.status) || "Owned",
    backlog: str(raw.backlog) || "Not Started",
    priority: str(raw.priority),
    rating: rating === "" || rating <= 0 ? "" : Math.max(1, Math.min(5, rating)),
    genre: str(raw.genre),
    releaseYear: num(raw.releaseYear),
    acquired: normalizeDate(raw.acquired),
    price: num(raw.price),
    hoursPlayed: num(raw.hoursPlayed),
    hoursEstimated: num(raw.hoursEstimated),
    completion: num(raw.completion),
    lastPlayed: normalizeDate(raw.lastPlayed),
    completedDate: normalizeDate(raw.completedDate),
    playMode: str(raw.playMode),
    store: str(raw.store),
    region: str(raw.region),
    condition: str(raw.condition),
    revisit: raw.revisit === true || raw.revisit === false ? raw.revisit : "",
    notes: str(raw.notes),
    cover: str(raw.cover),
    reviewUrl: str(raw.reviewUrl),
    hidden: !!raw.hidden,
    summary: str(raw.summary),
    developer: str(raw.developer),
    publisher: str(raw.publisher),
    criticScore: num(raw.criticScore),
    screenshots: Array.isArray(raw.screenshots) ? raw.screenshots.filter((x) => typeof x === "string") : [],
    igdbId: num(raw.igdbId),
    igdbUrl: str(raw.igdbUrl),
    importKey: str(raw.importKey),
    family: platformFamily(raw.platform),
  };
}

/** Hours left, same formula as the spreadsheet: max(estimated - played, 0). */
export function hoursRemaining(g) {
  if (g.hoursEstimated === "" || g.hoursPlayed === "") return "";
  return Math.max(Number(g.hoursEstimated) - Number(g.hoursPlayed), 0);
}

/** Completion % as entered, or derived from hours when only those are known. */
export function completionPct(g) {
  if (g.backlog === "Completed") return 100;
  if (g.completion !== "")
    return Math.round(Number(g.completion) <= 1 ? Number(g.completion) * 100 : Number(g.completion));
  if (g.hoursEstimated > 0 && g.hoursPlayed !== "")
    return Math.min(100, Math.round((g.hoursPlayed / g.hoursEstimated) * 100));
  return "";
}

/** Identity used to match spreadsheet rows to existing games on re-import. */
export function gameKey({ title, platform, edition, format }) {
  const n = (s) =>
    String(s || "")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  return [n(title), n(platform), n(edition), n(format)].join("|");
}

export function toGameForm(g) {
  const out = {};
  for (const key of Object.keys(EMPTY_GAME)) {
    const v = g[key] ?? EMPTY_GAME[key];
    out[key] = typeof v === "number" ? String(v) : v;
  }
  out.revisit = g.revisit === true ? "Yes" : g.revisit === false ? "No" : "";
  return out;
}

const formNum = (v, int = false) => {
  const s = (v ?? "").toString().trim();
  if (!s) return "";
  const n = int ? parseInt(s, 10) : parseFloat(s);
  return Number.isFinite(n) ? n : "";
};

export function toGamePayload(form) {
  const rating = formNum(form.rating);
  const payload = {
    title: str(form.title),
    platform: str(form.platform),
    edition: str(form.edition),
    format: str(form.format) || "Physical",
    status: str(form.status) || "Owned",
    backlog: str(form.backlog) || "Not Started",
    priority: str(form.priority),
    rating: rating === "" ? "" : Math.max(1, Math.min(5, Math.round(rating))),
    genre: str(form.genre),
    releaseYear: formNum(form.releaseYear, true),
    acquired: normalizeDate(form.acquired),
    price: formNum(form.price),
    hoursPlayed: formNum(form.hoursPlayed),
    hoursEstimated: formNum(form.hoursEstimated),
    completion: formNum(form.completion),
    lastPlayed: normalizeDate(form.lastPlayed),
    completedDate: normalizeDate(form.completedDate),
    playMode: str(form.playMode),
    store: str(form.store),
    region: str(form.region),
    condition: str(form.condition),
    revisit: form.revisit === "Yes" ? true : form.revisit === "No" ? false : "",
    notes: str(form.notes),
    cover: str(form.cover),
    reviewUrl: str(form.reviewUrl),
    hidden: !!form.hidden,
    summary: str(form.summary),
    developer: str(form.developer),
    publisher: str(form.publisher),
    criticScore: formNum(form.criticScore, true),
    screenshots: Array.isArray(form.screenshots) ? form.screenshots : [],
    igdbId: formNum(form.igdbId, true),
    igdbUrl: str(form.igdbUrl),
  };
  payload.importKey = gameKey(payload);
  return payload;
}

export function compareGames(a, b) {
  return (
    a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" }) ||
    platformOrder(a.platform) - platformOrder(b.platform)
  );
}

export const isOwned = (g) => g.status === "Owned" || g.status === "Borrowed";

/** Games still waiting on cover art. Hidden ones don't count. */
export const needsCover = (g) => !g.cover && !g.hidden;

/** Games not linked to IGDB yet. Hidden ones are skipped too. */
export const needsInfo = (g) => !g.igdbId && !g.hidden;

export function gameMissing(g) {
  const m = [];
  if (isBlank(g.cover)) m.push("cover");
  if (isBlank(g.platform)) m.push("platform");
  return m;
}
