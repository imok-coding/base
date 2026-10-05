// All manga writes. Each function batches its Firestore writes and logs to
// the activity feed. The UI updates itself through the realtime listener.
import { recordActivity } from "../../lib/activity";
import { todayISO } from "../../lib/format";
import { store } from "../../lib/store";
import { LIST_LABEL, movePayload, seriesKeyOf, toPayload } from "./model";

const s = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Make every volume of the given series match `hidden` (series hide as a unit). */
function hiddenSyncOps(seriesHidden, allVolumes, skipIds) {
  const ops = [];
  for (const v of allVolumes) {
    if (skipIds.has(v.id)) continue;
    if (!seriesHidden.has(v.seriesKey)) continue;
    const want = seriesHidden.get(v.seriesKey);
    if (!!v.hidden !== want) ops.push({ type: "update", col: v.kind, id: v.id, data: { hidden: want } });
  }
  return ops;
}

/**
 * Add or update one or more entries.
 * @param {Array<{id?: string, list: "library"|"wishlist", form: object}>} entries
 */
export async function saveEntries(entries, { allVolumes, seriesInfo, user }) {
  const ops = [];
  const seriesHidden = new Map();
  const touched = new Set();
  for (const { id, list, form } of entries) {
    const payload = toPayload(form, list, seriesInfo.get(seriesKeyOf(form.title)));
    if (!payload.title) throw new Error("Every entry needs a title.");
    seriesHidden.set(seriesKeyOf(payload.title), payload.hidden);
    if (id) {
      ops.push({ type: "update", col: list, id, data: payload });
      touched.add(id);
    } else {
      ops.push({ type: "add", col: list, data: payload });
    }
  }
  ops.push(...hiddenSyncOps(seriesHidden, allVolumes, touched));
  await store.batch(ops);

  const added = entries.filter((e) => !e.id).length;
  const list = LIST_LABEL[entries[0]?.list] || "Library";
  const message =
    added === entries.length
      ? `Added ${s(added, "item")} to ${list}`
      : added === 0
        ? entries.length === 1
          ? `Updated "${entries[0].form.title}" in ${list}`
          : `Saved ${s(entries.length, "item")} in ${list}`
        : `Saved ${s(entries.length, "item")} in ${list} (${added} new)`;
  recordActivity(message, {
    user,
    list,
    action: added ? "create" : "update",
    details: {
      titles: entries
        .map((e) => e.form.title)
        .slice(0, 10)
        .join(" | "),
    },
  });
}

/** Patch a single volume (rating, read state, etc.). */
export async function patchVolume(v, data, { user, message }) {
  await store.updateDocument(v.kind, v.id, data);
  recordActivity(message || `Updated "${v.title}"`, {
    user,
    list: LIST_LABEL[v.kind],
    action: "inline-update",
    details: { title: v.title, ...data },
  });
}

export function readPatch(v, read) {
  return read
    ? { read: true, dateRead: v.read && v.dateRead ? v.dateRead : todayISO(), rating: v.rating ?? "" }
    : { read: false, dateRead: "" }; // keep the rating — it isn't tied to read state
}

export async function setReadState(volumes, read, { user }) {
  const libraryOnly = volumes.filter((v) => v.kind === "library");
  if (!libraryOnly.length) return;
  await store.batch(libraryOnly.map((v) => ({ type: "update", col: "library", id: v.id, data: readPatch(v, read) })));
  recordActivity(
    libraryOnly.length === 1
      ? `Marked "${libraryOnly[0].title}" as ${read ? "read" : "unread"}`
      : `Marked ${s(libraryOnly.length, "book")} as ${read ? "read" : "unread"}`,
    { user, list: "Library", action: read ? "markRead" : "markUnread", details: { count: libraryOnly.length } }
  );
}

/**
 * Bulk edit: `data` is a patch object, or a function (volume) => patch for
 * per-volume changes. Hiding a volume hides its whole series.
 */
export async function patchVolumes(volumes, data, { user, allVolumes = [] }) {
  const patchFor = typeof data === "function" ? data : () => data;
  const ops = [];
  const seriesHidden = new Map();
  for (const v of volumes) {
    const patch = patchFor(v);
    if (!patch || !Object.keys(patch).length) continue;
    ops.push({ type: "update", col: v.kind, id: v.id, data: patch });
    if ("hidden" in patch) seriesHidden.set(v.seriesKey, !!patch.hidden);
  }
  if (!ops.length) return;
  ops.push(...hiddenSyncOps(seriesHidden, allVolumes, new Set(volumes.map((v) => v.id))));
  await store.batch(ops);
  const fields = [...new Set(ops.flatMap((o) => Object.keys(o.data)))];
  recordActivity(`Bulk edited ${s(volumes.length, "item")}`, {
    user,
    list: "Library/Wishlist",
    action: "bulk-edit",
    details: { count: volumes.length, fields: fields.join(", ") },
  });
}

export async function setSeriesHidden(seriesKey, hidden, { allVolumes, user }) {
  const ops = hiddenSyncOps(new Map([[seriesKey, hidden]]), allVolumes, new Set());
  if (!ops.length) return;
  await store.batch(ops);
  recordActivity(`${hidden ? "Hid" : "Unhid"} a series (${s(ops.length, "volume")})`, {
    user,
    action: hidden ? "hide" : "unhide",
    details: { series: seriesKey },
  });
}

export async function moveVolumes(volumes, to, { seriesInfo, user, purchasedToday }) {
  const moving = volumes.filter((v) => v.kind !== to);
  if (!moving.length) return;
  const ops = [];
  for (const v of moving) {
    ops.push({ type: "add", col: to, data: movePayload(v, to, seriesInfo.get(v.seriesKey), { purchasedToday }) });
    ops.push({ type: "delete", col: v.kind, id: v.id });
  }
  await store.batch(ops);
  const from = LIST_LABEL[moving[0].kind];
  recordActivity(
    moving.length === 1
      ? `Moved "${moving[0].title}" from ${from} to ${LIST_LABEL[to]}`
      : `Moved ${s(moving.length, "item")} from ${from} to ${LIST_LABEL[to]}`,
    { user, action: "move", list: from, details: { count: moving.length, from, to: LIST_LABEL[to] } }
  );
}

export async function deleteVolumes(volumes, { user }) {
  if (!volumes.length) return;
  await store.batch(volumes.map((v) => ({ type: "delete", col: v.kind, id: v.id })));
  recordActivity(
    volumes.length === 1
      ? `Deleted "${volumes[0].title}" from ${LIST_LABEL[volumes[0].kind]}`
      : `Deleted ${s(volumes.length, "item")}`,
    { user, action: volumes.length === 1 ? "delete-single" : "delete-multi", details: { count: volumes.length } }
  );
}

export async function submitSuggestion(text, user) {
  await store.addDocument("suggestions", {
    content: text.trim(),
    type: "manga",
    from: user?.displayName || user?.email || user?.uid || "anonymous user",
    createdAt: new Date().toISOString(),
  });
}
