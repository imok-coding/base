import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarX, ChevronLeft, ChevronRight } from "lucide-react";
import Sheet from "../../../components/ui/Sheet";
import Cover from "../../../components/ui/Cover";
import Empty from "../../../components/ui/Empty";
import { parseDate, toISODate } from "../../../lib/format";
import { useManga } from "../../manga/MangaData";
import { useWorkspace } from "../../manga/Workspace";

const MODES = {
  releases: { label: "Releases", noun: "release", empty: "No releases this month." },
  reads: { label: "Reads", noun: "volume read", empty: "Nothing read this month." },
  purchases: { label: "Purchases", noun: "purchase", empty: "No purchases this month." },
};
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function useItemsByDay(mode, stats, library, wishlist) {
  return useMemo(() => {
    const map = new Map();
    const add = (date, item) => {
      if (!date) return;
      const key = toISODate(date);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    };
    if (mode === "releases") {
      for (const r of stats.releases)
        add(r.date, { id: r.id, title: r.title, done: r.source === "library" || r.purchased });
    } else if (mode === "reads") {
      for (const v of library) if (v.read) add(parseDate(v.dateRead), { id: v.id, title: v.title, done: true });
    } else {
      for (const v of [...library, ...wishlist])
        add(parseDate(v.datePurchased), { id: v.id, title: v.title, done: v.kind === "library" });
    }
    for (const list of map.values()) list.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
    return map;
  }, [mode, stats.releases, library, wishlist]);
}

