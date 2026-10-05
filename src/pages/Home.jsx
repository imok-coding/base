import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BookCheck, BookOpen, Bookmark, CalendarClock, Gamepad2, Library, Sparkles } from "lucide-react";
import Cover from "../components/ui/Cover";
import { formatDate, relativeDays } from "../lib/format";
import { useManga } from "../features/manga/MangaData";
import { useGames } from "../features/games/GamesData";
import { GameCover } from "../features/games/components/GameTile";
import "../features/games/games.css";
import { MangaWorkspace, useWorkspace } from "../features/manga/Workspace";
import { groupSeries, seriesSlug } from "../features/manga/model";
import "../features/manga/manga.css";
import "./home.css";

function Stat({ label, value, icon: Icon, loading }) {
  return (
    <div className="home-stat">
      <Icon />
      <div>
        <div className="home-stat-value tabular">
          {loading ? <span className="skeleton" style={{ display: "inline-block", width: 48, height: 22 }} /> : value}
        </div>
        <div className="home-stat-label">{label}</div>
      </div>
    </div>
  );
}

function CoverRow({ items, onOpen, meta }) {
  return (
    <div className="cover-row" role="list">
      {items.map((v) => (
        <button type="button" role="listitem" key={v.id} className="cover-row-item" onClick={() => onOpen(v.id)}>
          <Cover src={v.cover} alt={v.title} size={420} />
          <span className="cover-row-title clamp-2">{v.series}</span>
          <span className="cover-row-meta">{meta(v)}</span>
        </button>
      ))}
    </div>
  );
}

