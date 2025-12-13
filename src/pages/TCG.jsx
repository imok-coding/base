
import { useEffect, useState } from "react";
import { db } from "../firebaseConfig";
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { useAuth } from "../contexts/AuthContext.jsx";

export default function TCG() {
  const initialForm = {
    game: "pokemon",
    name: "",
    setName: "",
    number: "",
    rarity: "",
    condition: "",
    quantity: 1,
    pricePaid: "",
    estimatedValue: "",
    image: "",
    productURL: "",
    notes: "",
  };

  const { admin } = useAuth();
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [term, setTerm] = useState("");
  const [gameFilter, setGameFilter] = useState("all");
  const [sortBy, setSortBy] = useState("name");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchError, setSearchError] = useState("");
  const [editCard, setEditCard] = useState(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [form, setForm] = useState(initialForm);

  useEffect(() => {
    document.title = "TCG | Collection";
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const col = collection(db, "tcg");
        const snap = await getDocs(col);
        const rows = [];
        snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
        if (!cancelled) setCards(rows);
      } catch (err) {
        console.error("Error loading TCG:", err);
        try {
          const base = import.meta.env.BASE_URL || "/";
          const res = await fetch(`${base}tcg-collection.json`, { cache: "no-cache" });
          if (!res.ok) throw new Error("fallback fetch failed");
          const json = await res.json();
          const rows = Array.isArray(json.tcg) ? json.tcg : [];
          if (!cancelled) setCards(rows.map((c, idx) => ({ id: c.id || `offline-${idx}`, ...c })));
        } catch (fbErr) {
          console.error("TCG offline fallback failed", fbErr);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = cards.filter((c) => {
    if (gameFilter !== "all" && c.game !== gameFilter) return false;
    if (!term) return true;
    const t = term.toLowerCase();
    return (
      (c.name || "").toLowerCase().includes(t) ||
      (c.setName || "").toLowerCase().includes(t) ||
      (c.number || "").toLowerCase().includes(t)
    );
  });
  const sortedCards = [...filtered].sort((a, b) => {
    const aName = (a.name || "").toLowerCase();
    const bName = (b.name || "").toLowerCase();
    const aSet = (a.setName || "").toLowerCase();
    const bSet = (b.setName || "").toLowerCase();
    const aRarity = (a.rarity || "").toLowerCase();
    const bRarity = (b.rarity || "").toLowerCase();
    const aQty = Number(a.quantity || 0);
    const bQty = Number(b.quantity || 0);
    const aVal = Number(a.estimatedValue || 0) * Math.max(1, aQty);
    const bVal = Number(b.estimatedValue || 0) * Math.max(1, bQty);
    switch (sortBy) {
      case "set":
        return aSet.localeCompare(bSet) || aName.localeCompare(bName);
      case "rarity":
        return aRarity.localeCompare(bRarity) || aName.localeCompare(bName);
      case "quantity":
        return bQty - aQty || aName.localeCompare(bName);
      case "value":
        return bVal - aVal || aName.localeCompare(bName);
      case "name":
      default:
        return aName.localeCompare(bName);
    }
  });

  const stats = cards.reduce(
    (acc, c) => {
      const qty = Number(c.quantity || 1);
      const paid = Number(c.pricePaid || 0);
      const val = Number(c.estimatedValue || 0);
      acc.totalCards += qty;
      acc.totalPaid += qty * paid;
      acc.totalValue += qty * val;
      if (c.game === "pokemon") acc.pokemon += qty;
      if (c.game === "onepiece") acc.onepiece += qty;
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
      alert("Card name is required.");
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
      image: form.image.trim(),
      productURL: form.productURL.trim(),
      notes: form.notes.trim(),
    };
    const normalize = (obj) => ({
      game: (obj.game || "").toLowerCase().trim(),
      name: (obj.name || "").toLowerCase().trim(),
      setName: (obj.setName || "").toLowerCase().trim(),
      number: (obj.number || "").toLowerCase().trim(),
      rarity: (obj.rarity || "").toLowerCase().trim(),
      condition: (obj.condition || "").toLowerCase().trim(),
      pricePaid: Number(obj.pricePaid || 0),
      estimatedValue: Number(obj.estimatedValue || 0),
      image: (obj.image || "").trim(),
      productURL: (obj.productURL || "").trim(),
      notes: (obj.notes || "").trim(),
    });
    const target = normalize(payload);
    const dup = cards.find((c) => {
      const cur = normalize(c);
      return (
        cur.game === target.game &&
        cur.name === target.name &&
        cur.setName === target.setName &&
        cur.number === target.number &&
        cur.rarity === target.rarity &&
        cur.condition === target.condition &&
        cur.pricePaid === target.pricePaid &&
        cur.estimatedValue === target.estimatedValue &&
        cur.image === target.image &&
        cur.productURL === target.productURL &&
        cur.notes === target.notes
      );
    });
    try {
      const col = collection(db, "tcg");
      if (dup?.id) {
        const newQty = Number(dup.quantity || 1) + payload.quantity;
        await updateDoc(doc(db, "tcg", dup.id), { quantity: newQty });
        setCards((prev) =>
          prev.map((c) => (c.id === dup.id ? { ...c, quantity: newQty } : c))
        );
      } else {
        await addDoc(col, payload);
        const snap = await getDocs(col);
        const rows = [];
        snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
        setCards(rows);
      }
      setForm(initialForm);
      setAddModalOpen(false);
    } catch (err) {
      console.error("Error adding card:", err);
      alert("Failed to save card.");
    }
  };

  const handleUpdateCard = async () => {
    if (!admin || !editCard) return;
    if (!editCard.name.trim()) {
      alert("Card name is required.");
      return;
    }
    const payload = {
      game: editCard.game,
      name: editCard.name.trim(),
      setName: editCard.setName.trim(),
      number: editCard.number.trim(),
      rarity: editCard.rarity.trim(),
      condition: editCard.condition.trim(),
      quantity: Number(editCard.quantity || 1),
      pricePaid: Number(editCard.pricePaid || 0),
      estimatedValue: Number(editCard.estimatedValue || 0),
      image: editCard.image ? editCard.image.trim() : "",
      productURL: editCard.productURL ? editCard.productURL.trim() : "",
      notes: editCard.notes ? editCard.notes.trim() : "",
    };
    try {
      await updateDoc(doc(db, "tcg", editCard.id), payload);
      setCards((prev) => prev.map((c) => (c.id === editCard.id ? { ...c, ...payload } : c)));
      setEditCard(null);
    } catch (err) {
      console.error("Error updating card:", err);
      alert("Failed to update card.");
    }
  };

  const handleDelete = async (id) => {
    if (!admin) return;
    if (!window.confirm("Delete this card?")) return;
    try {
      await deleteDoc(doc(db, "tcg", id));
      setCards((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      console.error("Delete error:", err);
      alert("Failed to delete card.");
    }
  };

  const exportTcgJson = () => {
    if (!cards.length) {
      alert("No cards to export.");
      return;
    }
    const blob = new Blob([JSON.stringify({ tcg: cards }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tcg-collection.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <main className="page">
      <header
        style={{
          marginTop: "32px",
          marginBottom: "16px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          gap: "6px",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: "2rem",
            color: "#ffb6c1",
            textShadow: "0 0 8px rgba(255,182,193,0.8)",
            fontWeight: 700,
          }}
      >
        Tyler&apos;s TCG Collection
      </h1>
      <p style={{ margin: "6px 0 0", color: "var(--text-soft)", fontSize: "0.9rem" }}>
        Pokemon &amp; One Piece TCG cards with quantities, prices, and collection value.
      </p>
      <div style={{ marginTop: "10px" }}>
        <button className="manga-btn secondary" type="button" onClick={exportTcgJson}>
          Export JSON
        </button>
      </div>
    </header>

      {admin && (
        <button
          className="manga-btn"
          type="button"
          aria-label="Add card"
          onClick={() => setAddModalOpen(true )}
          style={{
            position: "fixed",
            bottom: "20px",
            right: "20px",
            zIndex: 1000,
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            padding: 0,
            fontSize: "28px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          +
        </button>
       )}

      {admin && addModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(8,1,10,0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
            padding: "12px",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setAddModalOpen(false);
          }}
        >
          <div
            style={{
              width: "min(720px, 95vw)",
              background: "#140710",
              border: "1px solid rgba(255,182,193,0.3)",
              borderRadius: "12px",
              padding: "14px",
              boxShadow: "0 24px 60px rgba(0,0,0,0.85)",
            }}
            onClick={(e) => e.stopPropagation( )}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ margin: 0, color: "#ffb6c1" }}>Add card</h2>
              <button className="dashboard-close" onClick={() => setAddModalOpen(false )} type="button">
                Close
              </button>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "180px 1fr",
                gap: "12px",
                alignItems: "flex-start",
                marginTop: "10px",
              }}
            >
              <div
                style={{
                  width: "100%",
                  maxWidth: "180px",
                  borderRadius: "10px",
                  border: "1px solid rgba(255,182,193,0.25)",
                  background: "#1e0d14",
                  overflow: "hidden",
                  aspectRatio: "3 / 4",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {form.image ? (
                  <img src={form.image} alt="Card preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <div style={{ color: "var(--text-soft)", fontSize: "0.8rem", padding: "6px" }}>No image</div>
                 )}
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                  gap: "8px",
                }}
              >
                <label style={{ fontSize: "0.8rem", color: "var(--text-soft)" }}>
                  Game
                  <select
                    value={form.game}
                    onChange={(e) => handleFormChange("game", e.target.value )}
                    style={{
                      width: "100%",
                      marginTop: "3px",
                      padding: "6px 8px",
                      borderRadius: "8px",
                      border: "1px solid #bb7f8f",
                      background: "#1e0d14",
                      color: "#fff",
                    }}
                  >
                    <option value="pokemon">Pokemon</option>
                    <option value="onepiece">One Piece</option>
                  </select>
                </label>
                <label style={{ fontSize: "0.8rem", color: "var(--text-soft)" }}>
                  Card name
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => handleFormChange("name", e.target.value )}
                    style={{
                      width: "100%",
                      marginTop: "3px",
                      padding: "6px 8px",
                      borderRadius: "8px",
                      border: "1px solid #bb7f8f",
                      background: "#1e0d14",
                      color: "#fff",
                    }}
                  />
                </label>
                <label style={{ fontSize: "0.8rem", color: "var(--text-soft)" }}>
                  Set name
                  <input
                    type="text"
                    value={form.setName}
                    onChange={(e) => handleFormChange("setName", e.target.value )}
                    style={{
                      width: "100%",
                      marginTop: "3px",
                      padding: "6px 8px",
                      borderRadius: "8px",
                      border: "1px solid #bb7f8f",
                      background: "#1e0d14",
                      color: "#fff",
                    }}
                  />
                </label>
                <label style={{ fontSize: "0.8rem", color: "var(--text-soft)" }}>
                  Card number
                  <input
                    type="text"
                    value={form.number}
                    onChange={(e) => handleFormChange("number", e.target.value )}
                    style={{
                      width: "100%",
                      marginTop: "3px",
                      padding: "6px 8px",
                      borderRadius: "8px",
                      border: "1px solid #bb7f8f",
                      background: "#1e0d14",
                      color: "#fff",
                    }}
                  />
                </label>
                <label style={{ fontSize: "0.8rem", color: "var(--text-soft)" }}>
                  Rarity
                  <input
                    type="text"
                    value={form.rarity}
                    onChange={(e) => handleFormChange("rarity", e.target.value )}
                    style={{
                      width: "100%",
                      marginTop: "3px",
                      padding: "6px 8px",
                      borderRadius: "8px",
                      border: "1px solid #bb7f8f",
                      background: "#1e0d14",
                      color: "#fff",
                    }}
                  />
                </label>
                <label style={{ fontSize: "0.8rem", color: "var(--text-soft)" }}>
                  Condition
                  <input
                    type="text"
                    value={form.condition}
                    onChange={(e) => handleFormChange("condition", e.target.value )}
                    style={{
                      width: "100%",
                      marginTop: "3px",
                      padding: "6px 8px",
                      borderRadius: "8px",
                      border: "1px solid #bb7f8f",
                      background: "#1e0d14",
                      color: "#fff",
                    }}
                  />
                </label>
                <label style={{ fontSize: "0.8rem", color: "var(--text-soft)" }}>
                  Quantity
                  <input
                    type="number"
                    min="1"
                    value={form.quantity}
                    onChange={(e) => handleFormChange("quantity", e.target.value )}
                    style={{
                      width: "100%",
                      marginTop: "3px",
                      padding: "6px 8px",
                      borderRadius: "8px",
                      border: "1px solid #bb7f8f",
                      background: "#1e0d14",
                      color: "#fff",
                    }}
                  />
                </label>
                <label style={{ fontSize: "0.8rem", color: "var(--text-soft)" }}>
                  Price paid (per card)
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.pricePaid}
                    onChange={(e) => handleFormChange("pricePaid", e.target.value )}
                    style={{
                      width: "100%",
                      marginTop: "3px",
                      padding: "6px 8px",
                      borderRadius: "8px",
                      border: "1px solid #bb7f8f",
                      background: "#1e0d14",
                      color: "#fff",
                    }}
                  />
                </label>
                <label style={{ fontSize: "0.8rem", color: "var(--text-soft)" }}>
                  Estimated value (per card)
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.estimatedValue}
                    onChange={(e) => handleFormChange("estimatedValue", e.target.value )}
                    style={{
                      width: "100%",
                      marginTop: "3px",
                      padding: "6px 8px",
                      borderRadius: "8px",
                      border: "1px solid #bb7f8f",
                      background: "#1e0d14",
                      color: "#fff",
                    }}
                  />
                </label>
                <label style={{ fontSize: "0.8rem", color: "var(--text-soft)" }}>
                  Image URL
                  <input
                    type="text"
                    value={form.image || ""}
                    onChange={(e) => handleFormChange("image", e.target.value )}
                    style={{
                      width: "100%",
                      marginTop: "3px",
                      padding: "6px 8px",
                      borderRadius: "8px",
                      border: "1px solid #bb7f8f",
                      background: "#1e0d14",
                      color: "#fff",
                    }}
                  />
                </label>
                <label style={{ fontSize: "0.8rem", color: "var(--text-soft)" }}>
                  Product URL (backend only)
                  <input
                    type="text"
                    value={form.productURL || ""}
                    onChange={(e) => handleFormChange("productURL", e.target.value )}
                    style={{
                      width: "100%",
                      marginTop: "3px",
                      padding: "6px 8px",
                      borderRadius: "8px",
                      border: "1px solid #bb7f8f",
                      background: "#1e0d14",
                      color: "#fff",
                    }}
                  />
                </label>
                <label style={{ gridColumn: "1 / -1", fontSize: "0.8rem", color: "var(--text-soft)" }}>
                  Notes
                  <textarea
                    value={form.notes}
                    onChange={(e) => handleFormChange("notes", e.target.value )}
                    rows={3}
                    style={{
                      width: "100%",
                      marginTop: "3px",
                      padding: "6px 8px",
                      borderRadius: "8px",
                      border: "1px solid #bb7f8f",
                      background: "#1e0d14",
                      color: "#fff",
                      resize: "vertical",
                    }}
                  />
                </label>
              </div>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "8px",
                marginTop: "12px",
              }}
            >
              <button
                onClick={() => {
                  setForm(initialForm);
                  setAddModalOpen(false);
                }}
                style={{
                  padding: "6px 12px",
                  borderRadius: "999px",
                  border: "1px solid rgba(255,182,193,0.5)",
                  background: "transparent",
                  color: "#ffb6c1",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleAddCard}
                style={{
                  padding: "6px 12px",
                  borderRadius: "999px",
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 600,
                  background: "#ff69b4",
                  color: "#1e0d14",
                }}
              >
                Save card
              </button>
            </div>
          </div>
        </div>
       )}
      {admin && editCard && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(8,1,10,0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
            padding: "12px",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditCard(null);
          }}
        >
          <div
            style={{
              width: "min(720px, 95vw)",
              background: "#140710",
              border: "1px solid rgba(255,182,193,0.3)",
              borderRadius: "12px",
              padding: "14px",
              boxShadow: "0 24px 60px rgba(0,0,0,0.85)",
            }}
            onClick={(e) => e.stopPropagation( )}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h2 style={{ margin: 0, color: "#ffb6c1" }}>Edit card</h2>
              <button className="dashboard-close" onClick={() => setEditCard(null )} type="button">
                Close
              </button>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "180px 1fr",
                gap: "12px",
                alignItems: "flex-start",
                marginTop: "10px",
              }}
            >
              <div
                style={{
                  width: "100%",
                  maxWidth: "180px",
                  borderRadius: "10px",
                  border: "1px solid rgba(255,182,193,0.25)",
                  background: "#1e0d14",
                  overflow: "hidden",
                  aspectRatio: "3 / 4",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {editCard.image ? (
                  <img src={editCard.image} alt="Card preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <div style={{ color: "var(--text-soft)", fontSize: "0.8rem", padding: "6px" }}>No image</div>
                 )}
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                  gap: "8px",
                }}
              >
                <label style={{ fontSize: "0.8rem", color: "var(--text-soft)" }}>
                  Game
                  <select
                    value={editCard.game}
                    onChange={(e) => setEditCard((prev) => ({ ...prev, game: e.target.value }))}
                    style={{
                      width: "100%",
                      marginTop: "3px",
                      padding: "6px 8px",
                      borderRadius: "8px",
                      border: "1px solid #bb7f8f",
                      background: "#1e0d14",
                      color: "#fff",
                    }}
                  >
                    <option value="pokemon">Pokemon</option>
                    <option value="onepiece">One Piece</option>
                  </select>
                </label>
                <label style={{ fontSize: "0.8rem", color: "var(--text-soft)" }}>
                  Card name
                  <input
                    type="text"
                    value={editCard.name}
                    onChange={(e) => setEditCard((prev) => ({ ...prev, name: e.target.value }))}
                    style={{
                      width: "100%",
                      marginTop: "3px",
                      padding: "6px 8px",
                      borderRadius: "8px",
                      border: "1px solid #bb7f8f",
                      background: "#1e0d14",
                      color: "#fff",
                    }}
                  />
                </label>
                <label style={{ fontSize: "0.8rem", color: "var(--text-soft)" }}>
                  Set name
                  <input
                    type="text"
                    value={editCard.setName}
                    onChange={(e) => setEditCard((prev) => ({ ...prev, setName: e.target.value }))}
                    style={{
                      width: "100%",
                      marginTop: "3px",
                      padding: "6px 8px",
                      borderRadius: "8px",
                      border: "1px solid #bb7f8f",
                      background: "#1e0d14",
                      color: "#fff",
                    }}
                  />
                </label>
                <label style={{ fontSize: "0.8rem", color: "var(--text-soft)" }}>
                  Card number
                  <input
                    type="text"
                    value={editCard.number}
                    onChange={(e) => setEditCard((prev) => ({ ...prev, number: e.target.value }))}
                    style={{
                      width: "100%",
                      marginTop: "3px",
                      padding: "6px 8px",
                      borderRadius: "8px",
                      border: "1px solid #bb7f8f",
                      background: "#1e0d14",
                      color: "#fff",
                    }}
                  />
                </label>
                <label style={{ fontSize: "0.8rem", color: "var(--text-soft)" }}>
                  Rarity
                  <input
                    type="text"
                    value={editCard.rarity}
                    onChange={(e) => setEditCard((prev) => ({ ...prev, rarity: e.target.value }))}
                    style={{
                      width: "100%",
                      marginTop: "3px",
                      padding: "6px 8px",
                      borderRadius: "8px",
                      border: "1px solid #bb7f8f",
                      background: "#1e0d14",
                      color: "#fff",
                    }}
                  />
                </label>
                <label style={{ fontSize: "0.8rem", color: "var(--text-soft)" }}>
                  Condition
                  <input
                    type="text"
                    value={editCard.condition}
                    onChange={(e) => setEditCard((prev) => ({ ...prev, condition: e.target.value }))}
                    style={{
                      width: "100%",
                      marginTop: "3px",
                      padding: "6px 8px",
                      borderRadius: "8px",
                      border: "1px solid #bb7f8f",
                      background: "#1e0d14",
                      color: "#fff",
                    }}
                  />
                </label>
                <label style={{ fontSize: "0.8rem", color: "var(--text-soft)" }}>
                  Quantity
                  <input
                    type="number"
                    value={editCard.quantity}
                    onChange={(e) => setEditCard((prev) => ({ ...prev, quantity: e.target.value }))}
                    style={{
                      width: "100%",
                      marginTop: "3px",
                      padding: "6px 8px",
                      borderRadius: "8px",
                      border: "1px solid #bb7f8f",
                      background: "#1e0d14",
                      color: "#fff",
                    }}
                  />
                </label>
                <label style={{ fontSize: "0.8rem", color: "var(--text-soft)" }}>
                  Price paid (each)
                  <input
                    type="number"
                    value={editCard.pricePaid}
                    onChange={(e) => setEditCard((prev) => ({ ...prev, pricePaid: e.target.value }))}
                    style={{
                      width: "100%",
                      marginTop: "3px",
                      padding: "6px 8px",
                      borderRadius: "8px",
                      border: "1px solid #bb7f8f",
                      background: "#1e0d14",
                      color: "#fff",
                    }}
                  />
                </label>
                <label style={{ fontSize: "0.8rem", color: "var(--text-soft)" }}>
                  Estimated value (each)
                  <input
                    type="number"
                    value={editCard.estimatedValue}
                    onChange={(e) => setEditCard((prev) => ({ ...prev, estimatedValue: e.target.value }))}
                    style={{
                      width: "100%",
                      marginTop: "3px",
                      padding: "6px 8px",
                      borderRadius: "8px",
                      border: "1px solid #bb7f8f",
                      background: "#1e0d14",
                      color: "#fff",
                    }}
                  />
                </label>
                <label style={{ fontSize: "0.8rem", color: "var(--text-soft)" }}>
                  Image URL
                  <input
                    type="text"
                    value={editCard.image || ""}
                    onChange={(e) => setEditCard((prev) => ({ ...prev, image: e.target.value }))}
                    style={{
                      width: "100%",
                      marginTop: "3px",
                      padding: "6px 8px",
                      borderRadius: "8px",
                      border: "1px solid #bb7f8f",
                      background: "#1e0d14",
                      color: "#fff",
                    }}
                  />
                </label>
                <label style={{ fontSize: "0.8rem", color: "var(--text-soft)" }}>
                  Product URL (backend only)
                  <input
                    type="text"
                    value={editCard.productURL || ""}
                    onChange={(e) => setEditCard((prev) => ({ ...prev, productURL: e.target.value }))}
                    style={{
                      width: "100%",
                      marginTop: "3px",
                      padding: "6px 8px",
                      borderRadius: "8px",
                      border: "1px solid #bb7f8f",
                      background: "#1e0d14",
                      color: "#fff",
                    }}
                  />
                </label>
                <label style={{ gridColumn: "1 / -1", fontSize: "0.8rem", color: "var(--text-soft)" }}>
                  Notes
                  <textarea
                    value={editCard.notes || ""}
                    onChange={(e) => setEditCard((prev) => ({ ...prev, notes: e.target.value }))}
                    rows={3}
                    style={{
                      width: "100%",
                      marginTop: "3px",
                      padding: "6px 8px",
                      borderRadius: "8px",
                      border: "1px solid #bb7f8f",
                      background: "#1e0d14",
                      color: "#fff",
                      resize: "vertical",
                    }}
                  />
                </label>
              </div>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "8px",
                marginTop: "12px",
              }}
            >
              <button
                onClick={() => setEditCard(null )}
                style={{
                  padding: "6px 12px",
                  borderRadius: "999px",
                  border: "1px solid rgba(255,182,193,0.5)",
                  background: "transparent",
                  color: "#ffb6c1",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateCard}
                style={{
                  padding: "6px 12px",
                  borderRadius: "999px",
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 600,
                  background: "#ff69b4",
                  color: "#1e0d14",
                }}
              >
                Save changes
              </button>
            </div>
          </div>
        </div>
       )}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "12px",
          marginTop: "18px",
        }}
      >
        <div className="card" style={{ padding: "10px 12px", textAlign: "center" }}>
          <div style={{ fontSize: "0.8rem", color: "var(--text-soft)" }}>Total cards</div>
          <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>{stats.totalCards}</div>
        </div>
        <div className="card" style={{ padding: "10px 12px", textAlign: "center" }}>
          <div style={{ fontSize: "0.8rem", color: "var(--text-soft)" }}>Total paid</div>
          <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>${stats.totalPaid.toFixed(2 )}</div>
        </div>
        <div className="card" style={{ padding: "10px 12px", textAlign: "center" }}>
          <div style={{ fontSize: "0.8rem", color: "var(--text-soft)" }}>Total value</div>
          <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>${stats.totalValue.toFixed(2 )}</div>
        </div>
        <div className="card" style={{ padding: "10px 12px", textAlign: "center" }}>
          <div style={{ fontSize: "0.8rem", color: "var(--text-soft)" }}>Unrealized gain / loss</div>
          <div
            style={{
              fontSize: "1.1rem",
              fontWeight: 700,
              color: gain >= 0 ? "#00e676" : "#ff8a80",
            }}
          >
            {gain >= 0 ? "+" : "-"}${Math.abs(gain).toFixed(2 )}
          </div>
        </div>
        <div className="card" style={{ padding: "10px 12px", textAlign: "center" }}>
          <div style={{ fontSize: "0.8rem", color: "var(--text-soft)" }}>Pokemon cards</div>
          <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>{stats.pokemon}</div>
        </div>
        <div className="card" style={{ padding: "10px 12px", textAlign: "center" }}>
          <div style={{ fontSize: "0.8rem", color: "var(--text-soft)" }}>One Piece cards</div>
          <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>{stats.onepiece}</div>
        </div>
      </section>

      <section
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "10px",
          marginTop: "16px",
        }}
      >
        <input
          type="text"
          placeholder="Search by name, set, or number..."
          value={term}
          onChange={(e) => setTerm(e.target.value )}
          style={{
            flex: "1 1 220px",
            minWidth: "220px",
            padding: "8px 12px",
            borderRadius: "999px",
            border: "1px solid #bb7f8f",
            background: "#2b0f1d",
            color: "#fff",
          }}
        />
        <select
          value={gameFilter}
          onChange={(e) => setGameFilter(e.target.value )}
          style={{
            flex: "0 0 220px",
            padding: "8px 12px",
            borderRadius: "999px",
            border: "1px solid #bb7f8f",
            background: "#2b0f1d",
            color: "#fff",
          }}
        >
          <option value="all">All games</option>
          <option value="pokemon">Pokemon only</option>
          <option value="onepiece">One Piece only</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value )}
          style={{
            flex: "0 0 220px",
            padding: "8px 12px",
            borderRadius: "999px",
            border: "1px solid #bb7f8f",
            background: "#2b0f1d",
            color: "#fff",
          }}
        >
          <option value="name">Sort: Name (A-Z)</option>
          <option value="set">Sort: Set (A-Z)</option>
          <option value="rarity">Sort: Rarity (A-Z)</option>
          <option value="quantity">Sort: Quantity (high to low)</option>
          <option value="value">Sort: Value (high to low)</option>
        </select>
      </section>

      {loading ? (
        <p style={{ marginTop: "20px", color: "var(--text-soft)" }}>Loading TCG collection...</p>
      ) : filtered.length === 0 ? (
        <p style={{ marginTop: "20px", color: "var(--text-soft)" }}>No cards found.</p>
      ) : (
        <section
          className="grid"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", marginTop: "20px" }}
        >
          {sortedCards.map((c) => {
            const qty = Number(c.quantity || 1);
            const paidTotal = qty * Number(c.pricePaid || 0);
            const valTotal = qty * Number(c.estimatedValue || 0);
            return (
              <article
                key={c.id}
                style={{
                  background: "#2b0f1d",
                  borderRadius: "12px",
                  border: "1px solid rgba(255,182,193,0.25)",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.55)",
                  padding: "10px",
                  fontSize: "0.82rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                }}
              >
                {c.image && (
                  <div
                    style={{
                      width: "100%",
                      paddingTop: "140%",
                      position: "relative",
                      overflow: "hidden",
                      borderRadius: "10px",
                      background: "#1e0d14",
                    }}
                  >
                    <img
                      src={c.image}
                      alt={c.name || "card image"}
                      style={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                      }}
                    />
                  </div>
                )}
                <div style={{ fontWeight: 700, color: "#ffb6c1", marginBottom: "4px" }}>
                  {c.name || "Unnamed card"}
                </div>
                <div style={{ color: "var(--text-soft)", marginBottom: "4px" }}>{c.setName || ""}</div>
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-soft)" }}>
                  <span>#{c.number || "-"}</span>
                  <span>{c.rarity || ""}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-soft)", marginTop: "4px" }}>
                  <span>Cond: {c.condition || "N/A"}</span>
                  <span>Qty: {qty}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-soft)", marginTop: "4px" }}>
                  <span>Paid: ${paidTotal.toFixed(2)}</span>
                  <span>Value: ${valTotal.toFixed(2)}</span>
                </div>
                                {c.notes && (
                  <div
                    style={{
                      color: "#9c8fa6",
                      fontSize: "0.72rem",
                      fontStyle: "italic",
                      textAlign: "center",
                      marginTop: "6px",
                    }}
                  >
                    "{c.notes}"
                  </div>
                )}
                <div style={{ marginTop: "4px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                  <span
                    style={{
                      padding: "2px 7px",
                      borderRadius: "999px",
                      background: "rgba(255,105,180,0.18)",
                      border: "1px solid rgba(255,105,180,0.5)",
                      color: "#ffb6c1",
                      fontSize: "0.7rem",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {c.game === "pokemon" ? "Pokemon" : "One Piece"}
                  </span>
                  {admin && (
                    <div style={{ display: "flex", gap: "6px", alignItems: "center", marginLeft: "auto" }}>
                      <button
                        onClick={() =>
                          setEditCard({
                            ...c,
                            pricePaid: c.pricePaid ?? "",
                            estimatedValue: c.estimatedValue ?? "",
                            quantity: c.quantity ?? 1,
                          })
                        }
                        style={{
                          padding: "3px 8px",
                          borderRadius: "999px",
                          border: "1px solid rgba(255,182,193,0.5)",
                          background: "rgba(255,105,180,0.15)",
                          color: "#ffb6c1",
                          fontSize: "0.7rem",
                          cursor: "pointer",
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(c.id)}
                        style={{
                          padding: "3px 8px",
                          borderRadius: "999px",
                          border: "1px solid rgba(244,67,54,0.7)",
                          background: "rgba(244,67,54,0.12)",
                          color: "#ff8a80",
                          fontSize: "0.7rem",
                          cursor: "pointer",
                        }}
                      >
                        Delete
                      </button>
                    </div>
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

