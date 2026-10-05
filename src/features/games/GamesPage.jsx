import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Bookmark,
  CheckSquare,
  FileSpreadsheet,
  Gamepad2,
  ImagePlus,
  LayoutGrid,
  Library,
  MoreHorizontal,
  Plus,
  Rows3,
  Search,
  SearchX,
  SlidersHorizontal,
  X,
} from "lucide-react";
import Menu from "../../components/ui/Menu";
import Empty from "../../components/ui/Empty";
import Sheet from "../../components/ui/Sheet";
import { downloadCSV } from "../../lib/download";
import { useAuth } from "../auth/AuthContext";
import { ChipGroup } from "../manga/components/FilterSheet";
import { TileSkeletons } from "../manga/components/Tiles";
import { useGames } from "./GamesData";
import { GamesWorkspace, useGamesWorkspace } from "./GamesWorkspace";
import { OPTIONS, platformOrder, platformShort } from "./model";
import { GameTile } from "./components/GameTile";
import SetupNotice from "./SetupNotice";
import "../manga/manga.css";
import "./games.css";

const LISTS = [
  { key: "owned", label: "Library", icon: Library, match: (g) => g.status === "Owned" || g.status === "Borrowed" },
  { key: "wishlist", label: "Wishlist", icon: Bookmark, match: (g) => g.status === "Wishlist" },
  { key: "sold", label: "Sold / traded", icon: X, match: (g) => g.status === "Sold / Traded" },
];
const MULTI = ["platform", "format", "backlog", "genre"];

function useGameFilters() {
  const [params, setParams] = useSearchParams();
  const f = {
    list: params.get("list") || "owned",
    view: params.get("view") || "grid",
    sort: params.get("sort") || "title",
    q: params.get("q") || "",
    ...Object.fromEntries(MULTI.map((k) => [k, params.getAll(k)])),
  };
  const set = (key, value) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(key);
        if (Array.isArray(value)) value.forEach((v) => next.append(key, v));
        else if (
          value &&
          !(key === "list" && value === "owned") &&
          !(key === "view" && value === "grid") &&
          !(key === "sort" && value === "title")
        )
          next.set(key, value);
        return next;
      },
      { replace: key !== "list" }
    );
  const reset = () =>
    setParams(
      (prev) => {
        const next = new URLSearchParams();
        for (const k of ["list", "view"]) if (prev.get(k)) next.set(k, prev.get(k));
        return next;
      },
      { replace: true }
    );
  return { f, set, reset };
}

