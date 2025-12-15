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

function resolveTitle(raw) {
  const localized = raw?.title_localized;
  const localizedEn =
    typeof localized === "string" ? localized : localized?.en || localized?.english;
  return (
    raw?.anime_title_eng ||
    raw?.title_english ||
    localizedEn ||
    raw?.anime_title ||
    raw?.title ||
    "Untitled"
  );
}

function resolveUpdatedAt(raw) {
  const value = raw?.updated_at ?? raw?.updatedAt ?? raw?.updated_at_ms ?? null;
  if (value == null) return null;

  const num = Number(value);
  if (Number.isFinite(num)) {
    // MAL returns seconds; if the value looks like seconds, convert to ms.
    return num < 1e12 ? num * 1000 : num;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function normalizeItem(raw) {
  const status =
    STATUS_MAP[raw.status] ||
    (typeof raw.status === "string" ? raw.status.toLowerCase() : "unknown");
  return {
    id: raw.anime_id || raw.id,
    // Prefer English titles from MAL when available.
    title: resolveTitle(raw),
    updatedAt: resolveUpdatedAt(raw),
    episodes: raw.anime_num_episodes ?? raw.episodes ?? null,
    watchedEpisodes:
      raw.num_watched_episodes ??
      raw.my_watched_episodes ??
      raw.watched_episodes ??
      raw.num_watched ??
      0,
    status,
    score: raw.score ?? null,
    image:
      raw.anime_image_path ||
      raw.image_url ||
      raw.anime_img ||
      raw.picture ||
      null,
    synopsis: raw.anime_synopsis || raw.synopsis || null,
  };
}

function fallbackList() {
  const now = Date.now();
  return [
    {
      id: 1,
      title: "Cowboy Bebop",
      episodes: 26,
      status: "completed",
      score: 10,
      updatedAt: now - 1000 * 60 * 60 * 24 * 3,
      synopsis: "In 2071, bounty hunters Spike and Jet roam the solar system looking for their next payout and a place to belong.",
    },
    {
      id: 2,
      title: "Fullmetal Alchemist: Brotherhood",
      episodes: 64,
      status: "completed",
      score: 10,
      updatedAt: now - 1000 * 60 * 60 * 24 * 6,
      synopsis:
        "Brothers Edward and Alphonse Elric search for the Philosopher's Stone to restore their bodies after a failed alchemy ritual.",
    },
    {
      id: 3,
      title: "Frieren: Beyond Journey's End",
      episodes: 28,
      status: "watching",
      score: 9,
      updatedAt: now - 1000 * 60 * 60 * 8,
      synopsis: "An elven mage retraces the steps of a past adventure to understand humanity and the passage of time.",
    },
    {
      id: 4,
      title: "One Piece",
      episodes: 1000,
      status: "on_hold",
      score: 8,
      updatedAt: now - 1000 * 60 * 60 * 24 * 14,
      synopsis: "Monkey D. Luffy sails toward the Grand Line seeking the One Piece and a crew to make his dream real.",
    },
    {
      id: 5,
      title: "Kaiju No. 8",
      episodes: 12,
      status: "plan_to_watch",
      score: null,
      updatedAt: now - 1000 * 60 * 30,
      synopsis: "A middle-aged worker gains kaiju powers and joins the Defense Force to fight monsters from the inside.",
    },
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

export async function fetchAnimeSummary(malId) {
  if (!malId) return null;
  try {
    const res = await fetch(`https://api.jikan.moe/v4/anime/${malId}`);
    if (!res.ok) throw new Error(`Failed to fetch Jikan summary for id ${malId}`);
    const json = await res.json();
    const synopsis = json?.data?.synopsis || json?.data?.background || null;
    return synopsis;
  } catch (err) {
    console.error("Failed to load anime synopsis", malId, err);
    return null;
  }
}

export async function fetchUserStats(username = DEFAULT_USER) {
  if (!username) return null;
  try {
    const res = await fetch(`https://api.jikan.moe/v4/users/${encodeURIComponent(username)}/statistics`);
    if (!res.ok) throw new Error(`Failed to fetch user stats for ${username}`);
    const json = await res.json();
    const animeStats = json?.data?.anime || {};
    const daysWatched = Number(animeStats.days_watched);
    const episodesWatched = Number(animeStats.total_episodes ?? animeStats.episodes_watched);
    return {
      daysWatched: Number.isFinite(daysWatched) ? daysWatched : null,
      episodesWatched: Number.isFinite(episodesWatched) ? episodesWatched : null,
    };
  } catch (err) {
    console.error("Failed to load user stats", username, err);
    return null;
  }
}
