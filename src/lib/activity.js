// Admin activity log: kept in this browser's localStorage and mirrored to the
// Discord activity webhook.
import { loadWebhooks, postWebhook } from "./webhooks";

export const ACTIVITY_STORAGE_KEY = "mangaLibraryActivityLog";
const MAX_ENTRIES = 100;
const subscribers = new Set();

export function readActivity() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ACTIVITY_STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e) => e && e.message)
      .map((e) => ({
        message: e.message,
        ts: e.ts ? new Date(e.ts) : new Date(),
        user: e.user || e.email || "",
        context: e.context || "",
        details: Array.isArray(e.details) ? e.details : [],
      }));
  } catch {
    return [];
  }
}

function writeActivity(entries) {
  try {
    const payload = entries.slice(0, MAX_ENTRIES).map((e) => ({
      ...e,
      ts: e.ts instanceof Date ? e.ts.toISOString() : e.ts,
    }));
    localStorage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* storage unavailable — the log is best-effort */
  }
  subscribers.forEach((fn) => fn());
}

export function clearActivity() {
  writeActivity([]);
}

export function subscribeActivity(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

function detailLines(details) {
  if (!details) return [];
  if (typeof details === "string") return [details];
  if (Array.isArray(details)) return details.map(String);
  return Object.entries(details)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`);
}

/**
 * Log an admin action.
 * @param {string} message human-readable summary
 * @param {{user?: {email?: string, displayName?: string}, context?: string, list?: string, action?: string, details?: object}} opts
 */
export async function recordActivity(message, opts = {}) {
  if (!message) return;
  const { user, context = "Manga", list = "", action = "", details = null } = opts;
  const userLabel = (user?.displayName || "").trim() || user?.email || "anonymous";
  const lines = detailLines(details);
  const entry = { message, ts: new Date(), user: userLabel, context, details: lines };
  writeActivity([entry, ...readActivity()]);

  const { activity } = await loadWebhooks();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "local time";
  const meta = [context && `Context: ${context}`, list && `List: ${list}`, action && `Action: ${action}`]
    .filter(Boolean)
    .join("   •   ");
  const body = [
    "📚 **Library Activity**",
    `📝 ${message}`,
    `👤 ${userLabel}   •   🕒 ${entry.ts.toLocaleString()} (${tz})`,
    meta,
    lines.length ? "🔍 Details:" : "",
    ...lines.map((l) => `• ${l}`),
  ]
    .filter(Boolean)
    .join("\n");
  await postWebhook(activity, body);
}
