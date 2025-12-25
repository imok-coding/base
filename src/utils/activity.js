// Shared activity logging + webhook helper
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";

export const ACTIVITY_STORAGE_KEY = "mangaLibraryActivityLog";
export const DEFAULT_ACTIVITY_WEBHOOK =
  "https://discord.com/api/webhooks/1448329790942613667/wsC8psNZ-Ax2D1O9Gl4sJi6ay7df2cr7IrIdxMPwGZTBnkSUIY2NDpeVd98qW_4plz82";

let cachedActivityWebhook = null;

function normalizeEntries(rawEntries) {
  if (!Array.isArray(rawEntries)) return [];
  return rawEntries
    .map((e) => ({
      message: e.message,
      ts: e.ts ? new Date(e.ts) : new Date(),
      user: e.user || e.email || "",
      context: e.context || "",
      details: Array.isArray(e.details) ? e.details : [],
    }))
    .filter((e) => e.message);
}

function readStoredEntries() {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ACTIVITY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return normalizeEntries(parsed);
  } catch (err) {
    console.warn("Failed to read activity log", err);
    return [];
  }
}

export function persistActivityEntries(entries) {
  try {
    const payload = (entries || []).slice(0, 100).map((entry) => ({
      message: entry.message,
      ts: entry.ts instanceof Date ? entry.ts.toISOString() : entry.ts,
      user: entry.user || "",
      context: entry.context || "",
      details: entry.details || [],
    }));
    if (typeof window !== "undefined") {
      localStorage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify(payload));
    }
  } catch (err) {
    console.warn("Failed to persist activity log", err);
  }
}

async function getActivityWebhookUrl() {
  if (cachedActivityWebhook) return cachedActivityWebhook;
  try {
    const ref = doc(db, "settings", "webhooks");
    const snap = await getDoc(ref);
    if (snap.exists()) {
      cachedActivityWebhook = snap.data().activity || DEFAULT_ACTIVITY_WEBHOOK;
      return cachedActivityWebhook;
    }
  } catch (err) {
    console.warn("Failed to load activity webhook", err);
  }
  cachedActivityWebhook = DEFAULT_ACTIVITY_WEBHOOK;
  return cachedActivityWebhook;
}

function stringifyDetailValue(value) {
  if (value === undefined || value === null) return "—";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function buildDetailLines(details) {
  if (!details) return [];
  if (typeof details === "string") return [details];
  if (Array.isArray(details)) return details.map((d) => stringifyDetailValue(d));
  if (typeof details === "object") {
    return Object.entries(details).map(([key, val]) => `${key}: ${stringifyDetailValue(val)}`);
  }
  return [];
}

async function postActivityWebhook(message, options = {}) {
  if (!message) return;
  try {
    const { email, name, webhookOverride, context, list, action, detailLines = [] } = options;
    const webhookUrl = webhookOverride || (await getActivityWebhookUrl());
    if (!webhookUrl) return;
    const userLabel = (name || "").trim() || email || "anonymous";
    const timestamp = new Date();
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "local time";

    const lines = [];
    lines.push("📚 **Library Activity**");
    lines.push(`📝 ${message}`);
    lines.push(
      `👤 ${userLabel}   •   🕒 ${timestamp.toLocaleString()} (${tz})`
    );
    const metaBits = [];
    if (context) metaBits.push(`Context: ${context}`);
    if (list) metaBits.push(`List: ${list}`);
    if (action) metaBits.push(`Action: ${action}`);
    if (metaBits.length) lines.push(metaBits.join("   •   "));
    if (detailLines.length) {
      lines.push("🔍 Details:");
      detailLines.forEach((line) => lines.push(`• ${line}`));
    }

    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: lines.join("\n") }),
    });
  } catch (err) {
    console.warn("Activity webhook failed", err);
  }
}

export async function recordActivity(message, options = {}) {
  if (!message) return null;
  const {
    email,
    name,
    webhookOverride,
    persistLocal = true,
    context = "",
    list = "",
    action = "",
    details = null,
  } = options;

  const detailLines = buildDetailLines(details);
  const entry = {
    message,
    ts: new Date(),
    user: (name || "").trim() || email || "",
    context,
    details: detailLines,
  };
  if (persistLocal) {
    const existing = readStoredEntries();
    const next = [entry, ...existing].slice(0, 100);
    persistActivityEntries(next);
  }
  await postActivityWebhook(message, {
    email,
    name,
    webhookOverride,
    context,
    list,
    action,
    detailLines,
  });
  return entry;
}
