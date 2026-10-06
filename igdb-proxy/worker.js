// Small Cloudflare Worker that lets the site read from IGDB.
// IGDB doesn't allow requests from browsers, and the Twitch client secret
// can't live in the site's code, so the site talks to this instead.
//
// Secrets (set with `npx wrangler secret put NAME`):
//   TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET
// Vars (wrangler.toml):
//   ALLOWED_ORIGINS  comma separated list of sites that may use the proxy

const IGDB = "https://api.igdb.com/v4/";
const TOKEN_URL = "https://id.twitch.tv/oauth2/token";

// read-only endpoints the site needs, nothing else gets through
const ENDPOINTS = new Set(["games", "game_time_to_beats", "covers", "screenshots", "platforms", "genres"]);

// one token per worker instance, refreshed when it runs out or gets rejected
let token = null;

async function getToken(env, fresh = false) {
  if (!fresh && token && token.expires > Date.now() + 60_000) return token.value;
  const params = new URLSearchParams({
    client_id: env.TWITCH_CLIENT_ID,
    client_secret: env.TWITCH_CLIENT_SECRET,
    grant_type: "client_credentials",
  });
  const res = await fetch(`${TOKEN_URL}?${params}`, { method: "POST" });
  if (!res.ok) throw new Error(`Twitch token request failed (${res.status})`);
  const data = await res.json();
  token = { value: data.access_token, expires: Date.now() + data.expires_in * 1000 };
  return token.value;
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

const reply = (status, body, headers = {}) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

async function askIgdb(endpoint, query, env) {
  for (const fresh of [false, true]) {
    const res = await fetch(IGDB + endpoint, {
      method: "POST",
      headers: {
        "Client-ID": env.TWITCH_CLIENT_ID,
        Authorization: `Bearer ${await getToken(env, fresh)}`,
        Accept: "application/json",
      },
      body: query,
    });
    if (res.status !== 401) return res;
  }
  return reply(502, { error: "IGDB rejected the Twitch credentials" });
}

export default {
  async fetch(request, env) {
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim());
    const origin = request.headers.get("Origin") || "";
    if (!allowed.includes(origin)) return reply(403, { error: "Origin not allowed" });
    const cors = corsHeaders(origin);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return reply(405, { error: "Use POST" }, cors);

    // /v4/games -> games
    const endpoint = new URL(request.url).pathname.replace(/^\/(v4\/)?/, "").replace(/\/$/, "");
    if (!ENDPOINTS.has(endpoint)) return reply(404, { error: "Unknown endpoint" }, cors);

    const query = await request.text();
    if (!query.trim() || query.length > 4000) return reply(400, { error: "Bad query" }, cors);

    try {
      const res = await askIgdb(endpoint, query, env);
      return new Response(res.body, {
        status: res.status,
        headers: { "Content-Type": "application/json", ...cors },
      });
    } catch (err) {
      return reply(502, { error: err.message }, cors);
    }
  },
};
