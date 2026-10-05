// Read the game tracker spreadsheet (.xlsx) in the browser and plan an import:
// new games are added, games already on the site (same title + platform +
// edition + format) are updated, and blank cells never erase existing info.
import { gameKey, normalizeGame } from "./model";

const COLUMNS = {
  "game title": "title",
  title: "title",
  platform: "platform",
  "edition / version": "edition",
  edition: "edition",
  format: "format",
  "collection status": "status",
  "backlog status": "backlog",
  priority: "priority",
  "star rating": "rating",
  rating: "rating",
  genre: "genre",
  "release year": "releaseYear",
  "acquired date": "acquired",
  "purchase price": "price",
  "hours played": "hoursPlayed",
  "estimated hours": "hoursEstimated",
  "completion %": "completion",
  "last played": "lastPlayed",
  "completed date": "completedDate",
  "play mode": "playMode",
  "store / source": "store",
  region: "region",
  condition: "condition",
  "revisit?": "revisit",
  notes: "notes",
  cover: "cover",
  "cover url": "cover",
  "review video": "reviewUrl",
  "review url": "reviewUrl",
  "review link": "reviewUrl",
  review: "reviewUrl",
  youtube: "reviewUrl",
};

// fields compared/updated on re-import (cover only when the sheet has one)
const FIELDS = [...new Set(Object.values(COLUMNS))];

function cellValue(field, v) {
  if (v === null || v === undefined || v === "") return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10); // cells are UTC midnight
  if (field === "revisit") return /^y/i.test(String(v)) ? true : /^n/i.test(String(v)) ? false : "";
  if (field === "completion" && typeof v === "number" && v <= 1) return Math.round(v * 100);
  if (typeof v === "string") return v.trim();
  return v;
}

// returns { sheet, rows, skipped }
export async function readGameWorkbook(file) {
  const { default: readExcelFile } = await import("read-excel-file/universal");
  const sheets = await readExcelFile(file);
  const ranked = [...sheets].sort((a, b) => (b.sheet === "Backlog") - (a.sheet === "Backlog"));
  for (const { sheet, data } of ranked) {
    const headerIdx = data.findIndex((r) => r.some((c) => /^game title$/i.test(String(c ?? "").trim())));
    if (headerIdx === -1) continue;
    const header = data[headerIdx].map(
      (h) =>
        COLUMNS[
          String(h ?? "")
            .trim()
            .toLowerCase()
        ] || null
    );
    const rows = [];
    let skipped = 0;
    for (const r of data.slice(headerIdx + 1)) {
      const row = {};
      header.forEach((field, i) => {
        if (field) row[field] = cellValue(field, r[i]);
      });
      if (!row.title) {
        if (r.some((c) => c !== null && c !== "")) skipped += 1;
        continue;
      }
      rows.push(row);
    }
    return { sheet, rows, skipped };
  }
  throw new Error('Couldn\'t find a sheet with a "Game Title" column.');
}

// Compare the spreadsheet rows with the games already in Firestore.
// returns { adds, updates: [{ game, changes }], unchanged, notInSheet }
export function planImport(rows, existing) {
  const byKey = new Map();
  for (const g of existing) {
    const k = g.importKey || gameKey(g);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(g);
  }
  const seen = new Map();
  const matched = new Set();
  const adds = [];
  const updates = [];
  let unchanged = 0;

  for (const row of rows) {
    const base = gameKey(row);
    const n = (seen.get(base) || 0) + 1; // identical rows = separate copies
    seen.set(base, n);
    const importKey = n === 1 ? base : `${base}#${n}`;
    // an exact "#n" copy key first, then any unmatched game with the base key
    const candidates = [...(byKey.get(importKey) || []), ...(byKey.get(base) || [])];
    const game = candidates.find((g) => !matched.has(g.id));
    const clean = normalizeGame(row);
    if (!game) {
      const data = { importKey };
      for (const f of FIELDS) data[f] = clean[f] ?? "";
      adds.push(data);
      continue;
    }
    matched.add(game.id);
    const changes = {};
    for (const f of FIELDS) {
      const incoming = clean[f];
      if (incoming === "" || incoming === undefined) continue; // blanks never erase
      if (String(incoming) !== String(game[f] ?? "")) changes[f] = incoming;
    }
    if (Object.keys(changes).length) updates.push({ game, changes });
    else unchanged += 1;
  }
  const notInSheet = existing.filter((g) => !matched.has(g.id));
  return { adds, updates, unchanged, notInSheet };
}
