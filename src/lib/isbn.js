// Look up book metadata by ISBN (Google Books, Open Library for covers).
// Only the ISBN is sent; results just pre-fill blank form fields.

export function cleanIsbn(raw) {
  return String(raw || "")
    .replace(/[^0-9Xx]/g, "")
    .toUpperCase();
}

function isbn13to10(isbn13) {
  if (isbn13.length !== 13 || !isbn13.startsWith("978")) return null;
  const core = isbn13.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += (10 - i) * Number(core[i]);
  const check = (11 - (sum % 11)) % 11;
  return core + (check === 10 ? "X" : String(check));
}

function imageExists(url, minWidth = 40) {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => resolve(false), 8000);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img.naturalWidth >= minWidth);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(false);
    };
    img.src = url;
  });
}

async function findCover(isbn) {
  const candidates = [`https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`];
  const isbn10 = isbn.length === 10 ? isbn : isbn13to10(isbn);
  if (isbn10) candidates.push(`https://images-na.ssl-images-amazon.com/images/P/${isbn10}.01.LZZZZZZZ.jpg`);
  for (const url of candidates) {
    if (await imageExists(url)) return url.replace("?default=false", "");
  }
  return "";
}

/** Only accept dates that include a day ("2020" alone would become Jan 1). */
function fullDate(value) {
  const str = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  if (!/\d{1,2},?\s+\d{4}$/.test(str)) return "";
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const getJson = (url) =>
  fetch(url)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);

// returns null or { title, authors, publisher, date, pageCount, cover }
export async function lookupIsbn(raw) {
  const isbn = cleanIsbn(raw);
  if (isbn.length !== 10 && isbn.length !== 13) throw new Error("Enter a 10 or 13 digit ISBN.");

  // Google Books has better English metadata but a shared, often-exhausted
  // keyless quota; Open Library fills whatever Google doesn't return.
  const [google, openLibrary, cover] = await Promise.all([
    getJson(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`).then(
      (j) => j?.items?.[0]?.volumeInfo || null
    ),
    getJson(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`).then(
      (j) => j?.[`ISBN:${isbn}`] || null
    ),
    findCover(isbn),
  ]);

  if (!google && !openLibrary && !cover) return null;
  return {
    title: google ? [google.title, google.subtitle].filter(Boolean).join(": ") : openLibrary?.title || "",
    authors: (google?.authors || openLibrary?.authors?.map((a) => a.name) || []).join(", "),
    publisher: google?.publisher || openLibrary?.publishers?.[0]?.name || "",
    date: fullDate(google?.publishedDate) || fullDate(openLibrary?.publish_date),
    pageCount: String(google?.pageCount || openLibrary?.number_of_pages || ""),
    cover: cover || openLibrary?.cover?.large || "",
  };
}
