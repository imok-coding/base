import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Bookmark,
  BookPlus,
  CheckSquare,
  FileJson,
  FileSpreadsheet,
  Images,
  LayoutGrid,
  Library,
  Lightbulb,
  MoreHorizontal,
  Rows3,
  Search,
  SearchX,
  SlidersHorizontal,
  WifiOff,
  X,
} from "lucide-react";
import Menu from "../../components/ui/Menu";
import Empty from "../../components/ui/Empty";
import { useFeedback } from "../../components/ui/Feedback";
import { downloadCoversZip, downloadCSV, downloadJSON } from "../../lib/download";
import { useAuth } from "../auth/AuthContext";
import { useManga } from "./MangaData";
import { MangaWorkspace, useWorkspace } from "./Workspace";
import { compareVolumes, groupSeries, LIST_LABEL, missingFields, seriesSlug, soonBySeries } from "./model";
import { SeriesTile, TileSkeletons, VolumeTile } from "./components/Tiles";
import FilterSheet from "./components/FilterSheet";
import "./manga.css";

const VIEW_KEY = "mangaViewMode";
const MULTI = ["demo", "genre", "pub"];
const SINGLE = { list: "library", sort: "title", status: "", edition: "", admin: "" };

const searchCache = new WeakMap();
function searchText(v) {
  let t = searchCache.get(v);
  if (!t) {
    t = [v.title, v.authors, v.publisher, v.isbn, v.genre, v.subGenre, v.demographic].join(" ").toLowerCase();
    searchCache.set(v, t);
  }
  return t;
}

function storedView() {
  try {
    return localStorage.getItem(VIEW_KEY) === "individual" ? "volumes" : "series";
  } catch {
    return "series";
  }
}

function useFilters() {
  const [params, setParams] = useSearchParams();
  const filters = {
    ...Object.fromEntries(Object.entries(SINGLE).map(([k, d]) => [k, params.get(k) || d])),
    ...Object.fromEntries(MULTI.map((k) => [k, params.getAll(k)])),
    view: params.get("view") || storedView(),
    q: params.get("q") || "",
  };
  if (filters.list !== "wishlist") filters.list = "library";

  const setFilter = (key, value) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(key);
        if (Array.isArray(value)) value.forEach((v) => next.append(key, v));
        else if (value && value !== SINGLE[key]) next.set(key, value);
        if (key === "list") {
          next.delete("status");
          next.delete("edition");
          if (next.get("sort") && next.get("sort") !== "title") next.delete("sort");
        }
        return next;
      },
      { replace: key !== "list" }
    );
    if (key === "view") {
      try {
        localStorage.setItem(VIEW_KEY, value === "volumes" ? "individual" : "series");
      } catch {
        /* ignore */
      }
    }
  };

  const reset = () =>
    setParams(
      (prev) => {
        const next = new URLSearchParams();
        if (prev.get("list")) next.set("list", prev.get("list"));
        if (prev.get("view")) next.set("view", prev.get("view"));
        return next;
      },
      { replace: true }
    );

  return { filters, setFilter, reset };
}

function facetOptions(volumes, field) {
  const counts = new Map();
  const seen = new Set();
  for (const v of volumes) {
    const val = v[field];
    if (!val || seen.has(`${v.seriesKey}|${val}`)) continue;
    seen.add(`${v.seriesKey}|${val}`);
    counts.set(val, (counts.get(val) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value, count]) => ({ value, label: value, count }));
}

const byDesc = (key) => (a, b) => (b[key] || "").localeCompare(a[key] || "");