function HomeInner() {
  const { publicLibrary, publicWishlist, loading } = useManga();
  const gamesData = useGames();
  // the home page shows what visitors see, so hidden games stay out for admins too
  const games = useMemo(() => gamesData.owned.filter((g) => !g.hidden), [gamesData.owned]);
  const wantedGames = gamesData.wishlist.filter((g) => !g.hidden).length;
  const gamePlatforms = new Set(games.map((g) => g.platform)).size;
  const gameMosaic = useMemo(
    () =>
      [...games]
        .filter((g) => g.cover)
        .sort((a, b) => (b.acquired || "").localeCompare(a.acquired || ""))
        .slice(0, 4),
    [games]
  );
  const ws = useWorkspace();

  useEffect(() => {
    document.title = "Tyler's Collection";
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const stats = useMemo(() => {
    const series = groupSeries(publicLibrary);
    const read = publicLibrary.filter((v) => v.read).length;
    return {
      volumes: publicLibrary.length,
      series: series.length,
      readPct: publicLibrary.length ? Math.round((read / publicLibrary.length) * 100) : 0,
      wishlist: publicWishlist.length,
    };
  }, [publicLibrary, publicWishlist]);

  const recentlyAdded = useMemo(
    () =>
      publicLibrary
        .filter((v) => v.datePurchased)
        .sort((a, b) => b.datePurchased.localeCompare(a.datePurchased) || b.vol - a.vol)
        .slice(0, 14),
    [publicLibrary]
  );
  const recentlyRead = useMemo(
    () =>
      publicLibrary
        .filter((v) => v.read && v.dateRead)
        .sort((a, b) => b.dateRead.localeCompare(a.dateRead))
        .slice(0, 14),
    [publicLibrary]
  );
  const upcoming = useMemo(
    () =>
      [...publicWishlist, ...publicLibrary]
        .filter((v) => v.date && v.date >= today)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 6),
    [publicWishlist, publicLibrary, today]
  );
  // latest cover from each of the most recently bought series
  const mosaic = useMemo(() => {
    const byPurchase = [...publicLibrary].sort((a, b) => (b.datePurchased || "").localeCompare(a.datePurchased || ""));
    const seen = new Set();
    const out = [];
    for (const v of byPurchase) {
      if (!v.cover || seen.has(v.seriesKey)) continue;
      seen.add(v.seriesKey);
      out.push(v);
      if (out.length === 5) break;
    }
    return out;
  }, [publicLibrary]);

  return (
    <div className="page home">
      <section className="home-hero">
        <div className="home-hero-art" aria-hidden="true" />
        <div className="home-hero-copy">
          <img
            className="home-avatar"
            src={`${import.meta.env.BASE_URL}icons/icon-192.png`}
            alt=""
            width="84"
            height="84"
          />
          <p className="page-eyebrow">im.ok&apos;s shelves</p>
          <h1 className="home-title">
            Tyler&apos;s Collection
            <span className="home-title-jp" lang="ja">
              タイラーのコレクション
            </span>
          </h1>
          <p className="home-bio">
            Hi, I&apos;m Tyler. This is where I keep track of every manga and game I own, what I&apos;m reading and
            playing, and what&apos;s next on the wishlist.
          </p>
          <div className="home-cta">
            <Link to="/manga" className="btn btn--primary btn--lg">
              <Library /> Browse the library
            </Link>
            <Link to="/manga?list=wishlist" className="btn btn--lg">
              <Bookmark /> Wishlist
            </Link>
          </div>
        </div>
        <div className="home-fan" aria-hidden="true">
          {mosaic.map((v, i) => (
            <div className="home-fan-card" style={{ "--i": i, "--n": mosaic.length }} key={v.id}>
              <Cover src={v.cover} alt="" size={420} eager />
            </div>
          ))}
        </div>
      </section>

      <section className="home-stats" aria-label="Collection stats">
        <Stat icon={BookOpen} label="Volumes owned" value={stats.volumes.toLocaleString()} loading={loading} />
        <Stat icon={Library} label="Series" value={stats.series} loading={loading} />
        <Stat icon={BookCheck} label="Read" value={`${stats.readPct}%`} loading={loading} />
        <Stat icon={Bookmark} label="On the wishlist" value={stats.wishlist} loading={loading} />
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Collections</h2>
        </div>
        <div className={`home-collections ${games.length ? "home-collections--even" : ""}`}>
          <Link to="/manga" className="collection-card card card--interactive">
            <div className="collection-mosaic" aria-hidden="true">
              {mosaic.slice(0, 4).map((v) => (
                <Cover key={v.id} src={v.cover} alt="" size={300} />
              ))}
            </div>
            <div className="collection-info">
              <div className="collection-icon">
                <BookOpen />
              </div>
              <h3>Manga</h3>
              <p className="muted">
                {stats.volumes.toLocaleString()} volumes · {stats.series} series · {stats.wishlist} wanted
              </p>
              <span className="section-link">
                Open library <ArrowRight />
              </span>
            </div>
          </Link>
          {games.length ? (
            <Link to="/games" className="collection-card card card--interactive">
              <div className="collection-mosaic collection-mosaic--games" aria-hidden="true">
                {gameMosaic.map((g) => (
                  <GameCover key={g.id} game={g} size={300} />
                ))}
              </div>
              <div className="collection-info">
                <div className="collection-icon">
                  <Gamepad2 />
                </div>
                <h3>Games</h3>
                <p className="muted">
                  {games.length.toLocaleString()} games · {gamePlatforms} platform{gamePlatforms === 1 ? "" : "s"}
                  {wantedGames ? ` · ${wantedGames} wanted` : ""}
                </p>
                <span className="section-link">
                  Open library <ArrowRight />
                </span>
              </div>
            </Link>
          ) : (
            <Link to="/games" className="collection-card collection-card--soon card card--interactive">
              <div className="collection-info">
                <div className="collection-icon">
                  <Gamepad2 />
                </div>
                <h3>
                  Games <span className="nav-soon">Soon</span>
                </h3>
                <p className="muted">Physical games first, digital libraries later.</p>
                <span className="section-link">
                  Preview <ArrowRight />
                </span>
              </div>
            </Link>
          )}
        </div>
      </section>

      {recentlyAdded.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">
              <Sparkles /> Recently added
            </h2>
            <Link to="/manga?view=volumes&sort=purchased" className="section-link">
              See all <ArrowRight />
            </Link>
          </div>
          <CoverRow
            items={recentlyAdded}
            onOpen={ws.openVolume}
            meta={(v) => (v.vol ? `Vol. ${v.vol}` : formatDate(v.datePurchased))}
          />
        </section>
      )}

      <div className="home-split">
        {upcoming.length > 0 && (
          <section className="section">
            <div className="section-head">
              <h2 className="section-title">
                <CalendarClock /> Coming up
              </h2>
              <Link to="/manga?list=wishlist&view=volumes&sort=release" className="section-link">
                Wishlist <ArrowRight />
              </Link>
            </div>
            <ul className="release-list list-reset card">
              {upcoming.map((v) => {
                const d = new Date(`${v.date}T00:00:00`);
                return (
                  <li key={v.id}>
                    <button type="button" className="release-row" onClick={() => ws.openVolume(v.id)}>
                      <span className="release-date">
                        <span>{d.toLocaleDateString(undefined, { month: "short" })}</span>
                        <strong>{d.getDate()}</strong>
                      </span>
                      <span className="release-text">
                        <span className="release-title clamp-1">{v.series}</span>
                        <span className="release-meta">
                          {v.vol ? `Vol. ${v.vol} · ` : ""}
                          {relativeDays(v.date)}
                        </span>
                      </span>
                      {v.datePurchased && <span className="chip chip--read">Pre-ordered</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {recentlyRead.length > 0 && (
          <section className="section">
            <div className="section-head">
              <h2 className="section-title">
                <BookCheck /> Recently read
              </h2>
              <Link to="/manga?view=volumes&sort=read" className="section-link">
                See all <ArrowRight />
              </Link>
            </div>
            <ul className="release-list list-reset card">
              {recentlyRead.slice(0, 6).map((v) => (
                <li key={v.id}>
                  <Link className="release-row" to={`/manga/series/${seriesSlug(v.seriesKey)}`}>
                    <Cover src={v.cover} alt="" size={160} className="release-thumb" />
                    <span className="release-text">
                      <span className="release-title clamp-1">{v.series}</span>
                      <span className="release-meta">
                        {v.vol ? `Vol. ${v.vol} · ` : ""}
                        {relativeDays(v.dateRead)}
                      </span>
                    </span>
                    {v.rating ? <span className="chip">★ {Number(v.rating).toFixed(1)}</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <MangaWorkspace>
      <HomeInner />
    </MangaWorkspace>
  );
}
