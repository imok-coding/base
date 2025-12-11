const PROXY = "https://imokmalworker.imokissick.workers.dev/?url=";
const DEFAULT_USER = "im_ok";
const PAGE_SIZE = 300;
const STATUS_MAP = {
  1: "watching",
  2: "completed",
  3: "on_hold",
  4: "dropped",
  6: "plan_to_watch",
};

function normalizeItem(raw) {
  const status =
    STATUS_MAP[raw.status] ||
    (typeof raw.status === "string" ? raw.status.toLowerCase() : "unknown");
  return {
    id: raw.anime_id || raw.id,
    title: raw.anime_title || raw.title || "Untitled",
    episodes: raw.anime_num_episodes ?? raw.episodes ?? null,
    status,
    score: raw.score ?? null,
    image:
      raw.anime_image_path ||
      raw.image_url ||
      raw.anime_img ||
      raw.picture ||
      null,
  };
}

function fallbackList() {
  return [
    { id: 1, title: "Cowboy Bebop", episodes: 26, status: "completed", score: 10 },
    { id: 2, title: "Fullmetal Alchemist: Brotherhood", episodes: 64, status: "completed", score: 10 },
    { id: 3, title: "Frieren: Beyond Journey's End", episodes: 28, status: "watching", score: 9 },
    { id: 4, title: "One Piece", episodes: 1000, status: "on_hold", score: 8 },
    { id: 5, title: "Kaiju No. 8", episodes: 12, status: "plan_to_watch", score: null },
  ];
}

async function fetchPage(username, offset) {
  const target = `https://myanimelist.net/animelist/${username}/load.json?status=7&offset=${offset}`;
  const res = await fetch(`${PROXY}${encodeURIComponent(target)}`);
  if (!res.ok) throw new Error(`Failed to fetch MAL list (offset ${offset})`);
  return res.json();
}

export async function fetchAnimeList(username = DEFAULT_USER) {
  const rows = [];

  try {
    let offset = 0;
    // The MAL endpoint returns up to 300 rows at a time.
    while (true) {
      const chunk = await fetchPage(username, offset);
      if (!Array.isArray(chunk) || chunk.length === 0) break;
      rows.push(...chunk);
      if (chunk.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  } catch (err) {
    console.error("Failed to load MAL list; falling back to sample data.", err);
    return fallbackList();
  }

  if (!rows.length) {
    return fallbackList();
  }

  return rows.map(normalizeItem);
}
