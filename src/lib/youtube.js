// YouTube link helpers for game review videos.

const ID = /^[A-Za-z0-9_-]{11}$/;

/** Video id from watch, youtu.be, Shorts, live, embed or music links — or "". */
export function youtubeId(url) {
  if (!url) return "";
  try {
    const u = new URL(String(url).trim());
    const host = u.hostname.replace(/^(www|m|music)\./, "");
    let id = "";
    if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
    else if (host === "youtube.com" || host === "youtube-nocookie.com") {
      id = u.searchParams.get("v") || (u.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/) || [])[1] || "";
    }
    return ID.test(id) ? id : "";
  } catch {
    return "";
  }
}

/** Start offset in seconds from ?t=90, ?t=1m30s or ?start=90. */
export function youtubeStart(url) {
  try {
    const u = new URL(String(url).trim());
    const t = u.searchParams.get("t") || u.searchParams.get("start") || "";
    if (/^\d+$/.test(t)) return Number(t);
    const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
    return m ? Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0) : 0;
  } catch {
    return 0;
  }
}

export const youtubeThumb = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

/** Privacy-enhanced embed (no cookies until the visitor plays it). */
export function youtubeEmbed(id, start = 0) {
  const params = new URLSearchParams({ autoplay: "1", rel: "0", modestbranding: "1" });
  if (start) params.set("start", String(start));
  return `https://www.youtube-nocookie.com/embed/${id}?${params}`;
}
