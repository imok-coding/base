export default function Home() {
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
          im_ok&apos;s Collection Hub
        </h1>
        <p style={{ margin: '6px 0 0', color: 'var(--text-soft)', fontSize: '0.95rem' }}>
          A quiet little corner of the internet for my shelves, lists, and cardboard addictions.
        </p>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            borderRadius: '999px',
            border: '1px solid rgba(255,182,193,0.35)',
            background: 'rgba(43,15,29,0.72)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.55)',
            marginTop: '12px',
            fontSize: '0.85rem',
            color: 'var(--text-soft)',
          }}
        >
          📚 Manga · 📺 Anime · 🃏 TCG
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
            About me
          </h2>
          <p style={{ margin: 0, color: 'var(--text-soft)', fontSize: '0.9rem', lineHeight: 1.5 }}>
            Hey, I go by <strong>im_ok</strong>. I hoard manga, binge anime, and collect way too many trading cards.
            This site is where I track everything: volumes on my shelves, finished shows, and growing TCG binders.
          </p>
          <p style={{ marginTop: '10px', color: 'var(--text-soft)', fontSize: '0.9rem' }}>
            You&apos;ll find detailed stats, reading history, and collection values across the different pages — it&apos;s
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
            <span className="pill">Manga library power user</span>
            <span className="pill">MAL-synced anime list</span>
            <span className="pill">Pokémon &amp; One Piece TCG</span>
            <span className="pill">Automation &amp; data nerd</span>
          </div>
        </article>

        {/* Sections card */}
        <article className="card">
          <h2 style={{ marginTop: 0, marginBottom: '8px', fontSize: '1.2rem', color: '#ffb6c1' }}>
            Explore the site
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
              <h3>📚 Manga Library</h3>
              <p>Full manga collection &amp; wishlist, with covers, stats, and release tracking.</p>
              <div className="section-chip-row">
                <span className="section-chip accent">Firestore-powered</span>
                <span className="section-chip">Library &amp; wishlist</span>
                <span className="section-chip">Release calendar</span>
              </div>
            </a>

            <a href="/base/anime" className="section-card">
              <h3>📺 Anime Library</h3>
              <p>Read-only mirror of my MAL list, with filters, stats, and pretty cards.</p>
              <div className="section-chip-row">
                <span className="section-chip accent">MAL synced</span>
                <span className="section-chip">Status filters</span>
                <span className="section-chip">Quick stats</span>
              </div>
            </a>

            <a href="/base/tcg" className="section-card">
              <h3>🃏 TCG Collection</h3>
              <p>Pokémon &amp; One Piece TCG cards tracked with quantities, prices, and value.</p>
              <div className="section-chip-row">
                <span className="section-chip accent">Tracked in Firestore</span>
                <span className="section-chip">Value vs paid</span>
                <span className="section-chip">Per-game breakdown</span>
              </div>
            </a>
          </div>
        </article>
      </section>

      <footer style={{ marginTop: '28px', fontSize: '0.78rem', color: 'var(--text-soft)', textAlign: 'center' }}>
        Built as a static GitHub Pages site. Data lives in Firestore &amp; MyAnimeList.
      </footer>
    </main>
  );
}
