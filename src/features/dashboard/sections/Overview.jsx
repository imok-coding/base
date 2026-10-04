import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  BookCheck,
  BookOpen,
  Bookmark,
  CalendarClock,
  ChevronRight,
  Clock,
  DollarSign,
  FileText,
  Gauge,
  Library,
  ShoppingCart,
  Shuffle,
  Sparkles,
  Star,
  AlarmClockOff,
  BellOff,
} from "lucide-react";
import Cover from "../../../components/ui/Cover";
import { useFeedback } from "../../../components/ui/Feedback";
import { formatDate, money } from "../../../lib/format";
import { seriesSlug } from "../../manga/model";
import { useWorkspace } from "../../manga/Workspace";
import { BarList, ColumnChart, Meter } from "../charts";
import DetailSheet from "../DetailSheet";
import { useReadNext } from "../useReadNext";
import { monthlyReads } from "../stats";
import { useManga } from "../../manga/MangaData";

function Kpi({ icon: Icon, label, value, sub, onClick, children }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} className="kpi" onClick={onClick}>
      <span className="kpi-label">
        <Icon /> {label}
      </span>
      <span className="kpi-value">{value}</span>
      {sub && <span className="kpi-sub">{sub}</span>}
      {children}
    </Tag>
  );
}

function Countdown({ date }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const diff = Math.max(0, date.getTime() - now);
  if (diff === 0)
    return (
      <div className="chip chip--read" style={{ marginTop: 14 }}>
        Out today
      </div>
    );
  const s = Math.floor(diff / 1000);
  const parts = [
    [Math.floor(s / 86400), "days"],
    [Math.floor((s % 86400) / 3600), "hrs"],
    [Math.floor((s % 3600) / 60), "min"],
    [s % 60, "sec"],
  ];
  return (
    <div className="countdown" aria-label={`${parts[0][0]} days ${parts[1][0]} hours until release`}>
      {parts.map(([n, l]) => (
        <div key={l}>
          <strong>{String(n).padStart(l === "days" ? 1 : 2, "0")}</strong>
          <span>{l}</span>
        </div>
      ))}
    </div>
  );
}

