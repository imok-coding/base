import { useEffect, useState } from 'react';
import { db } from '../api/firebase.js';
import { collection, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext.jsx';

export default function TCG() {
  const { admin } = useAuth();
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [term, setTerm] = useState('');
  const [gameFilter, setGameFilter] = useState('all');

  // Admin form
  const [form, setForm] = useState({
    game: 'pokemon',
    name: '',
    setName: '',
    number: '',
    rarity: '',
    condition: '',
    quantity: 1,
    pricePaid: '',
    estimatedValue: '',
  });

  useEffect(() => {
    async function load() {
      try {
        const col = collection(db, 'tcg');
        const snap = await getDocs(col);
        const rows = [];
        snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
        setCards(rows);
      } catch (err) {
        console.error('Error loading TCG:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filtered = cards.filter((c) => {
    if (gameFilter !== 'all' && c.game !== gameFilter) return false;
    if (!term) return true;
    const t = term.toLowerCase();
    return (
      (c.name || '').toLowerCase().includes(t) ||
      (c.setName || '').toLowerCase().includes(t) ||
      (c.number || '').toLowerCase().includes(t)
    );
  });

  const stats = cards.reduce(
    (acc, c) => {
      const qty = Number(c.quantity || 1);
      const paid = Number(c.pricePaid || 0);
      const val = Number(c.estimatedValue || 0);
      acc.totalCards += qty;
      acc.totalPaid += qty * paid;
      acc.totalValue += qty * val;
      if (c.game === 'pokemon') acc.pokemon += qty;
      if (c.game === 'onepiece') acc.onepiece += qty;
      return acc;
    },
    { totalCards: 0, totalPaid: 0, totalValue: 0, pokemon: 0, onepiece: 0 }
  );
  const gain = stats.totalValue - stats.totalPaid;

  const handleFormChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleAddCard = async () => {
    if (!admin) return;
    if (!form.name.trim()) {
      alert('Card name is required.');
      return;
    }
    const payload = {
      game: form.game,
      name: form.name.trim(),
      setName: form.setName.trim(),
      number: form.number.trim(),
      rarity: form.rarity.trim(),
      condition: form.condition.trim(),
      quantity: Number(form.quantity || 1),
      pricePaid: Number(form.pricePaid || 0),
      estimatedValue: Number(form.estimatedValue || 0),
    };
    try {
      const col = collection(db, 'tcg');
      await addDoc(col, payload);
      setForm({
        game: 'pokemon',
        name: '',
        setName: '',
        number: '',
        rarity: '',
        condition: '',
        quantity: 1,
        pricePaid: '',
        estimatedValue: '',
      });
      // Reload
      const snap = await getDocs(col);
      const rows = [];
      snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
      setCards(rows);
    } catch (err) {
      console.error('Error adding card:', err);
      alert('Failed to save card.');
    }
  };

  const handleDelete = async (id) => {
    if (!admin) return;
    if (!window.confirm('Delete this card?')) return;
    try {
      await deleteDoc(doc(db, 'tcg', id));
      setCards((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      console.error('Delete error:', err);
      alert('Failed to delete card.');
    }
  };

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
          TCG Collection
        </h1>
        <p style={{ margin: '6px 0 0', color: 'var(--text-soft)', fontSize: '0.9rem' }}>
          Pokémon &amp; One Piece TCG cards with quantities, prices, and collection value.
        </p>
      </header>

      {/* Stats */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '12px',
          marginTop: '18px',
        }}
      >
        <div className="card" style={{ padding: '10px 12px', textAlign: 'center' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-soft)' }}>Total cards</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{stats.totalCards}</div>
        </div>
        <div className="card" style={{ padding: '10px 12px', textAlign: 'center' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-soft)' }}>Total paid</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>${stats.totalPaid.toFixed(2)}</div>
        </div>
        <div className="card" style={{ padding: '10px 12px', textAlign: 'center' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-soft)' }}>Total value</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>${stats.totalValue.toFixed(2)}</div>
        </div>
        <div className="card" style={{ padding: '10px 12px', textAlign: 'center' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-soft)' }}>Unrealized gain / loss</div>
          <div
            style={{
              fontSize: '1.1rem',
              fontWeight: 700,
              color: gain >= 0 ? '#00e676' : '#ff8a80',
            }}
          >
            {gain >= 0 ? '+' : '-'}${Math.abs(gain).toFixed(2)}
          </div>
        </div>
        <div className="card" style={{ padding: '10px 12px', textAlign: 'center' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-soft)' }}>Pokémon cards</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{stats.pokemon}</div>
        </div>
        <div className="card" style={{ padding: '10px 12px', textAlign: 'center' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-soft)' }}>One Piece cards</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{stats.onepiece}</div>
        </div>
      </section>

      {/* Filters */}
      <section
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '10px',
          marginTop: '16px',
        }}
      >
        <input
          type="text"
          placeholder="Search by name, set, or number…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          style={{
            flex: '1 1 220px',
            minWidth: '220px',
            padding: '8px 12px',
            borderRadius: '999px',
            border: '1px solid #bb7f8f',
            background: '#2b0f1d',
            color: '#fff',
          }}
        />
        <select
          value={gameFilter}
          onChange={(e) => setGameFilter(e.target.value)}
          style={{
            flex: '0 0 220px',
            padding: '8px 12px',
            borderRadius: '999px',
            border: '1px solid #bb7f8f',
            background: '#2b0f1d',
            color: '#fff',
          }}
        >
          <option value="all">All games</option>
          <option value="pokemon">Pokémon only</option>
          <option value="onepiece">One Piece only</option>
        </select>
      </section>

      {/* Admin form */}
      {admin && (
        <section
          className="card"
          style={{
            marginTop: '16px',
            borderStyle: 'dashed',
            borderColor: 'rgba(255,182,193,0.5)',
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: '10px', fontSize: '1.05rem', color: '#ffb6c1' }}>
            Add card (admin)
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: '8px',
            }}
          >
            <label style={{ fontSize: '0.8rem', color: 'var(--text-soft)' }}>
              Game
              <select
                value={form.game}
                onChange={(e) => handleFormChange('game', e.target.value)}
                style={{
                  width: '100%',
                  marginTop: '3px',
                  padding: '6px 8px',
                  borderRadius: '8px',
                  border: '1px solid #bb7f8f',
                  background: '#1e0d14',
                  color: '#fff',
                }}
              >
                <option value="pokemon">Pokémon</option>
                <option value="onepiece">One Piece</option>
              </select>
            </label>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-soft)' }}>
              Card name
              <input
                type="text"
                value={form.name}
                onChange={(e) => handleFormChange('name', e.target.value)}
                style={{
                  width: '100%',
                  marginTop: '3px',
                  padding: '6px 8px',
                  borderRadius: '8px',
                  border: '1px solid #bb7f8f',
                  background: '#1e0d14',
                  color: '#fff',
                }}
              />
            </label>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-soft)' }}>
              Set name
              <input
                type="text"
                value={form.setName}
                onChange={(e) => handleFormChange('setName', e.target.value)}
                style={{
                  width: '100%',
                  marginTop: '3px',
                  padding: '6px 8px',
                  borderRadius: '8px',
                  border: '1px solid #bb7f8f',
                  background: '#1e0d14',
                  color: '#fff',
                }}
              />
            </label>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-soft)' }}>
              Card number
              <input
                type="text"
                value={form.number}
                onChange={(e) => handleFormChange('number', e.target.value)}
                style={{
                  width: '100%',
                  marginTop: '3px',
                  padding: '6px 8px',
                  borderRadius: '8px',
                  border: '1px solid #bb7f8f',
                  background: '#1e0d14',
                  color: '#fff',
                }}
              />
            </label>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-soft)' }}>
              Rarity
              <input
                type="text"
                value={form.rarity}
                onChange={(e) => handleFormChange('rarity', e.target.value)}
                style={{
                  width: '100%',
                  marginTop: '3px',
                  padding: '6px 8px',
                  borderRadius: '8px',
                  border: '1px solid #bb7f8f',
                  background: '#1e0d14',
                  color: '#fff',
                }}
              />
            </label>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-soft)' }}>
              Condition
              <input
                type="text"
                value={form.condition}
                onChange={(e) => handleFormChange('condition', e.target.value)}
                style={{
                  width: '100%',
                  marginTop: '3px',
                  padding: '6px 8px',
                  borderRadius: '8px',
                  border: '1px solid #bb7f8f',
                  background: '#1e0d14',
                  color: '#fff',
                }}
              />
            </label>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-soft)' }}>
              Quantity
              <input
                type="number"
                min="1"
                value={form.quantity}
                onChange={(e) => handleFormChange('quantity', e.target.value)}
                style={{
                  width: '100%',
                  marginTop: '3px',
                  padding: '6px 8px',
                  borderRadius: '8px',
                  border: '1px solid #bb7f8f',
                  background: '#1e0d14',
                  color: '#fff',
                }}
              />
            </label>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-soft)' }}>
              Price paid (per card)
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.pricePaid}
                onChange={(e) => handleFormChange('pricePaid', e.target.value)}
                style={{
                  width: '100%',
                  marginTop: '3px',
                  padding: '6px 8px',
                  borderRadius: '8px',
                  border: '1px solid #bb7f8f',
                  background: '#1e0d14',
                  color: '#fff',
                }}
              />
            </label>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-soft)' }}>
              Estimated value (per card)
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.estimatedValue}
                onChange={(e) => handleFormChange('estimatedValue', e.target.value)}
                style={{
                  width: '100%',
                  marginTop: '3px',
                  padding: '6px 8px',
                  borderRadius: '8px',
                  border: '1px solid #bb7f8f',
                  background: '#1e0d14',
                  color: '#fff',
                }}
              />
            </label>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '8px',
              marginTop: '10px',
            }}
          >
            <button
              onClick={handleAddCard}
              style={{
                padding: '6px 12px',
                borderRadius: '999px',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
                background: '#ff69b4',
                color: '#1e0d14',
              }}
            >
              Save card
            </button>
          </div>
        </section>
      )}

      {/* Cards grid */}
      {loading ? (
        <p style={{ marginTop: '20px', color: 'var(--text-soft)' }}>Loading TCG collection…</p>
      ) : filtered.length === 0 ? (
        <p style={{ marginTop: '20px', color: 'var(--text-soft)' }}>No cards found.</p>
      ) : (
        <section
          className="grid"
          style={{
            gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
            marginTop: '20px',
          }}
        >
          {filtered.map((c) => {
            const qty = Number(c.quantity || 1);
            const paidTotal = qty * Number(c.pricePaid || 0);
            const valTotal = qty * Number(c.estimatedValue || 0);
            return (
              <article
                key={c.id}
                style={{
                  background: '#2b0f1d',
                  borderRadius: '12px',
                  border: '1px solid rgba(255,182,193,0.25)',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.55)',
                  padding: '10px',
                  fontSize: '0.82rem',
                }}
              >
                <div style={{ fontWeight: 700, color: '#ffb6c1', marginBottom: '4px' }}>
                  {c.name || 'Unnamed card'}
                </div>
                <div style={{ color: 'var(--text-soft)', marginBottom: '4px' }}>{c.setName || ''}</div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    color: 'var(--text-soft)',
                  }}
                >
                  <span>#{c.number || '–'}</span>
                  <span>{c.rarity || ''}</span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    color: 'var(--text-soft)',
                    marginTop: '4px',
                  }}
                >
                  <span>Cond: {c.condition || 'N/A'}</span>
                  <span>Qty: {qty}</span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    color: 'var(--text-soft)',
                    marginTop: '4px',
                  }}
                >
                  <span>Paid: ${paidTotal.toFixed(2)}</span>
                  <span>Value: ${valTotal.toFixed(2)}</span>
                </div>
                <div
                  style={{
                    marginTop: '4px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span
                    style={{
                      padding: '2px 7px',
                      borderRadius: '999px',
                      background: 'rgba(255,105,180,0.18)',
                      border: '1px solid rgba(255,105,180,0.5)',
                      color: '#ffb6c1',
                      fontSize: '0.7rem',
                    }}
                  >
                    {c.game === 'pokemon' ? 'Pokémon' : 'One Piece'}
                  </span>
                  {admin && (
                    <button
                      onClick={() => handleDelete(c.id)}
                      style={{
                        padding: '3px 8px',
                        borderRadius: '999px',
                        border: '1px solid rgba(244,67,54,0.7)',
                        background: 'rgba(244,67,54,0.12)',
                        color: '#ff8a80',
                        fontSize: '0.7rem',
                        cursor: 'pointer',
                      }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