function MangaPageInner() {
  const { isAdmin, user } = useAuth();
  const data = useManga();
  const { toast } = useFeedback();
  const navigate = useNavigate();
  const ws = useWorkspace();
  const { filters, setFilter, reset } = useFilters();
  const [query, setQuery] = useState(filters.q);
  const deferredQuery = useDeferredValue(query);
  const [filterOpen, setFilterOpen] = useState(false);
  const searchRef = useRef(null);
  const sentinel = useRef(null);
  const [stuck, setStuck] = useState(false);

  const { list, view } = filters;
  const base = list === "library" ? data.publicLibrary : data.publicWishlist;

  // keep ?q= in sync with the search box (debounced)
  useEffect(() => {
    const t = setTimeout(() => {
      if (query !== filters.q) setFilter("q", query.trim() ? query : "");
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // "/" focuses search
  useEffect(() => {
    const onKey = (e) => {
      if (
        e.key === "/" &&
        !/input|textarea|select/i.test(document.activeElement?.tagName || "") &&
        !document.querySelector("dialog[open]")
      ) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!sentinel.current) return undefined;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting), { rootMargin: "-80px 0px 0px 0px" });
    io.observe(sentinel.current);
    return () => io.disconnect();
  }, []);

  const allSeries = useMemo(() => groupSeries(base), [base]);
  // a series card counts releases from both lists, so the next volume on the
  // wishlist shows up on the series you already own
  const soon = useMemo(
    () => soonBySeries([...data.publicLibrary, ...data.publicWishlist]),
    [data.publicLibrary, data.publicWishlist]
  );

  const filteredVolumes = useMemo(() => {
    const terms = deferredQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return base.filter((v) => {
      if (terms.length && !terms.every((t) => searchText(v).includes(t))) return false;
      if (filters.demo.length && !filters.demo.includes(v.demographic)) return false;
      if (filters.genre.length && !filters.genre.includes(v.genre)) return false;
      if (filters.pub.length && !filters.pub.includes(v.publisher)) return false;
      if (filters.edition && v.specialType !== filters.edition) return false;
      if (filters.admin === "missing" && !missingFields(v).length) return false;
      if (filters.admin === "hidden" && !v.hidden) return false;
      if (view === "volumes" && list === "library") {
        if (filters.status === "read" && !v.read) return false;
        if ((filters.status === "unread" || filters.status === "reading") && v.read) return false;
      }
      return true;
    });
  }, [
    base,
    deferredQuery,
    filters.demo,
    filters.genre,
    filters.pub,
    filters.edition,
    filters.admin,
    filters.status,
    view,
    list,
  ]);

  const seriesList = useMemo(() => {
    if (view !== "series") return [];
    const keys = new Set(filteredVolumes.map((v) => v.seriesKey));
    let out = allSeries.filter((s) => keys.has(s.key));
    if (list === "library") {
      if (filters.status === "unread") out = out.filter((s) => s.readCount < s.count);
      if (filters.status === "reading") out = out.filter((s) => s.readCount > 0 && s.readCount < s.count);
      if (filters.status === "read") out = out.filter((s) => s.readCount === s.count);
    }
    const sorted = [...out];
    switch (filters.sort) {
      case "purchased":
        sorted.sort(byDesc("lastPurchased"));
        break;
      case "read":
        sorted.sort(byDesc("lastRead"));
        break;
      case "release":
        sorted.sort((a, b) => (a.nextRelease || "9999").localeCompare(b.nextRelease || "9999"));
        break;
      case "rating":
        sorted.sort((a, b) => b.avgRating - a.avgRating || a.title.localeCompare(b.title));
        break;
      case "count":
        sorted.sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));
        break;
      default:
        sorted.sort((a, b) => a.title.localeCompare(b.title));
    }
    return sorted;
  }, [view, filteredVolumes, allSeries, list, filters.status, filters.sort]);

  const volumeList = useMemo(() => {
    if (view !== "volumes") return [];
    const sorted = [...filteredVolumes];
    switch (filters.sort) {
      case "purchased":
        sorted.sort(byDesc("datePurchased"));
        break;
      case "read":
        sorted.sort(byDesc("dateRead"));
        break;
      case "release":
        if (list === "wishlist") {
          // upcoming first (soonest), then already-released (newest), undated last
          const today = new Date().toISOString().slice(0, 10);
          const rank = (v) => (!v.date ? 2 : v.date >= today ? 0 : 1);
          sorted.sort(
            (a, b) =>
              rank(a) - rank(b) ||
              (rank(a) === 0 ? a.date.localeCompare(b.date) : (b.date || "").localeCompare(a.date || ""))
          );
        } else {
          sorted.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        }
        break;
      case "rating":
        sorted.sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0) || compareVolumes(a, b));
        break;
      default:
        break; // already title/volume order
    }
    return sorted;
  }, [view, filteredVolumes, filters.sort, list]);

  const visibleIds = useMemo(
    () => (view === "series" ? seriesList.flatMap((s) => s.items.map((v) => v.id)) : volumeList.map((v) => v.id)),
    [view, seriesList, volumeList]
  );
  const { setVisibleIds } = ws;
  useEffect(() => setVisibleIds(visibleIds), [visibleIds, setVisibleIds]);

  const facets = useMemo(
    () => ({
      demographic: facetOptions(base, "demographic"),
      genre: facetOptions(base, "genre"),
      publisher: facetOptions(base, "publisher"),
    }),
    [base]
  );

  const sortOptions = [
    { value: "title", label: "Title" },
    ...(list === "library"
      ? [
          { value: "purchased", label: "Recently bought" },
          { value: "read", label: "Recently read" },
          { value: "rating", label: "Top rated" },
        ]
      : []),
    { value: "release", label: list === "wishlist" ? "Releasing soonest" : "Release date" },
    ...(view === "series" ? [{ value: "count", label: "Most volumes" }] : []),
  ];

  // header stats
  const libSeries = useMemo(() => new Set(data.publicLibrary.map((v) => v.seriesKey)).size, [data.publicLibrary]);
  const readPct = data.publicLibrary.length
    ? Math.round((data.publicLibrary.filter((v) => v.read).length / data.publicLibrary.length) * 100)
    : 0;
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = data.publicWishlist.filter((v) => v.date && v.date >= today).length;
  const missingTotal = useMemo(
    () => (isAdmin ? [...data.library, ...data.wishlist].filter((v) => missingFields(v).length).length : 0),
    [isAdmin, data.library, data.wishlist]
  );

  useEffect(() => {
    document.title = `${missingTotal ? `(${missingTotal}) ` : ""}Manga · Tyler's Collection`;
  }, [missingTotal]);

  const activeChips = [
    filters.status && {
      key: "status",
      label: { unread: "Unread", reading: "In progress", read: "Finished" }[filters.status],
      clear: () => setFilter("status", ""),
    },
    filters.edition && {
      key: "edition",
      label: filters.edition === "collectible" ? "Collectible" : "Special edition",
      clear: () => setFilter("edition", ""),
    },
    filters.admin && {
      key: "admin",
      label: filters.admin === "missing" ? "Needs info" : "Hidden only",
      clear: () => setFilter("admin", ""),
    },
    ...MULTI.flatMap((k) =>
      filters[k].map((val) => ({
        key: `${k}-${val}`,
        label: val,
        clear: () =>
          setFilter(
            k,
            filters[k].filter((x) => x !== val)
          ),
      }))
    ),
  ].filter(Boolean);
  const filterCount = activeChips.length;

  const exportRows = (rows) => rows.map(({ series, seriesKey, vol, volumes, ...rest }) => rest);
  const downloadCovers = async () => {
    toast("Collecting covers, this can take a minute", { type: "info" });
    const n = await downloadCoversZip(base, `manga-${list}-covers.zip`);
    toast(n ? `Saved ${n} covers` : "No covers to download", { type: n ? "success" : "info" });
  };

  const resultCount = view === "series" ? seriesList.length : volumeList.length;
  const resultNoun = view === "series" ? "series" : resultCount === 1 ? "volume" : "volumes";

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <div className="page-eyebrow">Collection</div>
          <h1 className="page-title">Manga</h1>
          <p className="page-sub">
            {data.loading
              ? "Loading..."
              : list === "library"
                ? `${data.publicLibrary.length.toLocaleString()} volumes across ${libSeries} series · ${readPct}% read`
                : `${data.publicWishlist.length.toLocaleString()} volumes wanted · ${upcoming} upcoming release${upcoming === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="page-actions">
          {isAdmin && (
            <>
              <button
                type="button"
                className={`btn ${ws.selectMode ? "is-active" : ""}`}
                onClick={() => ws.setSelectMode(!ws.selectMode)}
              >
                <CheckSquare /> Select
              </button>
              <button type="button" className="btn btn--primary" onClick={() => ws.actions.add(list)}>
                <BookPlus /> Add
              </button>
              <Menu
                trigger={(p) => (
                  <button type="button" className="btn btn--icon" aria-label="Export" {...p}>
                    <MoreHorizontal />
                  </button>
                )}
                items={[
                  { heading: "Export" },
                  {
                    label: "Full backup (JSON)",
                    icon: FileJson,
                    onClick: () =>
                      downloadJSON(
                        { library: exportRows(data.library), wishlist: exportRows(data.wishlist) },
                        "manga-library-wishlist.json"
                      ),
                  },
                  {
                    label: `${LIST_LABEL[list]} as CSV`,
                    icon: FileSpreadsheet,
                    onClick: () => downloadCSV(exportRows(base), `manga-${list}.csv`),
                  },
                  { label: `${LIST_LABEL[list]} covers (zip)`, icon: Images, onClick: downloadCovers },
                ]}
              />
            </>
          )}
          {user && !isAdmin && (
            <button type="button" className="btn btn--soft" onClick={ws.actions.suggest}>
              <Lightbulb /> Suggest a manga
            </button>
          )}
        </div>
      </header>

      <div ref={sentinel} />
      <div className={`manga-controls ${stuck ? "is-stuck" : ""}`}>
        <div className="controls-row">
          <div className="segmented" role="tablist" aria-label="List">
            {["library", "wishlist"].map((l) => (
              <button key={l} type="button" role="tab" aria-selected={list === l} onClick={() => setFilter("list", l)}>
                {l === "library" ? <Library /> : <Bookmark />}
                {LIST_LABEL[l]}
                <span className="count">{(l === "library" ? data.publicLibrary : data.publicWishlist).length}</span>
              </button>
            ))}
          </div>
          <div className="controls-search input-wrap">
            <Search />
            <input
              ref={searchRef}
              type="search"
              className="input"
              placeholder="Search title, author or ISBN"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search manga"
              enterKeyHint="search"
            />
            {query && (
              <button
                type="button"
                className="btn btn--ghost btn--icon btn--sm input-clear"
                onClick={() => setQuery("")}
                aria-label="Clear search"
              >
                <X />
              </button>
            )}
          </div>
          <button type="button" className={`btn ${filterCount ? "is-active" : ""}`} onClick={() => setFilterOpen(true)}>
            <SlidersHorizontal />
            <span>Filters</span>
            {filterCount > 0 && <span className="filter-badge">{filterCount}</span>}
          </button>
          <select
            className="select controls-sort"
            value={filters.sort}
            onChange={(e) => setFilter("sort", e.target.value)}
            aria-label="Sort"
          >
            {sortOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <div className="segmented" role="group" aria-label="View">
            <button
              type="button"
              aria-pressed={view === "series"}
              onClick={() => setFilter("view", "series")}
              aria-label="Series view"
              title="Series"
            >
              <LayoutGrid />
            </button>
            <button
              type="button"
              aria-pressed={view === "volumes"}
              onClick={() => setFilter("view", "volumes")}
              aria-label="Volume view"
              title="Volumes"
            >
              <Rows3 />
            </button>
          </div>
        </div>
        {activeChips.length > 0 && (
          <div className="active-filters">
            {activeChips.map((c) => (
              <button type="button" key={c.key} className="chip chip--accent" onClick={c.clear}>
                {c.label} <X />
              </button>
            ))}
            <button type="button" className="chip" onClick={reset}>
              Clear all
            </button>
          </div>
        )}
      </div>

      {data.offline && (
        <div className="offline-note">
          <WifiOff /> Showing a saved copy because the live data couldn&apos;t be reached.
        </div>
      )}

      {data.error ? (
        <Empty icon={WifiOff} title="Couldn't load the collection">
          {data.error}
        </Empty>
      ) : data.loading ? (
        <TileSkeletons volumes={view === "volumes"} count={view === "volumes" ? 18 : 12} />
      ) : resultCount === 0 ? (
        <Empty
          icon={SearchX}
          title={base.length ? "No matches" : `The ${list} is empty`}
          action={
            base.length ? (
              <button
                type="button"
                className="btn btn--soft"
                onClick={() => {
                  setQuery("");
                  reset();
                }}
              >
                Clear search & filters
              </button>
            ) : isAdmin ? (
              <button type="button" className="btn btn--primary" onClick={() => ws.actions.add(list)}>
                <BookPlus /> Add the first one
              </button>
            ) : null
          }
        >
          {base.length ? "Try a different search or loosen the filters." : null}
        </Empty>
      ) : (
        <>
          <div className="result-line">
            <span className="tabular">
              {resultCount.toLocaleString()} {resultNoun}
              {view === "series" && ` · ${visibleIds.length.toLocaleString()} volumes`}
            </span>
          </div>
          {view === "series" ? (
            <div className="tile-grid">
              {seriesList.map((s) => (
                <SeriesTile
                  key={s.key}
                  s={s}
                  list={list}
                  soon={soon.get(s.key)}
                  isAdmin={isAdmin}
                  selectMode={ws.selectMode}
                  selected={ws.selectMode && s.items.every((v) => ws.selected.has(v.id))}
                  onToggle={ws.toggle}
                  onOpen={(key) =>
                    navigate(`/manga/series/${seriesSlug(key)}${list === "wishlist" ? "?list=wishlist" : ""}`)
                  }
                />
              ))}
            </div>
          ) : (
            <div className="tile-grid tile-grid--volumes">
              {volumeList.map((v) => (
                <VolumeTile
                  key={v.id}
                  v={v}
                  isAdmin={isAdmin}
                  selectMode={ws.selectMode}
                  selected={ws.selected.has(v.id)}
                  onToggle={ws.toggle}
                  onOpen={ws.openVolume}
                />
              ))}
            </div>
          )}
        </>
      )}

      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        filters={filters}
        setFilter={setFilter}
        facets={facets}
        sortOptions={sortOptions}
        resultCount={`${resultCount} ${resultNoun}`}
        onReset={reset}
        isAdmin={isAdmin}
        list={list}
      />
    </div>
  );
}

export default function MangaPage() {
  return (
    <MangaWorkspace>
      <MangaPageInner />
    </MangaWorkspace>
  );
}
