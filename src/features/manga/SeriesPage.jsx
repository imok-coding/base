import { useEffect, useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Bookmark, CheckSquare, Eye, EyeOff, Library, Pencil, Plus, SearchX } from "lucide-react";
import Cover from "../../components/ui/Cover";
import Empty from "../../components/ui/Empty";
import StarRating from "../../components/ui/StarRating";
import { coverSrc } from "../../lib/images";
import { formatDate, money, relativeDays } from "../../lib/format";
import { useAuth } from "../auth/AuthContext";
import { useManga } from "./MangaData";
import { MangaWorkspace, useWorkspace } from "./Workspace";
import { formatVolumeRange, groupSeries, sumBy } from "./model";
import { VolumeTile } from "./components/Tiles";
import "./manga.css";

function VolumeSection({ title, icon: Icon, volumes, ws }) {
  if (!volumes.length) return null;
  return (
    <section className="section">
      <div className="section-head">
        <h2 className="section-title">
          <Icon /> {title}{" "}
          <span className="subtle tabular" style={{ fontWeight: 600, fontSize: "var(--text-md)" }}>
            {volumes.length}
          </span>
        </h2>
      </div>
      <div className="tile-grid tile-grid--volumes">
        {volumes.map((v) => (
          <VolumeTile
            key={v.id}
            v={v}
            isAdmin={ws.isAdmin}
            showSeries={false}
            selectMode={ws.selectMode}
            selected={ws.selected.has(v.id)}
            onToggle={ws.toggle}
            onOpen={ws.openVolume}
          />
        ))}
      </div>
    </section>
  );
}

function SeriesInner() {
  const { seriesKey: slug } = useParams();
  const [params] = useSearchParams();
  const key = decodeURIComponent(slug || "");
  const { isAdmin } = useAuth();
  const data = useManga();
  const ws = useWorkspace();

  const owned = useMemo(() => data.publicLibrary.filter((v) => v.seriesKey === key), [data.publicLibrary, key]);
  const wanted = useMemo(() => data.publicWishlist.filter((v) => v.seriesKey === key), [data.publicWishlist, key]);
  const all = useMemo(() => [...owned, ...wanted], [owned, wanted]);
  const summary = useMemo(() => (all.length ? groupSeries(all)[0] : null), [all]);
  const ownedSummary = useMemo(() => (owned.length ? groupSeries(owned)[0] : null), [owned]);
  const { setVisibleIds } = ws;
  useEffect(() => setVisibleIds(all.map((v) => v.id)), [all, setVisibleIds]);

  useEffect(() => {
    document.title = `${summary?.title || "Series"} · Tyler's Collection`;
  }, [summary?.title]);

  const backTo = params.get("list") === "wishlist" ? "/manga?list=wishlist" : "/manga";

  if (data.loading) {
    return (
      <div className="page">
        <div className="series-hero">
          <div className="cover skeleton" />
          <div style={{ display: "grid", gap: 12 }}>
            <div className="skeleton" style={{ height: 36, width: "60%" }} />
            <div className="skeleton" style={{ height: 16, width: "40%" }} />
          </div>
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="page">
        <Empty
          icon={SearchX}
          title="Series not found"
          action={
            <Link to="/manga" className="btn btn--soft">
              Back to Manga
            </Link>
          }
        >
          It may have been renamed or removed.
        </Empty>
      </div>
    );
  }

  const readCount = owned.filter((v) => v.read).length;
  const pct = owned.length ? Math.round((readCount / owned.length) * 100) : 0;
  const range = formatVolumeRange(owned.flatMap((v) => v.volumes));
  const tags = [
    summary.publisher,
    summary.demographic,
    summary.genre,
    owned[0]?.subGenre || wanted[0]?.subGenre,
  ].filter(Boolean);
  const spent = sumBy(owned, (v) => v.amountPaid);
  const nextRelease = summary.nextRelease;

  return (
    <div className="page">
      <Link to={backTo} className="back-link">
        <ArrowLeft /> Manga
      </Link>

      <section className="series-hero">
        {summary.cover && (
          <div className="series-hero-bg" style={{ backgroundImage: `url("${coverSrc(summary.cover, 300)}")` }} />
        )}
        <Cover src={summary.cover} alt={summary.title} size={700} eager />
        <div>
          <h1 className="series-hero-title">{summary.title}</h1>
          {summary.authors && <p className="series-hero-authors">{summary.authors}</p>}
          {tags.length > 0 && (
            <div className="volume-chips">
              {tags.map((t) => (
                <span className="chip" key={t}>
                  {t}
                </span>
              ))}
              {isAdmin && summary.hidden && (
                <span className="chip">
                  <EyeOff /> Hidden
                </span>
              )}
            </div>
          )}
          <div className="series-stats">
            <div>
              <div className="series-stat-label">Owned</div>
              <div className="series-stat-value">{owned.length}</div>
            </div>
            {wanted.length > 0 && (
              <div>
                <div className="series-stat-label">Wishlist</div>
                <div className="series-stat-value">{wanted.length}</div>
              </div>
            )}
            {range && (
              <div>
                <div className="series-stat-label">Volumes</div>
                <div className="series-stat-value" style={{ fontSize: "var(--text-md)", paddingTop: 3 }}>
                  {range.replace(/^Vols?\. /, "")}
                </div>
              </div>
            )}
            {ownedSummary?.avgRating > 0 && (
              <div>
                <div className="series-stat-label">Avg rating</div>
                <StarRating value={Math.round(ownedSummary.avgRating * 2) / 2} size={16} />
              </div>
            )}
            {isAdmin && spent > 0 && (
              <div>
                <div className="series-stat-label">Spent</div>
                <div className="series-stat-value">{money(spent, { whole: true })}</div>
              </div>
            )}
            {nextRelease && (
              <div>
                <div className="series-stat-label">Next release</div>
                <div
                  className="series-stat-value"
                  style={{ fontSize: "var(--text-md)", paddingTop: 3 }}
                  title={formatDate(nextRelease)}
                >
                  {formatDate(nextRelease, { month: "short", day: "numeric" })}{" "}
                  <span className="subtle">({relativeDays(nextRelease)})</span>
                </div>
              </div>
            )}
          </div>
          {owned.length > 0 && (
            <div className="series-progress">
              <div className="series-progress-label">
                <span>Reading progress</span>
                <span className="tabular">
                  {readCount}/{owned.length} · {pct}%
                </span>
              </div>
              <div className="progress">
                <span style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}
          {isAdmin && (
            <div className="series-actions">
              <button type="button" className="btn btn--primary" onClick={() => ws.actions.addNext(key, "library")}>
                <Plus /> Add next volume
              </button>
              <button type="button" className="btn" onClick={() => ws.actions.bulk(all)}>
                <Pencil /> Edit series
              </button>
              <button
                type="button"
                className={`btn ${ws.selectMode ? "is-active" : ""}`}
                onClick={() => ws.setSelectMode(!ws.selectMode)}
              >
                <CheckSquare /> Select
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => ws.actions.setHidden(all, !summary.hidden)}
              >
                {summary.hidden ? <Eye /> : <EyeOff />}
                {summary.hidden ? "Show to visitors" : "Hide series"}
              </button>
            </div>
          )}
        </div>
      </section>

      <VolumeSection title="On the shelf" icon={Library} volumes={owned} ws={ws} />
      <VolumeSection title="Wishlist" icon={Bookmark} volumes={wanted} ws={ws} />
    </div>
  );
}

export default function SeriesPage() {
  return (
    <MangaWorkspace>
      <SeriesInner />
    </MangaWorkspace>
  );
}
