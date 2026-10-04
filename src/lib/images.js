// Cover URLs are stored at full size (often 1500px). For grids we ask the
// image host for a smaller rendition where it supports one.
const AMAZON_SIZE = /\._[A-Z]{2}\d+_(?=\.)/; // e.g. ._SL1500_.

export function coverSrc(url, longEdge = 480) {
  if (!url) return "";
  try {
    const u = new URL(url);
    if (u.hostname.endsWith("media-amazon.com")) {
      if (AMAZON_SIZE.test(u.pathname)) {
        u.pathname = u.pathname.replace(AMAZON_SIZE, `._SL${longEdge}_`);
      } else {
        u.pathname = u.pathname.replace(/(\.[a-z]{3,4})$/i, `._SL${longEdge}_$1`);
      }
      return u.toString();
    }
    if (u.hostname === "covers.openlibrary.org") {
      u.pathname = u.pathname.replace(/-[SML]\.jpg$/i, longEdge <= 500 ? "-M.jpg" : "-L.jpg");
      return u.toString();
    }
    if (u.hostname === "store.crunchyroll.com" && u.searchParams.has("sw")) {
      u.searchParams.set("sw", String(Math.round(longEdge * 0.7)));
      return u.toString();
    }
  } catch {
    /* not a URL — use as-is */
  }
  return url;
}
