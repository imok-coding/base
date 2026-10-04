import { slugify } from "./format";

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadJSON(data, filename) {
  saveBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), filename);
}

export function downloadCSV(rows, filename) {
  if (!rows.length) return;
  const headers = [...rows.reduce((set, row) => (Object.keys(row).forEach((k) => set.add(k)), set), new Set())];
  const escape = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
  saveBlob(new Blob([csv], { type: "text/csv" }), filename);
}

/** Fetch every cover and bundle them into a zip. Returns the number of images saved. */
export async function downloadCoversZip(rows, filename, onProgress) {
  const files = rows.filter((r) => r.cover).map((r, i) => ({ url: r.cover, name: slugify(r.title, `manga-${i + 1}`) }));
  if (!files.length) return 0;
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const folder = zip.folder("covers");
  const seen = {};
  let done = 0;
  let saved = 0;
  await Promise.all(
    files.map(async (file) => {
      try {
        const res = await fetch(file.url);
        if (!res.ok) throw new Error(res.statusText);
        const blob = await res.blob();
        const ext = (file.url.split(".").pop() || "jpg").split(/[?#]/)[0].slice(0, 4) || "jpg";
        seen[file.name] = (seen[file.name] || 0) + 1;
        const suffix = seen[file.name] > 1 ? `-${seen[file.name]}` : "";
        folder.file(`${file.name}${suffix}.${ext}`, blob);
        saved += 1;
      } catch (err) {
        console.warn("Cover fetch failed", file.url, err);
      } finally {
        done += 1;
        onProgress?.(done, files.length);
      }
    })
  );
  saveBlob(await zip.generateAsync({ type: "blob" }), filename);
  return saved;
}
