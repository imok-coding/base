import { useMemo, useState } from "react";
import { BookPlus, ExternalLink, RefreshCw, X } from "lucide-react";
import Cover from "../../../components/ui/Cover";
import { useFeedback } from "../../../components/ui/Feedback";
import { formatDate, timeAgo, todayISO } from "../../../lib/format";
import { useAuth } from "../../auth/AuthContext";
import { useManga } from "../../manga/MangaData";
import { useWorkspace } from "../../manga/Workspace";
import { saveEntries } from "../../manga/api";
import { EMPTY_ENTRY, nextVolumeTitle, seriesCovers } from "../../manga/model";

function prefill(r, info) {
  return {
    title: nextVolumeTitle(info?.display || r.series, r.vol),
    isbn: r.isbn,
    date: r.approx ? "" : r.date,
    authors: info?.authors || "",
    publisher: info?.publisher || "",
    demographic: info?.demographic || "",
    genre: info?.genre || "",
    subGenre: info?.subGenre || "",
    msrp: info?.msrp === "" || info?.msrp == null ? "" : String(info.msrp),
  };
}

function when(r) {
  if (r.approx) return formatDate(r.date, { month: "short", year: "numeric" });
  if (r.date <= todayISO()) return "Out now";
  const sameYear = r.date.slice(0, 4) === todayISO().slice(0, 4);
  return formatDate(
    r.date,
    sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" }
  );
}

/** New volumes found on Wikipedia for series in the library or wishlist. */
export default function NewVolumes({ check }) {
  const { user } = useAuth();
  const { toast, confirm } = useFeedback();
  const { library, wishlist, seriesInfo } = useManga();
  const ws = useWorkspace();
  const [adding, setAdding] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const covers = useMemo(() => seriesCovers([...library, ...wishlist]), [library, wishlist]);
  const { items, unmatched, checkedAt, job, run, dismiss } = check;

  const addAll = async () => {
    const ok = await confirm({
      title: `Add ${items.length} volumes to the wishlist?`,
      message: "They're added with the release date and ISBN from Wikipedia. Covers can be filled in from the Manager.",
      confirmLabel: "Add all",
    });
    if (!ok) return;
    setAdding(true);
    try {
      await saveEntries(
        items.map((r) => ({ list: "wishlist", form: { ...EMPTY_ENTRY, ...prefill(r, seriesInfo.get(r.seriesKey)) } })),
        { allVolumes: [...library, ...wishlist], seriesInfo, user }
      );
      toast(`Added ${items.length} volumes to the wishlist`);
    } catch (err) {
      console.error(err);
      toast("Couldn't add them, nothing was changed", { type: "error" });
    } finally {
      setAdding(false);
    }
  };

  const status = job
    ? `Checking Wikipedia... ${job.done}/${job.total}`
    : checkedAt
      ? `From Wikipedia · checked ${timeAgo(new Date(checkedAt))}`
      : "Not checked yet";

  return (
    <section className="card dash-card newvol">
      <div className="card-head">
        <div>
          <div className="card-title">
            <BookPlus /> New volumes
          </div>
          <div className="card-sub">{status}</div>
        </div>
        <div className="newvol-head-actions">
          {items.length > 1 && (
            <button type="button" className="btn btn--sm" onClick={addAll} disabled={adding || !!job}>
              {adding && <span className="spinner" />}
              Add all to wishlist
            </button>
          )}
          <button type="button" className="btn btn--sm btn--ghost" onClick={run} disabled={!!job}>
            {job ? <span className="spinner" /> : <RefreshCw />} Check now
          </button>
        </div>
      </div>

      {items.length > 0 && (
        <ul className="newvol-list">
          {(showAll ? items : items.slice(0, 6)).map((r) => (
            <li key={r.id} className="newvol-row">
              <Cover src={covers.get(r.seriesKey)} alt="" size={120} className="newvol-cover" />
              <div className="newvol-main">
                <strong className="clamp-1">
                  {r.series}, Vol. {r.vol}
                </strong>
                <span className="newvol-meta">
                  <span className={`chip ${r.date <= todayISO() ? "chip--read" : "chip--accent"}`}>{when(r)}</span>
                  {r.isbn && <span className="tabular">ISBN {r.isbn}</span>}
                  <a
                    href={`https://en.wikipedia.org/wiki/${encodeURIComponent(r.page)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Source <ExternalLink size={11} />
                  </a>
                </span>
              </div>
              <div className="newvol-actions">
                <button
                  type="button"
                  className="btn btn--sm btn--soft"
                  onClick={() => ws.actions.add("wishlist", prefill(r, seriesInfo.get(r.seriesKey)))}
                >
                  Add to wishlist
                </button>
                <button
                  type="button"
                  className="btn btn--sm btn--ghost btn--icon"
                  onClick={() => dismiss(r.id)}
                  aria-label={`Dismiss ${r.series}, Vol. ${r.vol}`}
                  title="Dismiss"
                >
                  <X />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {items.length > 6 && (
        <button type="button" className="card-link newvol-more" onClick={() => setShowAll(!showAll)}>
          {showAll ? "Show fewer" : `Show all ${items.length}`}
        </button>
      )}
      {!items.length && (
        <p className="subtle newvol-empty">
          {job ? "Looking up your series..." : "Nothing new found for your series right now."}
        </p>
      )}

      {unmatched.length > 0 && !job && (
        <details className="newvol-unmatched">
          <summary>{unmatched.length} series aren&apos;t on Wikipedia, so they&apos;re skipped</summary>
          <p>{unmatched.join(" · ")}</p>
        </details>
      )}
    </section>
  );
}
