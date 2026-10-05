import Sheet from "../../components/ui/Sheet";
import { money } from "../../lib/format";
import { useSticky } from "../manga/hooks";

function Table({ head, rows, numeric = [] }) {
  if (!rows.length) return <p className="subtle">Nothing to show yet.</p>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={h} className={numeric.includes(i) ? "num" : undefined}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((c, ci) => (
                <td key={ci} className={numeric.includes(ci) ? "num" : undefined}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Summary({ items }) {
  return (
    <div className="stat-rows" style={{ marginBottom: 18 }}>
      {items.map(([label, value]) => (
        <div className="stat-row" key={label}>
          <span>{label}</span>
          <strong className="tabular">{value}</strong>
        </div>
      ))}
    </div>
  );
}

const TITLES = {
  publishers: ["Publishers", "Ranked by number of series"],
  genres: ["Genres", "Ranked by number of series"],
  demographics: ["Demographics", "Ranked by number of series"],
  timeToRead: ["Purchase to read", "How long volumes wait on the shelf"],
  value: ["Collection value", "MSRP vs what was paid, by series"],
  pages: ["Pages", "Read vs owned, by series"],
  ratings: ["Ratings", "Average rating per series"],
  releases: ["Releases", "Every dated volume, library and wishlist"],
};

function body(type, stats) {
  const series = [...stats.seriesMap.values()];
  switch (type) {
    case "publishers":
    case "genres":
    case "demographics": {
      const list = { publishers: stats.topPublishers, genres: stats.topGenres, demographics: stats.topDemographics }[
        type
      ];
      return <Table head={["#", "Name", "Series"]} numeric={[2]} rows={list.map((r, i) => [i + 1, r.name, r.count])} />;
    }
    case "timeToRead": {
      const p = stats.purchaseToRead;
      return (
        <>
          <Summary
            items={[
              ["Average wait", p.avg == null ? "-" : `${p.avg.toFixed(1)} days`],
              ["Volumes with both dates", p.count],
            ]}
          />
          <Table
            head={["Series", "Avg", "Longest", "Shortest", "Reads"]}
            numeric={[1, 2, 3, 4]}
            rows={p.series.map((r) => [
              r.title,
              `${r.avg.toFixed(1)}d`,
              `${Math.round(r.max)}d`,
              `${Math.round(r.min)}d`,
              r.count,
            ])}
          />
        </>
      );
    }
    case "value": {
      const v = stats.value;
      const rows = series
        .filter((s) => s.msrp || s.paid || s.collectible)
        .sort((a, b) => b.msrp + b.collectible - (a.msrp + a.collectible));
      return (
        <>
          <Summary
            items={[
              ["Total MSRP", money(v.msrp)],
              ["Total paid", money(v.paid)],
              [
                "Saved vs MSRP",
                `${money(v.msrp - v.paid)}${v.savingsPct != null ? ` (${v.savingsPct.toFixed(1)}%)` : ""}`,
              ],
              ["Collectible value", money(v.collectible)],
            ]}
          />
          <p className="subtle" style={{ fontSize: "var(--text-xs)", margin: "-8px 0 14px" }}>
            Volumes without a recorded price count at MSRP in the totals.
          </p>
          <Table
            head={["Series", "MSRP", "Paid", "Collectible", "Vols"]}
            numeric={[1, 2, 3, 4]}
            rows={rows.map((s) => [
              s.title,
              money(s.msrp),
              money(s.paid),
              s.collectible ? money(s.collectible) : "-",
              s.volumes,
            ])}
          />
        </>
      );
    }
    case "pages": {
      const rows = series.filter((s) => s.pages > 0).sort((a, b) => b.pages - a.pages);
      return (
        <>
          <Summary
            items={[
              ["Pages owned", stats.pages.total.toLocaleString()],
              ["Pages read", stats.pages.read.toLocaleString()],
              ["Completion", stats.pages.total ? `${((stats.pages.read / stats.pages.total) * 100).toFixed(1)}%` : "-"],
            ]}
          />
          <Table
            head={["Series", "Read", "Total", "%", "Vols"]}
            numeric={[1, 2, 3, 4]}
            rows={rows.map((s) => [
              s.title,
              s.readPages.toLocaleString(),
              s.pages.toLocaleString(),
              `${Math.round((s.readPages / s.pages) * 100)}%`,
              s.volumes,
            ])}
          />
        </>
      );
    }
    case "ratings": {
      const rows = series
        .filter((s) => s.ratingCount)
        .map((s) => ({ title: s.title, avg: s.ratingSum / s.ratingCount, count: s.ratingCount }))
        .sort((a, b) => b.avg - a.avg || b.count - a.count);
      return (
        <>
          <Summary
            items={[["Average across rated series", stats.avgRating == null ? "-" : stats.avgRating.toFixed(2)]]}
          />
          <Table
            head={["Series", "Average", "Ratings"]}
            numeric={[1, 2]}
            rows={rows.map((r) => [r.title, r.avg.toFixed(2), r.count])}
          />
        </>
      );
    }
    case "releases": {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const upcoming = stats.releases.filter((r) => r.date >= start);
      const rows = upcoming.length ? upcoming : stats.releases.slice(-50).reverse();
      return (
        <Table
          head={["Date", "Title", "Status"]}
          rows={rows.map((r) => [
            r.date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }),
            r.title,
            r.source === "library" ? "Owned" : r.purchased ? "Pre-ordered" : "Wishlist",
          ])}
        />
      );
    }
    default:
      return null;
  }
}

export default function DetailSheet({ type, stats, onClose }) {
  const kept = useSticky(type);
  const [title, subtitle] = TITLES[kept] || ["", ""];
  return (
    <Sheet open={!!type} onClose={onClose} title={title} subtitle={subtitle} width={720}>
      {kept && body(kept, stats)}
    </Sheet>
  );
}
