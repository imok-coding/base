// Game info from IGDB, through the proxy in igdb-proxy/ (IGDB doesn't take
// requests from browsers). The proxy URL comes from VITE_IGDB_PROXY.
import { matchQuality, RANK } from "./titles";

export const IGDB_PROXY = (import.meta.env.VITE_IGDB_PROXY || "").replace(/\/+$/, "");
export const igdbReady = !!IGDB_PROXY;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function query(endpoint, body, attempt = 0) {
  // plain text body, so the browser skips the CORS preflight
  const res = await fetch(`${IGDB_PROXY}/v4/${endpoint}`, { method: "POST", body });
  if (res.status === 429 && attempt < 4) {
    await sleep(800 * (attempt + 1));
    return query(endpoint, body, attempt + 1);
  }
  if (!res.ok) throw new Error(`IGDB ${res.status}`);
  return res.json();
}

export const igdbImage = (id, size = "cover_big_2x") =>
  id ? `https://images.igdb.com/igdb/image/upload/t_${size}/${id}.jpg` : "";

// our platform names -> what IGDB calls them
const PLATFORMS = {
  "Nintendo Switch": ["Nintendo Switch"],
  "Nintendo Switch 2": ["Nintendo Switch 2"],
  "Nintendo 3DS": ["Nintendo 3DS", "New Nintendo 3DS"],
  "Nintendo DS": ["Nintendo DS"],
  "Wii U": ["Wii U"],
  Wii: ["Wii"],
  GameCube: ["Nintendo GameCube"],
  "PlayStation 5": ["PlayStation 5", "PlayStation VR2"],
  "PlayStation 4": ["PlayStation 4", "PlayStation VR"],
  "PlayStation 3": ["PlayStation 3"],
  "PlayStation 2": ["PlayStation 2"],
  "PS Vita": ["PlayStation Vita"],
  PSP: ["PlayStation Portable"],
  "Xbox Series X|S": ["Xbox Series X|S"],
  "Xbox One": ["Xbox One"],
  "Xbox 360": ["Xbox 360"],
  Xbox: ["Xbox"],
  "PC / Windows": ["PC (Microsoft Windows)"],
  "Steam Deck": ["PC (Microsoft Windows)", "SteamOS", "Linux"],
  Mac: ["Mac"],
  "iOS / Android": ["iOS", "Android"],
};

// IGDB genres and themes -> our genre list, most specific first
const GENRES = [
  ["Horror", "Horror"],
  ["Role-playing (RPG)", "RPG"],
  ["Shooter", "Shooter"],
  ["Fighting", "Fighting"],
  ["Racing", "Racing"],
  ["Sport", "Sports"],
  ["Platform", "Platformer"],
  ["Puzzle", "Puzzle"],
  ["Visual Novel", "Visual Novel"],
  ["Strategy", "Strategy"],
  ["Real Time Strategy (RTS)", "Strategy"],
  ["Turn-based strategy (TBS)", "Strategy"],
  ["Tactical", "Strategy"],
  ["Simulator", "Simulation"],
  ["Quiz/Trivia", "Party"],
  ["Hack and slash/Beat 'em up", "Action"],
];

export function mapGenre(info) {
  const all = [...info.genres, ...info.themes];
  for (const [igdb, ours] of GENRES) if (all.includes(igdb)) return ours;
  if (all.includes("Adventure") && all.includes("Action")) return "Action-Adventure";
  if (all.includes("Adventure")) return "Adventure";
  if (all.includes("Action")) return "Action";
  return "";
}

const FIELDS = [
  "name",
  "url",
  "summary",
  "first_release_date",
  "genres.name",
  "themes.name",
  "platforms.name",
  "involved_companies.developer",
  "involved_companies.publisher",
  "involved_companies.company.name",
  "aggregated_rating",
  "cover.image_id",
  "screenshots.image_id",
  "version_parent",
  "game_type",
].join(",");

// DLC, expansions, mods, episodes, seasons, packs and updates
const ADD_ONS = new Set([1, 2, 5, 6, 7, 13, 14]);

function companies(row, role) {
  const names = (row.involved_companies || []).filter((c) => c[role] && c.company?.name).map((c) => c.company.name);
  return [...new Set(names)].slice(0, 2).join(", ");
}