export default function CalendarView({ stats }) {
  const { library, wishlist, byId } = useManga();
  const ws = useWorkspace();
  const [params, setParams] = useSearchParams();
  const mode = MODES[params.get("mode")] ? params.get("mode") : "releases";
  const monthParam = params.get("month");
  const today = new Date();
  const [y, m] =
    monthParam && /^\d{4}-\d{2}$/.test(monthParam)
      ? monthParam.split("-").map(Number)
      : [today.getFullYear(), today.getMonth() + 1];
  const month = new Date(y, m - 1, 1);
  const [openDay, setOpenDay] = useState(null);

  const byDay = useItemsByDay(mode, stats, library, wishlist);
  const todayKey = toISODate(today);

  const set = (key, value) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true }
    );
  const shiftMonth = (delta) => {
    const d = new Date(month.getFullYear(), month.getMonth() + delta, 1);
    set("month", `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const cells = [];
  for (let i = 0; i < month.getDay(); i += 1) cells.push(null);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d += 1) {
    const date = new Date(month.getFullYear(), month.getMonth(), d);
    const key = toISODate(date);
    cells.push({ d, date, key, items: byDay.get(key) || [] });
  }
  while (cells.length % 7) cells.push(null);
  const withItems = cells.filter((c) => c?.items.length);
  const total = withItems.reduce((s, c) => s + c.items.length, 0);
  const isCurrentMonth = month.getFullYear() === today.getFullYear() && month.getMonth() === today.getMonth();

  const day = openDay ? cells.find((c) => c?.key === openDay) : null;

  return (
    <section className="card">
      <div className="cal-head">
        <div className="cal-month">
          <button
            type="button"
            className="btn btn--icon btn--ghost"
            onClick={() => shiftMonth(-1)}
            aria-label="Previous month"
          >
            <ChevronLeft />
          </button>
          <h2>{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2>
          <button
            type="button"
            className="btn btn--icon btn--ghost"
            onClick={() => shiftMonth(1)}
            aria-label="Next month"
          >
            <ChevronRight />
          </button>
          {!isCurrentMonth && (
            <button type="button" className="btn btn--sm" onClick={() => set("month", "")}>
              Today
            </button>
          )}
        </div>
        <div className="segmented segmented--sm" role="tablist" aria-label="Calendar type">
          {Object.entries(MODES).map(([key, def]) => (
            <button
              type="button"
              role="tab"
              key={key}
              aria-selected={mode === key}
              onClick={() => set("mode", key === "releases" ? "" : key)}
            >
              {def.label}
            </button>
          ))}
        </div>
      </div>
      <p className="subtle" style={{ fontSize: "var(--text-sm)", marginTop: -6, marginBottom: 14 }}>
        {total ? `${total} ${MODES[mode].noun}${total === 1 ? "" : "s"} this month` : MODES[mode].empty}
      </p>

      <div className="cal-grid" aria-label={`${MODES[mode].label} calendar`}>
        {DOW.map((d) => (
          <div key={d} className="cal-dow">
            {d}
          </div>
        ))}
        {cells.map((c, i) =>
          !c ? (
            <div key={`pad-${i}`} className="cal-day is-pad" />
          ) : (
            <button
              type="button"
              key={c.key}
              className={`cal-day ${c.key === todayKey ? "is-today" : ""}`}
              onClick={() => c.items.length && setOpenDay(c.key)}
              aria-label={`${c.date.toLocaleDateString(undefined, { month: "long", day: "numeric" })}: ${c.items.length} ${MODES[mode].noun}${c.items.length === 1 ? "" : "s"}`}
              disabled={!c.items.length}
              style={!c.items.length ? { cursor: "default" } : undefined}
            >
              <span className="cal-num">{c.d}</span>
              {c.items.slice(0, 3).map((it) => (
                <span key={it.id} className={`cal-item ${it.done ? "is-done" : ""}`} title={it.title}>
                  <span className="dot" />
                  <span>{it.title}</span>
                </span>
              ))}
              {c.items.length > 3 && <span className="cal-more">+{c.items.length - 3} more</span>}
            </button>
          )
        )}
      </div>

      <div className="agenda">
        {withItems.length ? (
          withItems.map((c) => (
            <div key={c.key} className={`agenda-day ${c.key === todayKey ? "is-today" : ""}`}>
              <div className="agenda-date">
                <span>{DOW[c.date.getDay()]}</span>
                <strong>{c.d}</strong>
              </div>
              <div className="agenda-items">
                {c.items.map((it) => (
                  <button
                    type="button"
                    key={it.id}
                    className={`cal-item ${it.done ? "is-done" : ""}`}
                    onClick={() => ws.openVolume(it.id)}
                  >
                    <span className="dot" />
                    <span>{it.title}</span>
                  </button>
                ))}
              </div>
            </div>
          ))
        ) : (
          <Empty icon={CalendarX}>{MODES[mode].empty}</Empty>
        )}
      </div>

      {mode !== "reads" && (
        <div className="cal-legend">
          <span>
            <span className="dot" style={{ color: "var(--read)" }} />{" "}
            {mode === "releases" ? "Owned or pre-ordered" : "Library"}
          </span>
          <span>
            <span className="dot" style={{ color: "var(--accent)" }} />{" "}
            {mode === "releases" ? "Not bought yet" : "Wishlist pre-order"}
          </span>
        </div>
      )}

      <Sheet
        open={!!day}
        onClose={() => setOpenDay(null)}
        title={day?.date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        subtitle={day ? `${day.items.length} ${MODES[mode].noun}${day.items.length === 1 ? "" : "s"}` : ""}
        width={520}
      >
        <div className="day-list">
          {day?.items.map((it) => {
            const v = byId.get(it.id);
            return (
              <button
                type="button"
                key={it.id}
                onClick={() => {
                  setOpenDay(null);
                  ws.openVolume(it.id);
                }}
              >
                <Cover src={v?.cover} alt="" size={160} />
                <span style={{ minWidth: 0 }}>
                  <span
                    className="release-title clamp-2"
                    style={{ display: "block", fontWeight: 700, fontSize: "var(--text-sm)" }}
                  >
                    {it.title}
                  </span>
                  <span className="subtle" style={{ fontSize: "var(--text-xs)" }}>
                    {v?.kind === "wishlist" ? (v.datePurchased ? "Pre-ordered" : "Wishlist") : "Library"}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </Sheet>
    </section>
  );
}
