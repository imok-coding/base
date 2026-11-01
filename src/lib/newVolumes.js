// Looks up English volume release dates on Wikipedia. Most manga have a
// "List of ... chapters" page with a {{Graphic novel list}} entry per volume,
// including the English release date and ISBN once a publisher announces it.
import { normTitle } from "./titles";
import { toISODate } from "./format";

const API = "https://en.wikipedia.org/w/api.php";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(params, attempt = 0) {
  const url = `${API}?${new URLSearchParams({ format: "json", formatversion: "2", origin: "*", ...params })}`;
  const res = await fetch(url);
  if (res.status === 429 && attempt < 4) {
    await sleep(2000 * (attempt + 1));
    return api(params, attempt + 1);
  }
  if (!res.ok) throw new Error(`Wikipedia ${res.status}`);
  return res.json();
}

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];
const pad = (n) => String(n).padStart(2, "0");
const month = (name) => MONTHS.indexOf(String(name).toLowerCase()) + 1;

// "{{Start date|2026|10|21}}", "October 21, 2026", "21 October 2026", "2026-10-21"
// or just "October 2026" (approx). Returns { date, approx } or null.
export function wikiDate(raw) {
  let s = String(raw || "")
    .replace(/<ref[^>]*\/>/gi, "")
    .replace(/<ref[\s\S]*?<\/ref>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  const tpl = s.match(/\{\{\s*(?:start date|dts|date)\s*\|\s*(\d{4})\s*\|\s*(\d{1,2})(?:\s*\|\s*(\d{1,2}))?/i);
  if (tpl) return { date: `${tpl[1]}-${pad(tpl[2])}-${pad(tpl[3] || 1)}`, approx: !tpl[3] };
  s = s.replace(/\{\{[^{}]*\}\}/g, " ").replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, "$1");
  let m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return { date: `${m[1]}-${m[2]}-${m[3]}`, approx: false };
  m = s.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (m && month(m[1])) return { date: `${m[3]}-${pad(month(m[1]))}-${pad(m[2])}`, approx: false };
  m = s.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (m && month(m[2])) return { date: `${m[3]}-${pad(month(m[2]))}-${pad(m[1])}`, approx: false };
  m = s.match(/([A-Za-z]+)\s+(\d{4})/);
  if (m && month(m[1])) return { date: `${m[2]}-${pad(month(m[1]))}-01`, approx: true };
  return null;
}

// what a heading says about the volumes under it
const headingFormat = (h) => (/novel/i.test(h) ? "novel" : /manga|comic/i.test(h) ? "manga" : "");
const headingTitle = (h) => (h.match(/''+([^']+?)''+/) || [])[1] || "";

/**
 * English volumes on a Wikipedia page for one series: [{ vol, date, approx, isbn }]
 * Pages often list the light novels, the manga and spin-offs together, so
 * entries are kept by the section they sit in.
 */
export function parseVolumes(wikitext, { series = "", format = "manga" } = {}) {
  const text = String(wikitext || "");
  const entries = [];
  const stack = [];
  const marks = /^(=+)\s*(.*?)\s*\1\s*$|\{\{\s*Graphic novel list(?=\s*[|\n}])/gim;
  let m;
  let last = null;
  while ((m = marks.exec(text))) {
    if (last) last.body = text.slice(last.start, m.index);
    if (m[1]) {
      while (stack.length && stack.at(-1).level >= m[1].length) stack.pop();
      stack.push({ level: m[1].length, text: m[2] });
      last = null;
    } else {
      last = { start: m.index + m[0].length, headings: [...stack] };
      entries.push(last);
    }
  }
  if (last) last.body = text.slice(last.start);

  const parsed = [];
  for (const e of entries) {
    const fields = {};
    for (const f of (e.body || "").matchAll(/^\s*\|\s*([A-Za-z]+)\s*=\s*(.*)$/gm)) fields[f[1].toLowerCase()] = f[2];
    const vol = parseInt(fields.volumenumber, 10);
    const when = wikiDate(fields.licensedreldate);
    if (!vol || !when) continue;
    const isbn = (fields.licensedisbn || "").replace(/<ref[\s\S]*$/i, "").replace(/[^0-9Xx]/g, "");
    const deepest = [...e.headings].reverse();
    parsed.push({
      vol,
      ...when,
      isbn: isbn.length === 10 || isbn.length === 13 ? isbn : "",
      format: deepest.map((h) => headingFormat(h.text)).find(Boolean) || "",
      title: normTitle(deepest.map((h) => headingTitle(h.text)).find(Boolean) || ""),
    });
  }

  // several series on one page: keep the one that matches by name
  const titles = new Set(parsed.map((p) => p.title).filter(Boolean));
  let keepTitle = "";
  if (titles.size > 1) {
    const want = normTitle(series);
    keepTitle = titles.has(want) ? want : "";
  }
  return parsed
    .filter((p) => !keepTitle || !p.title || p.title === keepTitle)
    .filter((p) => titles.size <= 1 || keepTitle || !p.title)
    .filter((p) => !p.format || p.format === format)
    .map(({ vol, date, approx, isbn }) => ({ vol, date, approx, isbn }));
}

// "List of Chainsaw Man chapters" -> "Chainsaw Man"
const coreTitle = (t) =>
  t
    .replace(/^Lists? of /i, "")
    .replace(/ (?:manga |light novel )?(?:chapters|volumes|light novels)(?: \(.*\))?$/i, "")
    .replace(/ \((?:manga|light novel|novel series|comics?)\)$/i, "");

const LIST_KINDS = ["chapters", "volumes", "manga volumes", "light novels"];

async function existingPages(titles) {
  const out = new Map();
  for (let i = 0; i < titles.length; i += 45) {
    const chunk = titles.slice(i, i + 45);
    const data = await api({ action: "query", titles: chunk.join("|"), redirects: "1" });
    const q = data.query || {};
    const exists = new Set((q.pages || []).filter((p) => !p.missing && !p.invalid).map((p) => p.title));
    for (const t of chunk) {
      const n = (q.normalized || []).find((x) => x.from === t)?.to || t;
      const page = (q.redirects || []).find((x) => x.from === n)?.to || n;
      if (exists.has(page)) out.set(t, page);
    }
    await sleep(150);
  }
  return out;
}

async function listPageFor(names) {
  const tries = names.flatMap((name) => LIST_KINDS.map((kind) => ({ name, title: `List of ${name} ${kind}` })));
  tries.push(...names.map((name) => ({ name, title: `Lists of ${name} chapters` })));
  const exists = await existingPages(tries.map((t) => t.title));
  const found = new Map();
  for (const t of tries) if (!found.has(t.name) && exists.has(t.title)) found.set(t.name, exists.get(t.title));
  return found;
}

/** Wikipedia page for each series name, or none. */
export async function findPages(names) {
  const found = await listPageFor(names);
  // no list page: search for an article with the same name, or the same name
  // plus a subtitle ("Demon Slayer" is "Demon Slayer: Kimetsu no Yaiba")
  const aliases = new Map();
  for (const name of names.filter((n) => !found.has(n))) {
    const data = await api({ action: "query", list: "search", srsearch: `${name} manga`, srlimit: "8" });
    const want = normTitle(name);
    for (const r of data.query?.search || []) {
      const core = coreTitle(r.title);
      if (/\(/.test(core)) continue; // films, TV series and so on
      const n = normTitle(core);
      if (n === want || (core.includes(":") && n.startsWith(`${want} `) && normTitle(core.split(":")[0]) === want)) {
        found.set(name, r.title);
        if (n !== want) aliases.set(name, core);
        break;
      }
    }
    await sleep(150);
  }
  // an article under a longer name may still have a separate list page
  if (aliases.size) {
    const lists = await listPageFor([...aliases.values()]);
    for (const [name, core] of aliases) if (lists.has(core)) found.set(name, lists.get(core));
  }
  return found;
}

async function wikitextOf(page) {
  const data = await api({ action: "parse", page, prop: "wikitext", redirects: "1" });
  return data.parse?.wikitext || "";
}

// "Lists of One Piece chapters" just links to the real lists
async function subLists(page) {
  const data = await api({ action: "query", prop: "links", titles: page, pllimit: "max", plnamespace: "0" });
  const core = normTitle(coreTitle(page));
  return (data.query?.pages?.[0]?.links || [])
    .map((l) => l.title)
    .filter((t) => /^List of /.test(t) && / chapters \(|volumes/.test(t) && normTitle(coreTitle(t)) === core);
}

/**
 * Check series for volumes newer than the ones tracked.
 * series: [{ key, name, maxVol, format }]. Returns { results, unmatched }:
 * new volumes that come out from 30 days ago onward (soonest first), and the
 * names of series Wikipedia doesn't have.
 */
export async function checkNewVolumes(series, onProgress) {
  const names = [...new Set(series.map((s) => s.name))];
  const pages = await findPages(names);
  const now = new Date();
  const since = toISODate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30));
  const thisMonth = toISODate(new Date(now.getFullYear(), now.getMonth(), 1));
  const texts = new Map();
  const results = [];
  let done = 0;
  for (const s of series) {
    const page = pages.get(s.name);
    if (page) {
      try {
        if (!texts.has(page)) {
          const parts = /^Lists of /.test(page) ? await subLists(page) : [page];
          const all = [];
          for (const p of parts) {
            all.push(await wikitextOf(p));
            await sleep(150);
          }
          texts.set(page, all);
        }
        const vols = texts.get(page).flatMap((t) => parseVolumes(t, { series: s.name, format: s.format }));
        const seen = new Set();
        for (const v of vols) {
          if (v.vol <= s.maxVol || seen.has(v.vol)) continue;
          if (v.approx ? v.date < thisMonth : v.date < since) continue;
          seen.add(v.vol);
          results.push({
            id: `${s.key}#${v.vol}`,
            seriesKey: s.key,
            series: s.name,
            vol: v.vol,
            date: v.date,
            approx: v.approx,
            isbn: v.isbn,
            page,
          });
        }
      } catch (err) {
        console.warn("Volume check failed for", s.name, err);
      }
    }
    done += 1;
    onProgress?.(done, series.length);
  }
  results.sort((a, b) => a.date.localeCompare(b.date) || a.series.localeCompare(b.series) || a.vol - b.vol);
  return { results, unmatched: names.filter((n) => !pages.has(n)) };
}

/** What's needed to check a series: its name for Wikipedia, highest volume tracked and format. */
export function seriesToCheck(seriesInfo, volumes) {
  const format = new Map();
  for (const v of volumes) {
    if (/\((?:light )?novel\)/i.test(v.title)) format.set(v.seriesKey, "novel");
  }
  return [...seriesInfo.values()].map((info) => ({
    key: info.key,
    name: String(info.display || "").replace(/\s*\([^)]*\)\s*$/, ""),
    maxVol: info.maxVol || 0,
    format: format.get(info.key) || "manga",
  }));
}
