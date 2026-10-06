// Title matching shared by the cover and IGDB lookups.

// words that may trail a title without changing which game it is
const EDITION_WORDS = new Set(
  "edition collection remastered remaster deluxe goty game of the year definitive complete ultimate hd bundle gold premium standard digital enhanced directors cut special anniversary royal legendary platinum hits greatest for nintendo switch ps4 ps5 pack and remake".split(
    " "
  )
);

// sequels get written both ways ("Red Dead Redemption II" / "2")
const ROMAN = { ii: "2", iii: "3", iiii: "4", iv: "4" };

export function normTitle(s) {
  return String(s || "")
    .replace(/[\u2122\u00ae\u00a9\u2120]/g, "")
    // "Marvel's" and "Marvel:" are the same game, so drop possessives
    .replace(/['\u2019`]s\b/gi, "")
    .replace(/['\u2019`]/g, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(ii|iii|iiii|iv)\b/g, (m) => ROMAN[m])
    .trim();
}

// "exact", "edition" (query = article + edition words), "longer" (article =
// query + edition words) or null
export function matchQuality(query, article) {
  const q = normTitle(query).split(" ");
  const a = normTitle(article).split(" ");
  if (q.join(" ") === a.join(" ")) return "exact";
  const extraQ = q.filter((w) => !a.includes(w));
  const extraA = a.filter((w) => !q.includes(w));
  if (!extraA.length && extraQ.length && extraQ.every((w) => EDITION_WORDS.has(w))) return "edition";
  if (!extraQ.length && extraA.length && extraA.every((w) => EDITION_WORDS.has(w))) return "longer";
  // "Resident Evil 7" vs "Resident Evil 7: Biohazard"
  const parts = String(article || "").split(/\s*(?::|\s[-\u2013\u2014]\s)\s*/);
  for (let i = 1; i < parts.length; i++)
    if (normTitle(parts.slice(0, i).join(" ")) === q.join(" ")) return "subtitle";
  return null;
}

// best first
export const RANK = { exact: 0, edition: 1, longer: 2, subtitle: 3.5 };
