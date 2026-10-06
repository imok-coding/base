// All game writes, batched, with activity logging.
import { recordActivity } from "../../lib/activity";
import { coverKey } from "../../lib/gameCovers";
import { store } from "../../lib/store";
import { toGamePayload } from "./model";

const s = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Add or update games from editor forms: [{ id?, form }] */
export async function saveGames(entries, { user }) {
  const ops = entries.map(({ id, form }) => {
    const data = toGamePayload(form);
    if (!data.title) throw new Error("Every game needs a title.");
    if (!id) return { type: "add", col: "games", data };
    // keep the original import key so the spreadsheet row stays linked after renames
    delete data.importKey;
    return { type: "update", col: "games", id, data };
  });
  await store.batch(ops);
  const added = entries.filter((e) => !e.id).length;
  recordActivity(
    entries.length === 1
      ? `${added ? "Added" : "Updated"} game "${entries[0].form.title}"`
      : `Saved ${s(entries.length, "game")}`,
    { user, context: "Games", action: added ? "create" : "update" }
  );
}

export async function patchGames(games, data, { user }) {
  if (!games.length) return;
  await store.batch(games.map((g) => ({ type: "update", col: "games", id: g.id, data })));
  recordActivity(`Bulk edited ${s(games.length, "game")}`, {
    user,
    context: "Games",
    action: "bulk-edit",
    details: { fields: Object.keys(data).join(", ") },
  });
}

export async function setGamesHidden(games, hidden, { user }) {
  if (!games.length) return;
  await store.batch(games.map((g) => ({ type: "update", col: "games", id: g.id, data: { hidden } })));
  const what = games.length === 1 ? `"${games[0].title}"` : s(games.length, "game");
  recordActivity(`${hidden ? "Hid" : "Unhid"} ${what}`, { user, context: "Games", action: hidden ? "hide" : "unhide" });
}

export async function rateGame(game, rating, { user }) {
  await store.updateDocument("games", game.id, { rating });
  recordActivity(rating ? `Rated "${game.title}" ${rating}/5` : `Cleared the rating for "${game.title}"`, {
    user,
    context: "Games",
    action: "rating",
  });
}

export async function deleteGames(games, { user }) {
  await store.batch(games.map((g) => ({ type: "delete", col: "games", id: g.id })));
  recordActivity(games.length === 1 ? `Deleted game "${games[0].title}"` : `Deleted ${s(games.length, "game")}`, {
    user,
    context: "Games",
    action: "delete",
  });
}

/** Write an import plan from planImport(). `covers` comes from findCoversFor(). */
export async function applyImport(plan, { user, covers = new Map() }) {
  const ops = [
    ...plan.adds.map((data) => ({
      type: "add",
      col: "games",
      data: { ...data, cover: data.cover || covers.get(coverKey(data)) || "" },
    })),
    ...plan.updates.map(({ game, changes }) => ({
      type: "update",
      col: "games",
      id: game.id,
      data: !game.cover && covers.get(coverKey(game)) ? { ...changes, cover: covers.get(coverKey(game)) } : changes,
    })),
  ];
  if (ops.length) await store.batch(ops);
  recordActivity(`Imported games: ${plan.adds.length} added, ${plan.updates.length} updated`, {
    user,
    context: "Games",
    action: "import",
  });
}

/** Save IGDB info from fillFromIgdb(): [{ id, patch }] */
export async function setGameInfo(pairs, { user }) {
  if (!pairs.length) return;
  await store.batch(pairs.map(({ id, patch }) => ({ type: "update", col: "games", id, data: patch })));
  recordActivity(`Filled in game info for ${s(pairs.length, "game")} from IGDB`, {
    user,
    context: "Games",
    action: "igdb",
  });
}

export async function setGameCovers(pairs, { user }) {
  if (!pairs.length) return;
  await store.batch(pairs.map(({ id, cover }) => ({ type: "update", col: "games", id, data: { cover } })));
  recordActivity(`Added cover art to ${s(pairs.length, "game")}`, { user, context: "Games", action: "covers" });
}