function CardHead({ icon: Icon, title, sub, action }) {
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

function More({ onClick, children = "View all" }) {
  return (
    <button type="button" className="card-link" onClick={onClick}>
      {children} <ChevronRight />
    </button>
  );
}

export default function Overview({ stats }) {
  const navigate = useNavigate();
  const ws = useWorkspace();
  const { toast } = useFeedback();
  const { library } = useManga();
  const [detail, setDetail] = useState(null);
  // most recent year with reads (falls back to this year)
  const [year, setYear] = useState(() => {
    const now = new Date().getFullYear();
    return stats.monthly.some((m) => m.value) ? now : (stats.years.find((y) => y !== now) ?? now);
  });
  const { readNext, purchaseNext, shuffle, snooze, clearSnoozes, snoozedCount } = useReadNext(stats);

  const monthly = year === new Date().getFullYear() ? stats.monthly : monthlyReads(library, year);
  const yearTotal = monthly.reduce((s, m) => s + m.value, 0);
  const thisMonth = year === new Date().getFullYear() ? new Date().getMonth() : -1;
  const next = stats.nextRelease;
  const pick = readNext?.pick;
  const buy = purchaseNext?.pick;
  const v = stats.value;

  return (
    <>
      <section className="kpis" aria-label="Headline numbers">
        <Kpi
          icon={Library}
          label="Library"
          value={stats.totalLibrary.toLocaleString()}
          sub={`${stats.seriesCount} series`}
          onClick={() => navigate("/dashboard/calendar?mode=purchases")}
        />
        <Kpi
          icon={Bookmark}
          label="Wishlist"
          value={stats.totalWishlist.toLocaleString()}
          sub={next ? `Next ${formatDate(next.date, { month: "short", day: "numeric" })}` : "No upcoming releases"}
          onClick={() => setDetail("releases")}
        />
        <Kpi
          icon={BookCheck}
          label="Read"
          value={`${stats.readPct}%`}
          sub={`${stats.readCount.toLocaleString()} of ${stats.totalLibrary.toLocaleString()}`}
          onClick={() => navigate("/dashboard/calendar?mode=reads")}
        >
          <Meter value={stats.readPct / 100} label="Library read" />
        </Kpi>
        <Kpi
          icon={FileText}
          label="Pages read"
          value={stats.pages.read.toLocaleString()}
          sub={`of ${stats.pages.total.toLocaleString()}`}
          onClick={() => setDetail("pages")}
        />
        <Kpi
          icon={DollarSign}
          label="Spent"
          value={money(v.paid, { whole: true })}
          sub={v.savingsPct != null ? `${v.savingsPct.toFixed(0)}% under MSRP` : "Add MSRPs to compare"}
          onClick={() => setDetail("value")}
        />
        <Kpi
          icon={Star}
          label="Avg rating"
          value={stats.avgRating == null ? "—" : stats.avgRating.toFixed(2)}
          sub="across rated series"
          onClick={() => setDetail("ratings")}
        />
      </section>

      <div className="dash-grid">
        {/* Read next */}
        <section className="card dash-card span-8">
          <CardHead
            icon={Sparkles}
            title="Read next"
            sub="Weighs your backlog, upcoming releases and recent buys"
            action={
              snoozedCount > 0 && (
                <button type="button" className="card-link" onClick={clearSnoozes}>
                  <BellOff /> Clear {snoozedCount} snoozed
                </button>
              )
            }
          />
          {pick ? (
            <>
              <div className="pick">
                <Link to={`/manga/series/${seriesSlug(pick.key)}`} aria-label={pick.title}>
                  <Cover src={pick.firstUnread?.cover || pick.cover} alt={pick.title} size={300} />
                </Link>
                <div style={{ minWidth: 0 }}>
                  <div className="pick-title">{pick.title}</div>
                  <p className="pick-line">
                    {pick.firstUnread?.vol ? `Start with Vol. ${pick.firstUnread.vol} · ` : ""}
                    {pick.behindCount} volume{pick.behindCount === 1 ? "" : "s"} to catch up to Vol.{" "}
                    {pick.catchUpTarget}
                  </p>
                  <div className="pick-facts">
                    {pick.nextRelease && (
                      <span className="chip chip--accent">
                        <CalendarClock /> Vol. {pick.upcomingVolume} in {pick.daysToRelease}d
                      </span>
                    )}
                    <span className="chip">Own to Vol. {pick.highestOwnedVolume || 0}</span>
                    <span className="chip">{Math.round(pick.ownershipRatio * 100)}% owned</span>
                    {pick.latestPurchaseDays != null && (
                      <span className="chip">Bought {pick.latestPurchaseDays}d ago</span>
                    )}
                  </div>
                  <div className="pick-actions">
                    {pick.firstUnread && (
                      <button
                        type="button"
                        className="btn btn--primary btn--sm"
                        onClick={() => ws.openVolume(pick.firstUnread.id)}
                      >
                        <BookOpen /> Open Vol. {pick.firstUnread.vol || ""}
                      </button>
                    )}
                    <button type="button" className="btn btn--sm" onClick={shuffle}>
                      <Shuffle /> Shuffle
                    </button>
                    <button
                      type="button"
                      className="btn btn--sm btn--ghost"
                      onClick={() => {
                        snooze(pick.key, 7);
                        toast(`Snoozed ${pick.title} for a week`, { type: "info" });
                      }}
                    >
                      <AlarmClockOff /> Snooze 7 days
                    </button>
                  </div>
                </div>
              </div>
              {readNext.backup && (
                <div className="pick-queue">
                  <span>
                    Up next: <strong style={{ color: "var(--text-1)" }}>{readNext.backup.title}</strong> ·{" "}
                    {readNext.backup.unreadCount} unread
                  </span>
                  <Link className="card-link" to={`/manga/series/${seriesSlug(readNext.backup.key)}`}>
                    Open series <ChevronRight />
                  </Link>
                </div>
              )}
            </>
          ) : (
            <p className="subtle chart-empty">
              {snoozedCount ? "Everything unread is snoozed." : "No unread volumes — the backlog is clear."}
            </p>
          )}
        </section>

        {/* Next release */}
        <section className="card dash-card span-4">
          <CardHead
            icon={CalendarClock}
            title="Next release"
            action={<More onClick={() => navigate("/dashboard/calendar?mode=releases")}>Calendar</More>}
          />
          {next ? (
            <>
              <div className="pick-title" style={{ fontSize: "var(--text-lg)" }}>
                {next.title}
              </div>
              <p className="pick-line">
                {next.date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
                {next.purchased ? " · pre-ordered" : ""}
              </p>
              <Countdown date={next.date} />
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                style={{ marginTop: 12, alignSelf: "flex-start" }}
                onClick={() => ws.openVolume(next.id)}
              >
                View volume <ChevronRight />
              </button>
            </>
          ) : (
            <p className="subtle chart-empty">No upcoming releases on the wishlist.</p>
          )}
        </section>

        {/* Reads per month */}
        <section className="card dash-card span-8">
          <CardHead
            icon={Gauge}
            title="Reads per month"
            sub={`${yearTotal} volume${yearTotal === 1 ? "" : "s"} finished in ${year}`}
            action={
              stats.years.length > 1 && (
                <select
                  className="select"
                  style={{ width: "auto", minHeight: 34, height: 34, fontSize: "var(--text-xs)", borderRadius: 999 }}
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  aria-label="Year"
                >
                  {stats.years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              )
            }
          />
          <ColumnChart
            ariaLabel={`Volumes read per month in ${year}`}
            unit="read"
            emptyText={`No reads logged in ${year} yet`}
            active={thisMonth}
            data={monthly.map((m) => ({
              label: m.label,
              value: m.value,
              tip: `${m.label} ${year}`,
              onClick: () =>
                navigate(`/dashboard/calendar?mode=reads&month=${year}-${String(m.month + 1).padStart(2, "0")}`),
            }))}
          />
        </section>

        {/* Weekday */}
        <section className="card dash-card span-4">
          <CardHead icon={Clock} title="Reading days" sub="All-time reads by weekday" />
          <ColumnChart
            ariaLabel="Reads by day of week"
            unit="read"
            data={stats.weekday}
            height={180}
            emptyText="No reads logged yet"
          />
        </section>

        {/* Purchase next */}
        <section className="card dash-card span-4 keep-half">
          <CardHead icon={ShoppingCart} title="Buy next" sub="Catch up before the next release" />
          {buy ? (
            <>
              <div className="pick-title" style={{ fontSize: "var(--text-lg)" }}>
                {buy.title}
              </div>
              <p className="pick-line">
                Missing {buy.missingCount} volume{buy.missingCount === 1 ? "" : "s"} before Vol. {buy.releaseVolume}
              </p>
              <div className="stat-rows" style={{ marginTop: 10 }}>
                <div className="stat-row">
                  <span>Estimated cost</span>
                  <strong>{buy.costEstimate ? money(buy.costEstimate) : "—"}</strong>
                </div>
                <div className="stat-row">
                  <span>Releases</span>
                  <strong>
                    {formatDate(buy.nextRelease.date, { month: "short", day: "numeric" })} · {buy.daysToRelease}d
                  </strong>
                </div>
                <div className="stat-row">
                  <span>Read so far</span>
                  <strong>{Math.round(buy.readPct * 100)}%</strong>
                </div>
              </div>
              <Link to={`/manga/series/${seriesSlug(buy.key)}`} className="card-link" style={{ marginTop: 8 }}>
                Open series <ChevronRight />
              </Link>
            </>
          ) : (
            <p className="subtle chart-empty">No gaps to fill before upcoming releases.</p>
          )}
        </section>

        {/* Pace */}
        <section className="card dash-card span-4 keep-half">
          <CardHead icon={BookCheck} title="Reading pace" />
          <div className="stat-rows">
            <div className="stat-row">
              <span>Read this year</span>
              <strong>{stats.daily.ytdCount}</strong>
            </div>
            <div className="stat-row">
              <span>Per day (this year)</span>
              <strong>{stats.daily.ytd != null ? stats.daily.ytd.toFixed(2) : "—"}</strong>
            </div>
            <div className="stat-row">
              <span>Per day (all time)</span>
              <strong>{stats.daily.lifetime != null ? stats.daily.lifetime.toFixed(2) : "—"}</strong>
            </div>
            <button type="button" className="stat-row" onClick={() => setDetail("timeToRead")}>
              <span>Purchase → read</span>
              <strong>{stats.purchaseToRead.avg != null ? `${stats.purchaseToRead.avg.toFixed(1)} days` : "—"}</strong>
            </button>
            <div className="stat-row">
              <span>Unread on the shelf</span>
              <strong>{stats.unreadCount.toLocaleString()}</strong>
            </div>
          </div>
        </section>

        {/* Ratings */}
        <section className="card dash-card span-4">
          <CardHead
            icon={Star}
            title="Ratings"
            sub="How volumes have been scored"
            action={<More onClick={() => setDetail("ratings")} />}
          />
          <ColumnChart
            ariaLabel="Rating distribution"
            unit="volumes"
            data={stats.ratings.map((r) => ({ label: r.label, value: r.value, tip: `${r.label} stars` }))}
            height={150}
            emptyText="No ratings yet"
          />
        </section>

        {[
          ["demographics", "Demographics", stats.topDemographics],
          ["publishers", "Publishers", stats.topPublishers],
          ["genres", "Genres", stats.topGenres],
        ].map(([key, title, list]) => (
          <section key={key} className="card dash-card span-4">
            <CardHead
              icon={Library}
              title={title}
              sub="By number of series"
              action={list.length > 5 && <More onClick={() => setDetail(key)} />}
            />
            <BarList items={list.slice(0, 5).map((r) => ({ label: r.name, value: r.count }))} />
          </section>
        ))}

        <section className="card dash-card span-12">
          <CardHead
            icon={BookOpen}
            title="Biggest series"
            sub="Volumes owned"
            action={<More onClick={() => setDetail("pages")}>Pages by series</More>}
          />
          <BarList
            items={stats.topSeries.map((s) => ({ label: s.title, value: s.volumes, key: s.key }))}
            onSelect={(it) => navigate(`/manga/series/${seriesSlug(it.key)}`)}
          />
        </section>
      </div>

      <DetailSheet type={detail} stats={stats} onClose={() => setDetail(null)} />
    </>
  );
}
