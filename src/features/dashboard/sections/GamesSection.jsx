import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  CalendarClock,
  CloudDownload,
  Database,
  DollarSign,
  Disc3,
  FileSpreadsheet,
  Gamepad2,
  Hourglass,
  ImagePlus,
  Layers,
  ListChecks,
  Monitor,
  PieChart,
  Trophy,
} from "lucide-react";
import { money } from "../../../lib/format";
import { igdbReady } from "../../../lib/igdb";
import { useGames } from "../../games/GamesData";
import { GamesWorkspace, useGamesWorkspace } from "../../games/GamesWorkspace";
import { needsCover, needsInfo, OPTIONS, platformOrder, platformShort } from "../../games/model";
import SetupNotice from "../../games/SetupNotice";
import { BarList, ColumnChart, Meter } from "../charts";

function Kpi({ icon: Icon, label, value, sub, children }) {
  return (
    <div className="kpi">
      <span className="kpi-label">
        <Icon /> {label}
      </span>
      <span className="kpi-value">{value}</span>
      {sub && <span className="kpi-sub">{sub}</span>}
      {children}
    </div>
  );
}

function Head({ icon: Icon, title, sub, action }) {
  return (
    <div className="card-head">
      <div>
        <div className="card-title">
          <Icon /> {title}
        </div>
        {sub && <div className="card-sub">{sub}</div>}
      </div>
      {action}
    </div>
  );
}

// split every stat by how the games are owned
const FORMATS = [
  { key: "all", label: "All", icon: Gamepad2 },
  { key: "Physical", label: "Physical", icon: Disc3 },
  { key: "Digital", label: "Digital", icon: CloudDownload },
  { key: "Both", label: "Both", icon: Layers },
];

