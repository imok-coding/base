import { useEffect, useState } from "react";

export default function Home() {
  const [title, setTitle] = useState("Tyler's Collection Homepage");

  useEffect(() => {
    const jp = "タイラーのコレクション";
    const en = "Tyler's Collection Homepage";
    const timers = [];

    const typeText = (text, offset = 0, step = 70) => {
      for (let i = 0; i <= text.length; i += 1) {
        timers.push(
          setTimeout(() => {
            setTitle(text.slice(0, i) || " ");
          }, offset + i * step)
        );
      }
      return offset + text.length * step;
    };

    let t = 0;
    // Type Japanese, pause, clear, then type English
    t = typeText(jp, t, 70);
    t += 500;
    timers.push(
      setTimeout(() => {
        setTitle("");
      }, t)
    );
    t += 200;
    typeText(en, t, 70);

    return () => {
      timers.forEach((id) => clearTimeout(id));
    };
  }, []);

  return (
    <main className="page">
      <header style={{ textAlign: 'center', marginTop: '32px', marginBottom: '24px' }}>
        <h1
          style={{
            margin: 0,
            fontSize: '2.2rem',
            color: '#ffb6c1',
            textShadow: '0 0 8px rgba(255,182,193,0.8)',
          }}
        >
          Tyler&apos;s Collection Homepage
        </h1>
        <p style={{ margin: '6px 0 0', color: 'var(--text-soft)', fontSize: '0.95rem' }}>
          This is my personal webpage to see what is on my shelves, wishlists, and TCG collections.
        </p>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '10px',
            padding: '8px 14px',
            borderRadius: '999px',
            border: '1px solid rgba(255,182,193,0.5)',
            background: 'linear-gradient(135deg, rgba(255,182,193,0.18), rgba(43,15,29,0.9))',
            boxShadow: '0 8px 24px rgba(0,0,0,0.55)',
            marginTop: '14px',
            fontSize: '0.78rem',
            color: '#ffe6ed',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            fontWeight: 700,
          }}
        >
          <span role="img" aria-label="manga">📚</span> Manga
          <span style={{ color: 'rgba(255,182,193,0.6)' }}>•</span>
          <span role="img" aria-label="anime">🎬</span> Anime
          <span style={{ color: 'rgba(255,182,193,0.6)' }}>•</span>
          <span role="img" aria-label="tcg">🃏</span> TCG
        </div>
      </header>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 3fr)',
          gap: '20px',
          marginTop: '24px',
        }}
      >
        {/* About card */}
        <article className="card">
          <h2 style={{ marginTop: 0, marginBottom: '8px', fontSize: '1.2rem', color: '#ffb6c1' }}>
            About Me
          </h2>
          <p style={{ margin: 0, color: 'var(--text-soft)', fontSize: '0.9rem', lineHeight: 1.5 }}>
            Hey, I am Tyler and I go by <strong>im.ok</strong>. I hoard manga, binge anime, and collect trading cards.
            This site is where I track everything: volumes on my shelves, finished shows, and my TCG collection as they all slowly grow.
          </p>
          <p style={{ marginTop: '10px', color: 'var(--text-soft)', fontSize: '0.9rem' }}>
            You&apos;ll find my reading history, and collection values across the different pages - it&apos;s
            basically my personal library dashboard.
          </p>
          <div
            style={{
              marginTop: '12px',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '6px',
            }}
          >
            <span className="pill">Manga library</span>
            <span className="pill">My Anime List (MAL)</span>
            <span className="pill">Pokemon &amp; One Piece TCG</span>
            <span className="pill">Data Nerd</span>
          </div>
        </article>

        {/* Sections card */}
        <article className="card">
          <h2 style={{ marginTop: 0, marginBottom: '8px', fontSize: '1.2rem', color: '#ffb6c1' }}>
            Explore these pages
          </h2>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: '14px',
              marginTop: '10px',
            }}
          >
            <a href="/base/manga" className="section-card">
              <h3>Manga Library</h3>
              <p>Full manga collection &amp; wishlist.</p>
              <div className="section-chip-row">
                <span className="section-chip accent">Library &amp; wishlist</span>
              </div>
            </a>

            <a href="/base/anime" className="section-card">
              <h3>Anime Library</h3>
              <p>The entire watched, plan to watch, and watching list synced directly from MyAnimeList.</p>
              <div className="section-chip-row">
                <span className="section-chip accent">MAL synced</span>
                <span className="section-chip">Status filters</span>
                <span className="section-chip">Quick stats</span>
              </div>
            </a>

            <a href="/base/tcg" className="section-card">
              <h3>TCG Collection</h3>
              <p>Pokemon &amp; One Piece TCG cards tracked with quantities, prices, and value.</p>
              <div className="section-chip-row">
                <span className="section-chip accent">Full Collection</span>
                <span className="section-chip">Still Under-Construction</span>
              </div>
            </a>
          </div>
        </article>
      </section>

      <footer style={{ marginTop: '28px', fontSize: '0.78rem', color: 'var(--text-soft)', textAlign: 'center' }}>
        @ 2025 im.ok. All rights reserved.
      </footer>
    </main>
  );
}
