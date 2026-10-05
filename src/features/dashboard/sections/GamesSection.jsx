import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarClock,
  DollarSign,
  Disc3,
  FileSpreadsheet,
  Gamepad2,
  ImagePlus,
  ListChecks,
  Monitor,
  Trophy,
} from "lucide-react";
import { money } from "../../../lib/format";
import { useGames } from "../../games/GamesData";
import { GamesWorkspace, useGamesWorkspace } from "../../games/GamesWorkspace";
import { OPTIONS, platformOrder, platformShort } from "../../games/model";
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

function GamesStats() {
  const { owned, games, loading } = useGames();
  const ws = useGamesWorkspace();
  const navigate = useNavigate();

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
      missingCovers: games.filter((g) => !g.cover).length,
    };
  }, [owned, games]);

  if (loading) return <div className="skeleton" style={{ height: 240 }} />;

  return (
    <>
      <section className="kpis" aria-label="Game library numbers">
        <Kpi icon={Gamepad2} label="Games" value={owned.length.toLocaleString()} sub={`${s.platforms} platforms`} />
        <Kpi
          icon={Disc3}
          label="Physical"
          value={(s.physical + s.both).toLocaleString()}
          sub={s.both ? `incl. ${s.both} also digital` : "on the shelf"}
        />
        <Kpi icon={Monitor} label="Digital" value={(s.digital + s.both).toLocaleString()} sub="in accounts" />
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
          value={`${games.length ? Math.round(((games.length - s.missingCovers) / games.length) * 100) : 0}%`}
          sub={s.missingCovers ? `${s.missingCovers} missing` : "all set"}
        />
      </section>

      <div className="dash-grid">
        <section className="card dash-card span-6">
          <Head icon={Gamepad2} title="By platform" sub="Games owned" />
          <BarList
            items={s.byPlatform.map(([p, n]) => ({ label: p || "No platform", value: n, key: p }))}
            onSelect={(it) => navigate(`/games?platform=${encodeURIComponent(it.key)}`)}
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
          <Head icon={ListChecks} title="Backlog" sub="Owned games by status" />
          <BarList items={s.backlog} onSelect={(it) => navigate(`/games?backlog=${encodeURIComponent(it.label)}`)} />
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
              disabled={!!ws.coverJob || !s.missingCovers}
            >
              {ws.coverJob ? <span className="spinner" /> : <ImagePlus />}
              {ws.coverJob
                ? `Finding covers… ${ws.coverJob.done}/${ws.coverJob.total}`
                : `Find missing covers (${s.missingCovers})`}
            </button>
          </div>
          <p className="subtle" style={{ fontSize: "var(--text-xs)", marginTop: 10 }}>
            Re-import the tracker any time — matching games are updated, new rows are added, and blank cells never erase
            what&apos;s already here. Covers come from Wikipedia; pick a different one from any game&apos;s editor.
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