function GamesStats() {
  const { owned: allOwned, games: allGames, loading } = useGames();
  const ws = useGamesWorkspace();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const format = FORMATS.some((f) => f.key === params.get("format")) ? params.get("format") : "all";
  const filtered = format !== "all";
  const owned = useMemo(
    () => (filtered ? allOwned.filter((g) => g.format === format) : allOwned),
    [allOwned, filtered, format]
  );
  const games = useMemo(
    () => (filtered ? allGames.filter((g) => g.format === format) : allGames),
    [allGames, filtered, format]
  );
  const counts = useMemo(() => {
    const c = { all: allOwned.length };
    for (const g of allOwned) c[g.format] = (c[g.format] || 0) + 1;
    return c;
  }, [allOwned]);
  const setFormat = (key) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (key === "all") next.delete("format");
        else next.set("format", key);
        return next;
      },
      { replace: true }
    );
  // keep the format when jumping to the games page
  const gamesLink = (query) => `/games?${query}${filtered ? `&format=${encodeURIComponent(format)}` : ""}`;
  const noun = filtered ? `${format === "Both" ? "Physical + digital" : format} games` : "Games";

  // the library tools work on everything, whatever the filter
  const tools = useMemo(
    () => ({ missingCovers: allGames.filter(needsCover).length, missingInfo: allGames.filter(needsInfo).length }),
    [allGames]
  );

  const s = useMemo(() => {
    const byPlatform = new Map();
    const spendByPlatform = new Map();
    const byYear = new Map();
    const byBacklog = new Map();
    let spent = 0;
    let priced = 0;
    for (const g of owned) {
      byPlatform.set(g.platform, (byPlatform.get(g.platform) || 0) + 1);
      byBacklog.set(g.backlog, (byBacklog.get(g.backlog) || 0) + 1);
      if (g.price !== "") {
        spent += Number(g.price);
        priced += 1;
        spendByPlatform.set(g.platform, (spendByPlatform.get(g.platform) || 0) + Number(g.price));
      }
      if (g.acquired) {
        const y = Number(g.acquired.slice(0, 4));
        byYear.set(y, (byYear.get(y) || 0) + 1);
      }
    }
    const years = [...byYear.keys()].sort((a, b) => a - b);
    const yearSeries = years.length ? Array.from({ length: years.at(-1) - years[0] + 1 }, (_, i) => years[0] + i) : [];
    return {
      physical: owned.filter((g) => g.format === "Physical").length,
      digital: owned.filter((g) => g.format === "Digital").length,
      both: owned.filter((g) => g.format === "Both").length,
      platforms: byPlatform.size,
      completed: byBacklog.get("Completed") || 0,
      spent,
      avg: priced ? spent / priced : 0,
      byPlatform: [...byPlatform.entries()].sort((a, b) => b[1] - a[1] || platformOrder(a[0]) - platformOrder(b[0])),
      spendByPlatform: [...spendByPlatform.entries()].sort((a, b) => b[1] - a[1]),
      perYear: yearSeries.map((y) => ({
        label: String(y).slice(2).padStart(2, "0"),
        tip: String(y),
        value: byYear.get(y) || 0,
      })),
      backlog: OPTIONS.backlog.map((b) => ({ label: b, value: byBacklog.get(b) || 0 })).filter((r) => r.value),
      // hidden games still count everywhere here except cover art
      hidden: owned.filter((g) => g.hidden).length,
      coverBase: games.filter((g) => !g.hidden).length,
      missingCovers: games.filter(needsCover).length,
      notStarted: byBacklog.get("Not Started") || 0,
    };
  }, [owned, games]);

  if (loading) return <div className="skeleton" style={{ height: 240 }} />;

  return (
    <>
      <div className="games-format" role="tablist" aria-label="Show stats for">
        <div className="segmented">
          {FORMATS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={format === f.key}
              onClick={() => setFormat(f.key)}
            >
              <f.icon /> {f.label} <span className="count">{(counts[f.key] || 0).toLocaleString()}</span>
            </button>
          ))}
        </div>
      </div>

      <section className="kpis" aria-label="Game library numbers">
        <Kpi
          icon={Gamepad2}
          label={noun}
          value={owned.length.toLocaleString()}
          sub={`${s.platforms} platform${s.platforms === 1 ? "" : "s"}${s.hidden ? ` · ${s.hidden} hidden` : ""}`}
        />
        {filtered ? (
          <>
            <Kpi
              icon={PieChart}
              label="Share of library"
              value={`${allOwned.length ? Math.round((owned.length / allOwned.length) * 100) : 0}%`}
              sub={`${owned.length} of ${allOwned.length} games`}
            >
              <Meter value={allOwned.length ? owned.length / allOwned.length : 0} label="Share of the library" />
            </Kpi>
            <Kpi
              icon={Hourglass}
              label="Not started yet"
              value={s.notStarted.toLocaleString()}
              sub={owned.length ? `${Math.round((s.notStarted / owned.length) * 100)}% of these` : "nothing here"}
            />
          </>
        ) : (
          <>
            <Kpi
              icon={Disc3}
              label="Physical"
              value={(s.physical + s.both).toLocaleString()}
              sub={s.both ? `incl. ${s.both} also digital` : "on the shelf"}
            />
            <Kpi icon={Monitor} label="Digital" value={(s.digital + s.both).toLocaleString()} sub="in accounts" />
          </>
        )}
        <Kpi
          icon={DollarSign}
          label="Spent"
          value={money(s.spent, { whole: true })}
          sub={s.avg ? `${money(s.avg)} avg` : "add prices to track"}
        />
        <Kpi
          icon={Trophy}
          label="Completed"
          value={`${owned.length ? Math.round((s.completed / owned.length) * 100) : 0}%`}
          sub={`${s.completed} of ${owned.length}`}
        >
          <Meter value={owned.length ? s.completed / owned.length : 0} label="Games completed" />
        </Kpi>
        <Kpi
          icon={ImagePlus}
          label="Cover art"
          value={`${s.coverBase ? Math.round(((s.coverBase - s.missingCovers) / s.coverBase) * 100) : 0}%`}
          sub={s.missingCovers ? `${s.missingCovers} missing` : "all set"}
        />
      </section>

      <div className="dash-grid">
        <section className="card dash-card span-6">
          <Head icon={Gamepad2} title="By platform" sub={`${noun} owned`} />
          <BarList
            items={s.byPlatform.map(([p, n]) => ({ label: p || "No platform", value: n, key: p }))}
            onSelect={(it) => navigate(gamesLink(`platform=${encodeURIComponent(it.key)}`))}
            empty="No games here"
          />
        </section>
        <section className="card dash-card span-6">
          <Head icon={DollarSign} title="Spending by platform" sub="Where purchase prices are recorded" />
          <BarList
            items={s.spendByPlatform.map(([p, v]) => ({ label: platformShort(p), value: v }))}
            formatValue={(v) => money(v, { whole: true })}
            empty="No prices yet"
          />
        </section>
        <section className="card dash-card span-8">
          <Head icon={CalendarClock} title="Games acquired per year" sub="From the acquired date" />
          <ColumnChart
            ariaLabel="Games acquired per year"
            unit="games"
            data={s.perYear}
            emptyText="No acquired dates yet"
          />
        </section>
        <section className="card dash-card span-4">
          <Head icon={ListChecks} title="Backlog" sub={`${noun} by status`} />
          <BarList
            items={s.backlog}
            onSelect={(it) => navigate(gamesLink(`backlog=${encodeURIComponent(it.label)}`))}
            empty="No games here"
          />
        </section>
        <section className="card dash-card span-12">
          <Head icon={FileSpreadsheet} title="Library tools" />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" className="btn btn--primary" onClick={ws.actions.import}>
              <FileSpreadsheet /> Import from spreadsheet
            </button>
            <button
              type="button"
              className="btn"
              onClick={ws.actions.findMissingCovers}
              disabled={!!ws.coverJob || !tools.missingCovers}
            >
              {ws.coverJob ? <span className="spinner" /> : <ImagePlus />}
              {ws.coverJob
                ? `Finding covers... ${ws.coverJob.done}/${ws.coverJob.total}`
                : `Find missing covers (${tools.missingCovers})`}
            </button>
            {igdbReady && (
              <button
                type="button"
                className="btn"
                onClick={ws.actions.fillInfo}
                disabled={!!ws.infoJob || !tools.missingInfo}
              >
                {ws.infoJob ? <span className="spinner" /> : <Database />}
                {ws.infoJob
                  ? `Checking IGDB... ${ws.infoJob.done}/${ws.infoJob.total}`
                  : `Fill game info from IGDB (${tools.missingInfo})`}
              </button>
            )}
          </div>
          <p className="subtle" style={{ fontSize: "var(--text-xs)", marginTop: 10 }}>
            You can re-import the tracker any time. Matching games get updated, new rows get added, and blank cells
            never erase what&apos;s already here. Covers come from the PlayStation Store and Wikipedia, and you can pick
            a different one from any game&apos;s editor. Hidden games are skipped.{" "}
            {igdbReady
              ? "IGDB adds descriptions, developers, critic scores, screenshots and how long a game takes to beat, and only fills in blanks."
              : "IGDB game info isn't connected yet, see the IGDB section in the README."}
          </p>
        </section>
      </div>
    </>
  );
}

export default function GamesSection() {
  const { setupNeeded } = useGames();
  if (setupNeeded) return <SetupNotice />;
  return (
    <GamesWorkspace>
      <GamesStats />
    </GamesWorkspace>
  );
}
