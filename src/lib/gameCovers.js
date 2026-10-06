// Box art lookups:
// - PlayStation Store: the old store search API still allows any origin
// - Wikipedia (origin=*). Most game articles lead with the cover, which is a
//   non-free image, so pilicense=any is needed.
// - IGDB as a last try, when its proxy is set up (see igdb.js)
import { bestIgdbMatch, igdbReady } from "./igdb";
import { matchQuality, RANK } from "./titles";

const API = "https://en.wikipedia.org/w/api.php";
const PS_API = "https://store.playstation.com/store/api/chihiro/00_09_000/tumbler/US/en/999/";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Wikipedia

async function api(params, attempt = 0) {
  const url = `${API}?${new URLSearchParams({ format: "json", origin: "*", ...params })}`;
  const res = await fetch(url);
  if (res.status === 429 && attempt < 4) {
    await sleep(1500 * (attempt + 1));
    return api(params, attempt + 1);
  }
  if (!res.ok) throw new Error(`Wikipedia ${res.status}`);
  return res.json();
}

/** Candidate articles with images, best first. */
export async function searchGameCovers(title, limit = 8) {
  const data = await api({
    action: "query",
    generator: "search",
    gsrsearch: `${title} video game`,
    gsrlimit: String(limit),
    gsrnamespace: "0",
    prop: "pageimages|pageprops|description",
    piprop: "thumbnail",
    pithumbsize: "500",
    pilicense: "any",
    ppprop: "disambiguation",
  });
  return Object.values(data?.query?.pages || {})
    .filter((p) => p.thumbnail && !("disambiguation" in (p.pageprops || {})))
    .sort((a, b) => (a.index ?? 99) - (b.index ?? 99))
    .sort((a, b) => /game/i.test(b.description || "") - /game/i.test(a.description || "")) // games first
    .map((p) => ({
      source: "wikipedia",
      article: p.title,
      description: p.description || "",
      image: p.thumbnail.source,
      isGame: /game/i.test(p.description || ""),
      quality: matchQuality(title, p.title),
    }));
}

// PlayStation Store

const PS_PLATFORM = {
  "PlayStation 5": "PS5",
  "PlayStation 4": "PS4",
  "PlayStation 3": "PS3",
  "PS Vita": "PS Vita",
  PSP: "PSP",
};

const psName = (s) =>
  String(s || "")
    .replace(/[\u2122\u00ae\u00a9\u2120]/g, "")
    .replace(/\s+/g, " ")
    .trim();

// the image service in front of the store CDN can resize (?w=)
const psImage = (url) =>
  url
    .replace("https://vulcan.dl.playstation.net/", "https://image.api.playstation.com/vulcan/")
    .replace(/^https:\/\/apollo2?\.dl\.playstation\.net\//, "https://image.api.playstation.com/");

// the search chokes on apostrophes and some hyphens, so try a couple of spellings
function psQueries(title) {
  const base = psName(title)
    .replace(/['\u2019`]/g, "")
    .replace(/[:;,!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return [...new Set([base, base.replace(/-/g, " ").replace(/\s+/g, " ")])];
}

async function psSearch(q, attempt = 0) {
  const res = await fetch(`${PS_API}${encodeURIComponent(q)}?suggested_size=12&mode=game`);
  if (res.status === 429 && attempt < 3) {
    await sleep(1500 * (attempt + 1));
    return psSearch(q, attempt + 1);
  }
  if (!res.ok) throw new Error(`PlayStation Store ${res.status}`);
  const data = await res.json();
  return (data.links || []).filter((l) => /^(downloadable|disc_based)_game$/.test(l.top_category));
}

/**
 * Store listings with box art for a title, best match first. PS4/PS5 listings
 * have 1024px square art (hires). PS3/PSP ones only have small icons with the
 * old "GAME" banner, so those are only offered in the picker.
 */
export async function searchPlayStationCovers(title, { platform = "", edition = "" } = {}) {
  let links = [];
  for (const q of psQueries(title)) {
    links = await psSearch(q);
    if (links.length) break;
  }
  const want = PS_PLATFORM[platform];
  const full = edition ? `${title} ${edition}` : "";
  const seen = new Set();
  const out = [];
  for (const l of links) {
    const img = l.images?.find((i) => i.type === 10) || l.images?.find((i) => i.type === 1);
    if (!img) continue;
    const image = psImage(img.url);
    if (seen.has(image)) continue;
    seen.add(image);
    const name = psName(l.name);
    const platforms = (l.playable_platform || []).map(psName);
    out.push({
      source: "playstation",
      article: name,
      description: platforms.join(" / "),
      image,
      hires: img.type === 10,
      samePlatform: !!want && platforms.includes(want),
      sameEdition: !!full && matchQuality(full, name) === "exact",
      quality: matchQuality(title, name),
    });
  }
  const score = (c) =>
    (c.sameEdition ? 0 : 10) + (RANK[c.quality] ?? 5) * 2 + (c.samePlatform ? 0 : 1) + (c.hires ? 0 : 20);
  return out.map((c, i) => ({ c, i })).sort((a, b) => score(a.c) - score(b.c) || a.i - b.i).map(({ c }) => c);
}

// Automatic matching

export const coverKey = (g) => `${g.title}|${g.platform || ""}`;
const isPlayStation = (p = "") => /playstation|ps vita|psp/i.test(p);

async function wikiCover(title) {
  const candidates = (await searchGameCovers(title, 6)).filter((c) => c.isGame && RANK[c.quality] <= 1);
  candidates.sort((a, b) => RANK[a.quality] - RANK[b.quality]);
  return candidates[0]?.image || "";
}

async function igdbCover(game) {
  return (await bestIgdbMatch(game))?.cover || "";
}

async function psCover(game) {
  const best = (await searchPlayStationCovers(game.title, game)).find((c) => c.hires && RANK[c.quality] <= 2);
  return best?.image || "";
}

/**
 * Confident automatic match, or "" (better no cover than the wrong one).
 * PlayStation games try the store first, then Wikipedia. Other platforms skip
 * the store, since a listing with the same name is often a different game.
 * IGDB goes last when it's set up.
 */
export async function findGameCover(game) {
  const g = typeof game === "string" ? { title: game } : game;
  const order = isPlayStation(g.platform) ? [() => psCover(g), () => wikiCover(g.title)] : [() => wikiCover(g.title)];
  if (igdbReady) order.push(() => igdbCover(g));
  for (const source of order) {
    try {
      const found = await source();
      if (found) return found;
    } catch {
      /* try the next source */
    }
  }
  return "";
}

/** Run findGameCover over many games, two at a time. Returns a Map keyed by coverKey(). */
export async function findCoversFor(games, onProgress) {
  const unique = [...new Map(games.map((g) => [coverKey(g), g])).values()];
  const found = new Map();
  let done = 0;
  let next = 0;
  const worker = async () => {
    while (next < unique.length) {
      const g = unique[next++];
      found.set(coverKey(g), await findGameCover(g));
      done += 1;
      onProgress?.(done, unique.length);
      await sleep(120);
    }
  };
  await Promise.all([worker(), worker()]);
  return found;
}