const facet = (games, field, order) => {
  const counts = new Map();
  for (const g of games) if (g[field]) counts.set(g[field], (counts.get(g[field]) || 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => (order ? order(a[0]) - order(b[0]) : b[1] - a[1]))
    .map(([value, count]) => ({ value, label: field === "platform" ? platformShort(value) : value, count }));
};

function GamesInner() {
  const { isAdmin } = useAuth();
  const data = useGames();
  const ws = useGamesWorkspace();
  const { f, set, reset } = useGameFilters();
  const [query, setQuery] = useState(f.q);
  const deferred = useDeferredValue(query);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => query !== f.q && set("q", query.trim() ? query : ""), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    document.title = "Games · Tyler's Collection";
  }, []);

  const lists = LISTS.filter((l) => l.key !== "sold" || data.games.some(l.match));
  const list = lists.find((l) => l.key === f.list) || lists[0];
  const base = useMemo(() => data.games.filter(list.match), [data.games, list]);

  const shown = useMemo(() => {
    const terms = deferred.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const out = base.filter((g) => {
      if (terms.length) {
        const hay = `${g.title} ${g.edition} ${g.platform} ${platformShort(g.platform)} ${g.genre}`.toLowerCase();
        if (!terms.every((t) => hay.includes(t))) return false;
      }
      return MULTI.every((k) => !f[k].length || f[k].includes(g[k]));
    });
    const by = {
      acquired: (a, b) => (b.acquired || "").localeCompare(a.acquired || ""),
      platform: (a, b) => platformOrder(a.platform) - platformOrder(b.platform) || a.title.localeCompare(b.title),
      price: (a, b) => (Number(b.price) || 0) - (Number(a.price) || 0),
      rating: (a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0),
      release: (a, b) => (Number(b.releaseYear) || 0) - (Number(a.releaseYear) || 0),
    }[f.sort];
    return by ? [...out].sort(by) : out;
  }, [base, deferred, f.platform, f.format, f.backlog, f.genre, f.sort]); // eslint-disable-line react-hooks/exhaustive-deps

  const { setVisibleIds } = ws;
  useEffect(() => setVisibleIds(shown.map((g) => g.id)), [shown, setVisibleIds]);

  const shelves = useMemo(() => {
    if (f.view !== "shelves") return [];
    const map = new Map();
    for (const g of shown) {
      if (!map.has(g.platform)) map.set(g.platform, []);
      map.get(g.platform).push(g);
    }
    // biggest shelves first
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length || platformOrder(a[0]) - platformOrder(b[0]));
  }, [shown, f.view]);

  const owned = data.owned;
  const platforms = new Set(owned.map((g) => g.platform)).size;
  const physical = owned.filter((g) => g.format !== "Digital").length;
  const digital = owned.filter((g) => g.format !== "Physical").length;
  const missingCovers = data.games.filter((g) => !g.cover).length;

  const sortOptions = [
    { value: "title", label: "Title" },
    { value: "acquired", label: "Recently acquired" },
    { value: "platform", label: "Platform" },
    { value: "release", label: "Release year" },
    { value: "rating", label: "Top rated" },
    ...(isAdmin ? [{ value: "price", label: "Price paid" }] : []),
  ];
  const chips = MULTI.flatMap((k) =>
    f[k].map((v) => ({
      key: `${k}-${v}`,
      label: k === "platform" ? platformShort(v) : v,
      clear: () =>
        set(
          k,
          f[k].filter((x) => x !== v)
        ),
    }))
  );

  if (data.setupNeeded) {
    return (
      <div className="page">
        <header className="page-header">
          <div>
            <div className="page-eyebrow">Collection</div>
            <h1 className="page-title">Games</h1>
          </div>
        </header>
        <SetupNotice />
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <div className="page-eyebrow">Collection</div>
          <h1 className="page-title">Games</h1>
          <p className="page-sub">
            {data.loading
              ? "Loading the shelves…"
              : owned.length
                ? `${owned.length.toLocaleString()} games across ${platforms} platform${platforms === 1 ? "" : "s"} · ${physical} physical · ${digital} digital`
                : "The game shelves are being stocked."}
          </p>
        </div>
        {isAdmin && (
          <div className="page-actions">
            <button
              type="button"
              className={`btn ${ws.selectMode ? "is-active" : ""}`}
              onClick={() => ws.setSelectMode(!ws.selectMode)}
            >
              <CheckSquare /> Select
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => ws.actions.add({ status: list.key === "wishlist" ? "Wishlist" : "Owned" })}
            >
              <Plus /> Add
            </button>
            <Menu
              trigger={(p) => (
                <button type="button" className="btn btn--icon" aria-label="More" {...p}>
                  <MoreHorizontal />
                </button>
              )}
              items={[
                { label: "Import from spreadsheet", icon: FileSpreadsheet, onClick: ws.actions.import },
                {
                  label: ws.coverJob
                    ? `Finding covers… ${ws.coverJob.done}/${ws.coverJob.total}`
                    : `Find missing covers (${missingCovers})`,
                  icon: ImagePlus,
                  onClick: ws.actions.findMissingCovers,
                  disabled: !!ws.coverJob || !missingCovers,
                },
                { separator: true },
                {
                  label: "Export CSV",
                  icon: FileSpreadsheet,
                  onClick: () =>
                    downloadCSV(
                      data.games.map(({ family, ...g }) => g),
                      "games.csv"
                    ),
                },
              ]}
            />
          </div>
        )}
      </header>

      <div className="manga-controls">
        <div className="controls-row">
          <div className="segmented" role="tablist" aria-label="List">
            {lists.map((l) => (
              <button
                key={l.key}
                type="button"
                role="tab"
                aria-selected={list.key === l.key}
                onClick={() => set("list", l.key)}
              >
                <l.icon /> {l.label} <span className="count">{data.games.filter(l.match).length}</span>
              </button>
            ))}
          </div>
          <div className="controls-search input-wrap">
            <Search />
            <input
              type="search"
              className="input"
              placeholder="Search games, platforms…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search games"
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
          <button
            type="button"
            className={`btn ${chips.length ? "is-active" : ""}`}
            onClick={() => setFiltersOpen(true)}
          >
            <SlidersHorizontal /> <span>Filters</span>
            {chips.length > 0 && <span className="filter-badge">{chips.length}</span>}
          </button>
          <select
            className="select controls-sort"
            value={f.sort}
            onChange={(e) => set("sort", e.target.value)}
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
              aria-pressed={f.view === "grid"}
              onClick={() => set("view", "grid")}
              aria-label="Grid"
              title="Grid"
            >
              <LayoutGrid />
            </button>
            <button
              type="button"
              aria-pressed={f.view === "shelves"}
              onClick={() => set("view", "shelves")}
              aria-label="Shelves by platform"
              title="By platform"
            >
              <Rows3 />
            </button>
          </div>
        </div>
        {chips.length > 0 && (
          <div className="active-filters">
            {chips.map((c) => (
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

      {data.error ? (
        <Empty icon={Gamepad2} title="Couldn't load the game library">
          {data.error}
        </Empty>
      ) : data.loading ? (
        <TileSkeletons count={14} />
      ) : !data.games.length ? (
        <Empty
          icon={Gamepad2}
          title="No games yet"
          action={
            isAdmin && (
              <button type="button" className="btn btn--primary" onClick={ws.actions.import}>
                <FileSpreadsheet /> Import your spreadsheet
              </button>
            )
          }
        >
          {isAdmin ? "Bring in your Game Library & Backlog Tracker to fill the shelves in one go." : "Check back soon."}
        </Empty>
      ) : !shown.length ? (
        <Empty
          icon={SearchX}
          title="No matches"
          action={
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
          }
        />
      ) : (
        <>
          <div className="result-line">
            <span className="tabular">
              {shown.length.toLocaleString()} {shown.length === 1 ? "game" : "games"}
            </span>
          </div>
          {f.view === "shelves" ? (
            shelves.map(([platform, items]) => (
              <section className="shelf" key={platform}>
                <div className="shelf-head">
                  <h2 className="shelf-title">{platform || "No platform"}</h2>
                  <span className="subtle tabular">{items.length}</span>
                </div>
                <div className="shelf-row">
                  {items.map((g) => (
                    <GameTile
                      key={g.id}
                      game={g}
                      isAdmin={isAdmin}
                      selectMode={ws.selectMode}
                      selected={ws.selected.has(g.id)}
                      onToggle={ws.toggle}
                      onOpen={ws.openGame}
                    />
                  ))}
                </div>
              </section>
            ))
          ) : (
            <div className="tile-grid tile-grid--games">
              {shown.map((g) => (
                <GameTile
                  key={g.id}
                  game={g}
                  isAdmin={isAdmin}
                  selectMode={ws.selectMode}
                  selected={ws.selected.has(g.id)}
                  onToggle={ws.toggle}
                  onOpen={ws.openGame}
                />
              ))}
            </div>
          )}
        </>
      )}

      <Sheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filter & sort"
        width={560}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={reset}>
              Reset
            </button>
            <span className="spacer" />
            <button type="button" className="btn btn--primary" onClick={() => setFiltersOpen(false)}>
              Show {shown.length} {shown.length === 1 ? "game" : "games"}
            </button>
          </>
        }
      >
        <ChipGroup title="Sort by" options={sortOptions} value={f.sort} onChange={(v) => set("sort", v || "title")} />
        <ChipGroup
          title="Platform"
          options={facet(base, "platform", platformOrder)}
          value={f.platform}
          onChange={(v) => set("platform", v)}
          multi
        />
        <ChipGroup
          title="Format"
          options={facet(base, "format", (v) => OPTIONS.format.indexOf(v))}
          value={f.format}
          onChange={(v) => set("format", v)}
          multi
        />
        <ChipGroup
          title="Backlog"
          options={facet(base, "backlog", (v) => OPTIONS.backlog.indexOf(v))}
          value={f.backlog}
          onChange={(v) => set("backlog", v)}
          multi
        />
        <ChipGroup
          title="Genre"
          options={facet(base, "genre")}
          value={f.genre}
          onChange={(v) => set("genre", v)}
          multi
        />
      </Sheet>
    </div>
  );
}

export default function GamesPage() {
  return (
    <GamesWorkspace>
      <GamesInner />
    </GamesWorkspace>
  );
}
