import { useEffect, useState } from 'react';
import { db } from '../api/firebase.js';
import { collection, getDocs } from 'firebase/firestore';

export default function Manga() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [term, setTerm] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const col = collection(db, 'mangaLibrary'); // adjust to your existing collection name
        const snap = await getDocs(col);
        const rows = [];
        snap.forEach((doc) => rows.push({ id: doc.id, ...doc.data() }));
        setItems(rows);
      } catch (err) {
        console.error('Error loading manga:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filtered = items.filter((item) => {
    if (!term) return true;
    const t = term.toLowerCase();
    return (
      (item.title || '').toLowerCase().includes(t) ||
      (item.series || '').toLowerCase().includes(t) ||
      (item.isbn || '').toLowerCase().includes(t)
    );
  });

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
          Manga Library
        </h1>
        <p style={{ margin: '6px 0 0', color: 'var(--text-soft)', fontSize: '0.9rem' }}>
          Simple view of your Firestore-backed manga collection.
        </p>
      </header>

      <section style={{ marginTop: '12px' }}>
        <input
          type="text"
          placeholder="Search by title, series, or ISBN…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          style={{
            width: '100%',
            maxWidth: '420px',
            padding: '8px 12px',
            borderRadius: '999px',
            border: '1px solid #bb7f8f',
            background: '#2b0f1d',
            color: '#fff',
            boxShadow: '0 0 6px rgba(255,182,193,0.3) inset',
          }}
        />
      </section>

      {loading ? (
        <p style={{ marginTop: '20px', color: 'var(--text-soft)' }}>Loading manga from Firestore…</p>
      ) : filtered.length === 0 ? (
        <p style={{ marginTop: '20px', color: 'var(--text-soft)' }}>No manga found matching your search.</p>
      ) : (
        <section
          className="grid"
          style={{
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            marginTop: '20px',
          }}
        >
          {filtered.map((m) => (
            <article
              key={m.id}
              style={{
                background: '#2b0f1d',
                borderRadius: '12px',
                border: '1px solid rgba(255,182,193,0.25)',
                boxShadow: '0 2px 8px rgba(255,182,193,0.2)',
                padding: '10px',
                fontSize: '0.82rem',
              }}
            >
              <div
                style={{
                  fontWeight: 700,
                  color: '#ffc0cb',
                  marginBottom: '4px',
                }}
              >
                {m.title || 'Untitled'}
              </div>
              <div style={{ color: 'var(--text-soft)', marginBottom: '4px' }}>{m.series || ''}</div>
              <div style={{ color: '#eea4b7', fontSize: '0.75rem' }}>
                {m.isbn ? `ISBN: ${m.isbn}` : ''}
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
