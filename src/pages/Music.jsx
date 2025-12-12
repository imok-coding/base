import { useEffect, useRef, useState } from "react";
import "../styles/music.css";

export default function Music() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [slideStart, setSlideStart] = useState(0);
  const [combined, setCombined] = useState([]);
  const [progressKey, setProgressKey] = useState(0);
  const carouselTimer = useRef(null);

  useEffect(() => {
    document.title = "Music | im.ok";
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("https://music-api-worker.imokissick.workers.dev/music");
        if (!res.ok) throw new Error("Worker fetch failed");
        const json = await res.json();
        if (cancelled) return;
        const normalized = (Array.isArray(json.combined) ? json.combined : []).map((item) => ({
          ...item,
          releaseDate: item.releaseDate ? new Date(item.releaseDate) : new Date(),
        }));
        setCombined(normalized);
      } catch (err) {
        console.error(err);
        if (!cancelled) setError("Failed to load music feeds.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleCount = Math.min(4, Math.max(1, combined.length));
  const pageCount = visibleCount ? Math.ceil(combined.length / visibleCount) : 0;

  const resetTimer = () => {
    if (carouselTimer.current) clearInterval(carouselTimer.current);
    if (!combined.length) return;
    setProgressKey((k) => k + 1);
    carouselTimer.current = setInterval(() => {
      setSlideStart((prev) => {
        const currentPage = Math.floor(prev / visibleCount);
        const nextPage = (currentPage + 1) % pageCount;
        return (nextPage * visibleCount) % combined.length;
      });
      setProgressKey((k) => k + 1);
    }, 15000);
  };

  useEffect(() => {
    if (!combined.length) return;
    resetTimer();
    return () => {
      if (carouselTimer.current) clearInterval(carouselTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combined, visibleCount]);

  const goPage = (delta) => {
    if (!combined.length) return;
    setSlideStart((prev) => {
      const currentPage = Math.floor(prev / visibleCount);
      const nextPage = (currentPage + delta + pageCount) % pageCount;
      return (nextPage * visibleCount) % combined.length;
    });
    resetTimer();
  };

  const goDot = (idx) => {
    if (!combined.length) return;
    setSlideStart((idx * visibleCount) % combined.length);
    resetTimer();
  };

  const handlePlay = (item) => (e) => {
    e.preventDefault();
    const isSpotify = item.source === "spotify";
    const appUrl = isSpotify ? `spotify:album:${item.id}` : item.url;
    const webUrl = item.url;
    try {
      const t = setTimeout(() => {
        window.open(webUrl, "_blank", "noopener,noreferrer");
      }, 600);
      window.location.href = appUrl;
      setTimeout(() => clearTimeout(t), 800);
    } catch (err) {
      window.open(webUrl, "_blank", "noopener,noreferrer");
    }
  };

  const hero = combined[0];
  const cardArtStyle = (url) =>
    url
      ? {
          backgroundImage: `url(${url})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }
      : {};

  const heroSourceLabel = hero ? (hero.source === "spotify" ? "Spotify" : "SoundCloud") : "";

  return (
    <main className="page music-page">
      <header className="music-hero">
        <div className="music-hero-content">
          <p className="music-pill">im.ok &bull; Artist</p>
          <h1>{hero ? hero.title : "Latest & Greatest"}</h1>
          <p className="music-sub">
            Check out my latest song. I know it's been almost a whole year since I've released. I have been on a much needed hiatus. 
            I felt the whole world crumbling around me and had no time to breathe so this is why I took a break. Here's to 2026!
          </p>
          {hero && (
            <div className="music-badges">
              <span>{heroSourceLabel}</span>
            </div>
          )}
        </div>
        <div className="music-hero-embed">
          <div className="music-hero-art" style={cardArtStyle(hero?.artwork)}>
            {!hero?.artwork && <div className="music-hero-art-fallback">Artwork</div>}
            {hero && (
              <button
                className="music-link music-play hero-play"
                aria-label={`Play ${hero.title}`}
                onClick={handlePlay(hero)}
              />
            )}
          </div>
        </div>
      </header>

      <section className="music-section">
        <div className="music-section-header">
          <h2>Releases</h2>
        </div>
        {error && <div className="music-error">{error}</div>}
        {loading && <div className="music-loading">Loading music feeds...</div>}
        {!loading && combined.length === 0 && (
          <div className="music-empty">Connect Spotify/SoundCloud tokens to see live releases.</div>
        )}
        {!loading && combined.length > 0 && (
          <>
            <div className="music-carousel-wrap">
              <button className="music-nav left" onClick={() => goPage(-1)} aria-label="Previous releases">
                &lsaquo;
              </button>
              <div className="music-carousel">
                {Array.from({ length: visibleCount }).map((_, offset) => {
                  const item = combined[(slideStart + offset) % combined.length];
                  if (!item) return null;
                  return (
                    <div className="music-card" key={`${item.id}-${offset}`}>
                      <div className="music-card-art" style={cardArtStyle(item.artwork)} />
                      <div className="music-card-body">
                        <div className="music-card-title">{item.title}</div>
                        <div className="music-card-actions">
                          <button
                            className="music-link music-play"
                            aria-label={`Play ${item.title}`}
                            onClick={handlePlay(item)}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <button className="music-nav right" onClick={() => goPage(1)} aria-label="Next releases">
                &rsaquo;
              </button>
            </div>
            <div className="music-dots">
              {Array.from({ length: pageCount }).map((_, idx) => {
                const active = Math.floor(slideStart / visibleCount) === idx;
                const fillKey = active ? `${idx}-${progressKey}` : `${idx}-idle`;
                return (
                  <button
                    key={idx}
                    className={`dot ${active ? "active" : ""}`}
                    onClick={() => goDot(idx)}
                    aria-label={`Go to set ${idx + 1}`}
                  >
                    <span key={fillKey} className="dot-fill" />
                  </button>
                );
              })}
            </div>
          </>
        )}
      </section>

      <div className="music-feeds-row">
        <section className="music-section">
          <div className="music-section-header">
            <h2>Spotify</h2>
          </div>
          <div className="music-embed-card">
            <iframe
              title="Spotify Artist"
              src="https://open.spotify.com/embed/artist/00sbWLxYLDs8i5BLQL9Qdo?utm_source=generator&theme=0"
              width="100%"
              height="400"
              frameBorder="0"
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              loading="lazy"
            />
          </div>
        </section>

        <section className="music-section">
          <div className="music-section-header">
            <h2>SoundCloud</h2>
          </div>
          <div className="music-embed-card">
            <iframe
              title="SoundCloud Player"
              width="100%"
              height="400"
              scrolling="no"
              frameBorder="no"
              allow="autoplay"
              src="https://w.soundcloud.com/player/?url=https%3A//soundcloud.com/imxk&color=%23ff69b4&auto_play=false&hide_related=false&show_comments=true&show_user=true&show_reposts=false&show_teaser=true&visual=true"
            />
          </div>
        </section>
      </div>
    </main>
  );
}
