// Discord webhooks. Admins can override these in Dashboard → Settings
// (stored in Firestore at settings/webhooks).
//
// NOTE: anything in this file ships to every visitor's browser, so these URLs
// are effectively public. Rotate them in Discord and move posting into a
// Cloud Function if spam ever becomes a problem.
import { store, DEMO } from "./store";

export const DEFAULT_WEBHOOKS = DEMO
  ? { yearly: "", release: "", activity: "", signup: "" }
  : {
      yearly:
        "https://discord.com/api/webhooks/1448287168845054004/cGWGPoH5LaTFlBZ1vxtgMjOfV9au6qyQ_9ZRnOWN9-AX0MNfwxKNWVcZYQHz0ESA7_4k",
      release:
        "https://discord.com/api/webhooks/1448288240871276616/101WI-B2p8tDR34Hl9fZxxb0QG01f1Eo5w1IvbttlQmP2wWFNJ0OI7UnJfJujKRNWW2Q",
      activity:
        "https://discord.com/api/webhooks/1448329790942613667/wsC8psNZ-Ax2D1O9Gl4sJi6ay7df2cr7IrIdxMPwGZTBnkSUIY2NDpeVd98qW_4plz82",
      signup:
        "https://discord.com/api/webhooks/1451655828078723156/EA8QhLeiTT-7jOVQ6jFpV2he2zxVpAddAhlu8CiC6RtGFu9wTAOLdRjKeYHIV1OhVbmm",
    };

let cached = null;

export async function loadWebhooks({ refresh = false } = {}) {
  if (cached && !refresh) return cached;
  try {
    const data = (await store.getDocument("settings", "webhooks")) || {};
    cached = {
      yearly: data.yearly || DEFAULT_WEBHOOKS.yearly,
      release: data.release || DEFAULT_WEBHOOKS.release,
      activity: data.activity || DEFAULT_WEBHOOKS.activity,
    };
  } catch {
    cached = { ...DEFAULT_WEBHOOKS };
  }
  return cached;
}

export async function saveWebhooks(next) {
  const payload = {
    yearly: next.yearly || DEFAULT_WEBHOOKS.yearly,
    release: next.release || DEFAULT_WEBHOOKS.release,
    activity: next.activity || DEFAULT_WEBHOOKS.activity,
  };
  await store.setDocument("settings", "webhooks", payload);
  cached = payload;
  return payload;
}

export async function postWebhook(url, content) {
  if (!url || !content) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  } catch (err) {
    console.warn("Webhook post failed", err);
  }
}
