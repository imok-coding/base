// Box art from Wikipedia (no API key; CORS via origin=*). Most game articles
// lead with the cover, which is a non-free image, so pilicense=any is needed.

const API = "https://en.wikipedia.org/w/api.php";

// words that may trail a title without changing which game it is
const EDITION_WORDS = new Set(
  "edition collection remastered remaster deluxe goty game of the year definitive complete ultimate hd bundle gold premium standard digital enhanced directors cut special anniversary royal legendary platinum hits greatest for nintendo switch ps4 ps5 pack and remake".split(
    " "
  )
);

export function normTitle(s) {
  return String(s || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** "exact", "edition" (query = article + edition words) or null. */
export function matchQuality(query, article) {
  const q = normTitle(query).split(" ");
  const a = normTitle(article).split(" ");
  if (q.join(" ") === a.join(" ")) return "exact";
  const extraQ = q.filter((w) => !a.includes(w));
  const extraA = a.filter((w) => !q.includes(w));
  if (!extraA.length && extraQ.length && extraQ.every((w) => EDITION_WORDS.has(w))) return "edition";
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
      article: p.title,
      description: p.description || "",
      image: p.thumbnail.source,
      isGame: /game/i.test(p.description || ""),
      quality: matchQuality(title, p.title),
    }));
}

/** Confident automatic match, or "" (better no cover than the wrong one). */
export async function findGameCover(title) {
  const candidates = (await searchGameCovers(title, 6)).filter((c) => c.isGame && c.quality);
  candidates.sort((a, b) => (a.quality === "exact" ? 0 : 1) - (b.quality === "exact" ? 0 : 1));
  return candidates[0]?.image || "";
}

/** Run findGameCover over many titles, two at a time. */
export async function findCoversFor(titles, onProgress) {
  const unique = [...new Set(titles)];
  const found = new Map();
  let done = 0;
  let next = 0;
  const worker = async () => {
    while (next < unique.length) {
      const title = unique[next++];
      try {
        found.set(title, await findGameCover(title));
      } catch {
        found.set(title, "");
      }
      done += 1;
      onProgress?.(done, unique.length);
      await sleep(120);
    }
  };
  await Promise.all([worker(), worker()]);
  return found;
}
