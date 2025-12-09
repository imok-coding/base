import { useAuth } from '../contexts/AuthContext.jsx';

export default function Dashboard() {
  const { admin, loading } = useAuth();

  if (loading) {
    return (
      <main className="page">
        <p style={{ marginTop: '40px', color: 'var(--text-soft)' }}>Checking admin permissions…</p>
      </main>
    );
  }

  if (!admin) {
    return (
      <main className="page">
        <h1
          style={{
            marginTop: '40px',
            fontSize: '1.6rem',
            color: '#ffb6c1',
          }}
        >
          403 – Admins only
        </h1>
        <p style={{ marginTop: '10px', color: 'var(--text-soft)' }}>
          This dashboard is restricted to admin accounts.
        </p>
      </main>
    );
  }

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
          Admin Dashboard
        </h1>
        <p style={{ margin: '6px 0 0', color: 'var(--text-soft)', fontSize: '0.9rem' }}>
          Global stats, analytics, and admin tools for manga &amp; TCG.
        </p>
      </header>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
          marginTop: '18px',
        }}
      >
        <article className="card">
          <h2 style={{ marginTop: 0, marginBottom: '8px', fontSize: '1rem', color: '#ffb6c1' }}>
            Collection stats
          </h2>
          <p style={{ margin: 0, color: 'var(--text-soft)', fontSize: '0.85rem' }}>
            Here you can later surface combined stats from Firestore for manga and TCG (volumes, cards, value, etc.).
          </p>
        </article>

        <article className="card">
          <h2 style={{ marginTop: 0, marginBottom: '8px', fontSize: '1rem', color: '#ffb6c1' }}>
            Activity log
          </h2>
          <p style={{ margin: 0, color: 'var(--text-soft)', fontSize: '0.85rem' }}>
            You can wire this up to log admin actions (adds, edits, deletes) with timestamps.
          </p>
        </article>

        <article className="card">
          <h2 style={{ marginTop: 0, marginBottom: '8px', fontSize: '1rem', color: '#ffb6c1' }}>
            Discord webhooks
          </h2>
          <p style={{ margin: 0, color: 'var(--text-soft)', fontSize: '0.85rem' }}>
            Later we&apos;ll add controls to trigger Discord webhooks when you add manga, TCG cards, or hit milestones.
          </p>
        </article>
      </section>
    </main>
  );
}
