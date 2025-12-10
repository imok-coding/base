import { useEffect, useState } from 'react';
import { fetchAnimeList } from '../api/malApi.js';

export default function Anime() {
  const formatStatus = (value) => {
    if (!value) return 'Unknown';
    return value
      .toString()
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (m) => m.toUpperCase());
  };

  const [items, setItems] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const data = await fetchAnimeList();
        const sorted = [...data].sort((a, b) =>
          (a.title || "").localeCompare(b.title || "")
        );
        setItems(sorted);
        setFiltered(sorted);
      } catch (err) {
        console.error(err);
        setError('Failed to load data from MAL.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    let cur = [...items];
    if (status !== 'all') {
      cur = cur.filter((a) => (a.status || '').toLowerCase() === status);
    }
    if (term) {
      const t = term.toLowerCase();
      cur = cur.filter((a) => (a.title || '').toLowerCase().includes(t));
    }
    setFiltered(cur);
  }, [items, status, term]);

  return (
    <main className="page">
      <header style={{ marginTop: '32px', marginBottom: '16px' }}>
        <h1
          style={{
            margin: 0,
            fontSize: '2rem',
            color: '#ffb6c1',
            textShadow: '0 0 8px rgba(255,182,193,0.8)',
          }}
        >
          Anime Library
        </h1>
        <p style={{ margin: '6px 0 0', color: 'var(--text-soft)', fontSize: '0.9rem' }}>
          Read-only mirror of your MyAnimeList entries.
        </p>
      </header>

      <section
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '10px',
      marginTop: '12px',
    }}
  >
    <input
      type="text"
      placeholder="Search anime by title..."
      value={term}
      onChange={(e) => setTerm(e.target.value)}
      style={{
        flex: '1 1 220px',
        minWidth: '220px',
            padding: '8px 12px',
            borderRadius: '999px',
            border: '1px solid var(--border-soft)',
            background: 'rgba(43,15,29,0.93)',
            color: '#fff',
            fontSize: '0.9rem',
          }}
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          style={{
            flex: '0 0 220px',
            padding: '8px 12px',
            borderRadius: '999px',
            border: '1px solid var(--border-soft)',
            background: 'rgba(43,15,29,0.93)',
            color: '#fff',
            fontSize: '0.9rem',
          }}
        >
          <option value="all">All statuses</option>
          <option value="watching">Watching</option>
          <option value="completed">Completed</option>
          <option value="on_hold">On Hold</option>
          <option value="dropped">Dropped</option>
          <option value="plan_to_watch">Plan to Watch</option>
        </select>
      </section>

      {loading && (
        <p style={{ marginTop: '20px', color: 'var(--text-soft)' }}>Loading anime list from MAL...</p>
      )}
      {error && (
        <p style={{ marginTop: '20px', color: '#ff8a80' }}>{error}</p>
      )}

      {!loading && !error && (
        <section
          className="grid"
          style={{
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            marginTop: '20px',
          }}
        >
          {filtered.length === 0 && (
            <p style={{ marginTop: '12px', color: 'var(--text-soft)' }}>
              No results match your filters yet.
            </p>
          )}

          {filtered.map((a) => (
            <article
              key={a.id || a.title}
              style={{
                background: '#2b0f1d',
                borderRadius: '16px',
                border: '1px solid rgba(255,182,193,0.16)',
                boxShadow: 'var(--shadow-soft)',
                fontSize: '0.85rem',
                padding: '8px 8px 10px',
              }}
            >
              <div style={{ fontWeight: 600, color: '#ffc0cb', marginBottom: '4px' }}>
                {a.title}
              </div>
              <div style={{ color: 'var(--text-soft)' }}>
                {a.episodes ? `${a.episodes} eps` : 'Episodes: ?'}
              </div>
              <div style={{ color: 'var(--text-soft)', fontSize: '0.78rem', marginTop: '4px' }}>
                Status: {formatStatus(a.status)}
              </div>
              {a.score != null && (
                <div style={{ color: '#ffd166', fontSize: '0.78rem', marginTop: '2px' }}>
                  Score: {a.score || 'N/A'}
                </div>
              )}
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