function toInfo(row, title, platform) {
  const platforms = (row.platforms || []).map((p) => p.name);
  const wanted = PLATFORMS[platform] || [];
  return {
    igdbId: row.id,
    name: row.name || "",
    igdbUrl: row.url || "",
    summary: (row.summary || "").trim(),
    year: row.first_release_date ? new Date(row.first_release_date * 1000).getUTCFullYear() : "",
    developer: companies(row, "developer"),
    publisher: companies(row, "publisher"),
    genres: (row.genres || []).map((g) => g.name),
    themes: (row.themes || []).map((t) => t.name),
    platforms,
    criticScore: row.aggregated_rating ? Math.round(row.aggregated_rating) : "",
    cover: igdbImage(row.cover?.image_id),
    screenshots: (row.screenshots || []).slice(0, 6).map((s) => s.image_id),
    isVersion: !!row.version_parent,
    isAddOn: ADD_ONS.has(row.game_type),
    isPort: row.game_type === 11,
    samePlatform: wanted.some((p) => platforms.includes(p)),
    quality: matchQuality(title, row.name || ""),
  };
}

// A version made for your platform beats the same name on another one. Ports
// rank under the main entry, so "Resident Evil 2" on PS4 is the 2019 remake
// and not the port of the 1998 game.
const score = (c) =>
  (RANK[c.quality] ?? 9) +
  (c.samePlatform ? 0 : 3) +
  (c.isVersion ? 0.5 : 0) +
  (c.isPort ? 0.75 : 0) +
  (c.isAddOn ? 2 : 0);

/** IGDB games for a title, best match first. */
export async function searchIgdb(title, { platform = "" } = {}) {
  const q = String(title).replace(/["\\]/g, " ").trim();
  if (!q) return [];
  // IGDB's search puts a lot of DLC and bundles first, so ask for plenty
  const rows = await query("games", `search "${q}"; fields ${FIELDS}; limit 50;`);
  return rows
    .map((row, i) => ({ c: toInfo(row, title, platform), i }))
    .sort((a, b) => score(a.c) - score(b.c) || a.i - b.i)
    .map(({ c }) => c);
}

/** A confident match for automatic filling, or null. */
export async function bestIgdbMatch(game) {
  const list = await searchIgdb(game.title, game);
  const best = list[0];
  if (!best || !best.quality) return null;
  // DLC only counts when the name is exactly what's in the library
  if (best.isAddOn && best.quality !== "exact") return null;
  // a longer name ("X Remastered", "X: Subtitle") is only trusted on the right platform
  if ((best.quality === "longer" || best.quality === "subtitle") && !best.samePlatform) return null;
  return best;
}

/** Average hours to finish the main game, keyed by IGDB id. */
export async function timesToBeat(ids) {
  const out = new Map();
  const unique = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const rows = await query(
      "game_time_to_beats",
      `fields game_id,normally,hastily; where game_id = (${chunk.join(",")}); limit 100;`
    );
    for (const r of rows) {
      const secs = r.normally || r.hastily;
      if (secs) out.set(r.game_id, Math.round((secs / 3600) * 2) / 2);
    }
  }
  return out;
}

/**
 * The changes IGDB info makes to a game. IGDB fields are always updated, the
 * rest only fill in what's blank so nothing typed in by hand gets replaced.
 */
export function igdbPatch(game, info, hours) {
  const patch = {
    igdbId: info.igdbId,
    igdbUrl: info.igdbUrl,
    criticScore: info.criticScore,
    screenshots: info.screenshots,
  };
  const blank = (v) => v === "" || v === null || v === undefined;
  if (blank(game.summary) && info.summary) patch.summary = info.summary;
  if (blank(game.developer) && info.developer) patch.developer = info.developer;
  if (blank(game.publisher) && info.publisher) patch.publisher = info.publisher;
  if (blank(game.releaseYear) && info.year) patch.releaseYear = info.year;
  if (blank(game.genre) && mapGenre(info)) patch.genre = mapGenre(info);
  if (blank(game.hoursEstimated) && hours) patch.hoursEstimated = hours;
  return patch;
}

/** Match and fill many games, a few requests at a time. onProgress(done, total) */
export async function fillFromIgdb(games, onProgress) {
  const unique = [...new Map(games.map((g) => [`${g.title}|${g.platform}`, g])).values()];
  const matches = new Map();
  let done = 0;
  let next = 0;
  const worker = async () => {
    while (next < unique.length) {
      const g = unique[next++];
      try {
        matches.set(`${g.title}|${g.platform}`, await bestIgdbMatch(g));
      } catch {
        matches.set(`${g.title}|${g.platform}`, null);
      }
      done += 1;
      onProgress?.(done, unique.length);
      await sleep(550); // two workers stay under IGDB's 4 requests a second
    }
  };
  await Promise.all([worker(), worker()]);
  const hours = await timesToBeat([...matches.values()].map((m) => m?.igdbId));
  return games
    .map((g) => {
      const info = matches.get(`${g.title}|${g.platform}`);
      return info ? { id: g.id, patch: igdbPatch(g, info, hours.get(info.igdbId)) } : null;
    })
    .filter(Boolean);
}
