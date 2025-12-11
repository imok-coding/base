// Lightweight JustTCG client with graceful fallback when an API key is missing.
// Exposes a single search function that can be swapped for a real endpoint once
// you have your JustTCG credentials. Expected response shape is normalized here.

const FALLBACK_RESULTS = [
  {
    id: "sample-pkm-1",
    game: "pokemon",
    name: "Pikachu",
    setName: "Base Set",
    number: "58/102",
    rarity: "Common",
    marketPrice: 1.25,
  },
  {
    id: "sample-op-1",
    game: "onepiece",
    name: "Monkey D. Luffy",
    setName: "Romance Dawn",
    number: "OP01-001",
    rarity: "Leader",
    marketPrice: 9.5,
  },
];

function normalizeResults(raw = []) {
  return raw.map((r, idx) => ({
    id: r.id || r.sku || `justtcg-${idx}`,
    game: r.game || r.product_type || "",
    name: r.name || r.product_name || "Unknown",
    setName: r.set || r.setName || r.series || "",
    number: r.number || r.cardNumber || "",
    rarity: r.rarity || "",
    marketPrice:
      r.marketPrice ??
      r.market_price ??
      r.low_price ??
      r.price ??
      r.avg ??
      null,
    image:
      r.image ||
      r.imageUrl ||
      r.image_url ||
      r.images?.large ||
      r.images?.small ||
      null,
  }));
}

export async function searchJustTcg(query, game, apiKey) {
  if (!query || !query.trim()) return [];
  // If no key provided, return a tiny fallback so UI still works
  if (!apiKey) {
    return FALLBACK_RESULTS.filter(
      (r) =>
        (!game || game === "all" || r.game === game) &&
        r.name.toLowerCase().includes(query.toLowerCase())
    );
  }

  // Example endpoint; adjust if your JustTCG account uses a different base.
  const endpoint = new URL("https://api.justtcg.com/v1/products/search");
  endpoint.searchParams.set("q", query);
  if (game && game !== "all") endpoint.searchParams.set("game", game);
  endpoint.searchParams.set("limit", "20");

  try {
    const res = await fetch(endpoint.toString(), {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      console.warn("JustTCG search failed, falling back to sample data", res.status);
      return FALLBACK_RESULTS;
    }

    const data = await res.json();
    const results = Array.isArray(data?.results) ? data.results : data;
    return normalizeResults(results || []);
  } catch (err) {
    console.warn("JustTCG fetch error, returning fallback data", err);
    return FALLBACK_RESULTS;
  }
}
