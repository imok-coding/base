import { useMemo, useState } from "react";
import { CheckCircle2, ChevronRight, Pencil, Search, X } from "lucide-react";
import Cover from "../../../components/ui/Cover";
import Empty from "../../../components/ui/Empty";
import { useManga } from "../../manga/MangaData";
import { useWorkspace } from "../../manga/Workspace";
import { FIELD_LABELS, LIST_LABEL, missingFields } from "../../manga/model";

export default function Manager() {
  const { library, wishlist } = useManga();
  const ws = useWorkspace();
  const [list, setList] = useState("library");
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [field, setField] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(() => new Set());

  const volumes = list === "library" ? library : wishlist;

  const annotated = useMemo(() => volumes.map((v) => ({ v, missing: missingFields(v) })), [volumes]);
  const incomplete = annotated.filter((a) => a.missing.length).length;
  const healthPct = annotated.length ? Math.round(((annotated.length - incomplete) / annotated.length) * 100) : 100;

  const fieldCounts = useMemo(() => {
    const counts = new Map();
    for (const a of annotated) for (const f of a.missing) counts.set(f, (counts.get(f) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [annotated]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map();
    for (const a of annotated) {
      if (q && !`${a.v.title} ${a.v.publisher} ${a.v.isbn}`.toLowerCase().includes(q)) continue;
      let g = map.get(a.v.seriesKey);
      if (!g) {
        g = { key: a.v.seriesKey, title: a.v.series, cover: "", rows: [], missing: 0 };
        map.set(a.v.seriesKey, g);
      }
      if (!g.cover && a.v.cover) g.cover = a.v.cover;
      g.rows.push(a);
      if (a.missing.length) g.missing += 1;
    }
    let out = [...map.values()];
    if (field) out = out.filter((g) => g.rows.some((r) => r.missing.includes(field)));
    else if (onlyMissing) out = out.filter((g) => g.missing > 0);
    return out.sort((a, b) => b.missing - a.missing || a.title.localeCompare(b.title));
  }, [annotated, query, field, onlyMissing]);

  const toggleOpen = (key) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const selectVolume = (id) => {
    if (!ws.selectMode) ws.setSelectMode(true);
    ws.toggle([id]);
  };

  return (
    <>
      <section className="card" style={{ marginBottom: 16 }}>
        <div className="health">
          <div
            className="health-ring"
            style={{ "--pct": healthPct }}
            data-label={`${healthPct}%`}
            role="img"
            aria-label={`${healthPct}% of volumes complete`}
          />
          <div style={{ flex: "1 1 240px" }}>
            <div className="card-title" style={{ color: "var(--text-1)", fontSize: "var(--text-lg)" }}>
              {incomplete
                ? `${incomplete.toLocaleString()} ${list} volume${incomplete === 1 ? "" : "s"} need info`
                : `Every ${list} volume is complete`}
            </div>
            <p className="subtle" style={{ fontSize: "var(--text-sm)", marginTop: 2 }}>
              {(annotated.length - incomplete).toLocaleString()} of {annotated.length.toLocaleString()} have every field
              filled in. Tap a field to focus on it.
            </p>
          </div>
          <div className="segmented segmented--sm" role="tablist">
            {["library", "wishlist"].map((l) => (
              <button
                type="button"
                role="tab"
                key={l}
                aria-selected={list === l}
                onClick={() => {
                  setList(l);
                  setField("");
                }}
              >
                {LIST_LABEL[l]}
              </button>
            ))}
          </div>
        </div>
        {fieldCounts.length > 0 && (
          <div className="chip-set" style={{ marginTop: 16 }}>
            {fieldCounts.map(([f, n]) => (
              <button
                type="button"
                key={f}
                className="chip"
                aria-pressed={field === f}
                onClick={() => setField(field === f ? "" : f)}
              >
                {FIELD_LABELS[f]} <span className="chip-count">{n}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="manager-toolbar">
        <div className="input-wrap">
          <Search />
          <input
            className="input"
            type="search"
            placeholder="Find a series or ISBN"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search series"
          />
        </div>
        {!field && (
          <button
            type="button"
            className={`btn ${onlyMissing ? "is-active" : ""}`}
            onClick={() => setOnlyMissing((o) => !o)}
          >
            Needs info only
          </button>
        )}
        {field && (
          <button
            type="button"
            className="chip chip--accent"
            style={{ height: 40, padding: "0 14px" }}
            onClick={() => setField("")}
          >
            Missing {FIELD_LABELS[field].toLowerCase()} <X />
          </button>
        )}
        <button
          type="button"
          className={`btn ${ws.selectMode ? "is-active" : ""}`}
          onClick={() => ws.setSelectMode(!ws.selectMode)}
        >
          Select
        </button>
      </div>

      {groups.length === 0 ? (
        <Empty icon={CheckCircle2} title="All caught up">
          {query ? "No series match that search." : "Nothing here needs attention."}
        </Empty>
      ) : (
        <div className="series-rows">
          {groups.map((g) => {
            const isOpen = open.has(g.key) || !!field || !!query;
            const rows = field
              ? g.rows.filter((r) => r.missing.includes(field))
              : onlyMissing && !query
                ? g.rows.filter((r) => r.missing.length)
                : g.rows;
            return (
              <div key={g.key} className={`series-row ${isOpen ? "is-open" : ""} ${g.missing ? "has-missing" : ""}`}>
                <div className="series-row-head">
                  <button
                    type="button"
                    className="series-row-toggle"
                    onClick={() => toggleOpen(g.key)}
                    aria-expanded={isOpen}
                  >
                    <ChevronRight />
                    <Cover src={g.cover} alt="" size={120} />
                    <span style={{ minWidth: 0 }}>
                      <span className="series-row-title clamp-1">{g.title}</span>
                      <span className="series-row-meta">
                        {g.rows.length} volume{g.rows.length === 1 ? "" : "s"}
                        {g.missing ? ` · ${g.missing} need info` : " · complete"}
                      </span>
                    </span>
                  </button>
                  <button type="button" className="btn btn--sm" onClick={() => ws.actions.bulk(g.rows.map((r) => r.v))}>
                    <Pencil /> <span className="hide-xs">Edit series</span>
                  </button>
                </div>
                {isOpen && (
                  <div className="vol-rows">
                    {rows.map(({ v, missing }) => (
                      <div key={v.id} className="vol-row">
                        <input
                          type="checkbox"
                          className="checkbox"
                          aria-label={`Select ${v.title}`}
                          checked={ws.selected.has(v.id)}
                          onChange={() => selectVolume(v.id)}
                        />
                        <button
                          type="button"
                          className="vol-row-name card-link"
                          style={{ color: "var(--text-1)" }}
                          onClick={() => ws.openVolume(v.id)}
                        >
                          {v.vol ? `Vol. ${v.vol}` : v.title}
                        </button>
                        <div className="vol-row-missing">
                          {missing.length ? (
                            missing.map((f) => (
                              <span key={f} className="chip chip--warn">
                                {FIELD_LABELS[f]}
                              </span>
                            ))
                          ) : (
                            <span className="chip chip--read">Complete</span>
                          )}
                        </div>
                        <button
                          type="button"
                          className="btn btn--sm btn--ghost btn--icon"
                          aria-label={`Edit ${v.title}`}
                          onClick={() => ws.actions.edit([v])}
                        >
                          <Pencil />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
