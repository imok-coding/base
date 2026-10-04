// In-memory stand-in for Firestore, used only by `npm run demo`.
// Seeds the manga collections from the bundled JSON export.

const collections = new Map(); // name -> Map(id -> data)
const listeners = new Map(); // name -> Set(fn)
let seeded = null;

function col(name) {
  if (!collections.has(name)) collections.set(name, new Map());
  return collections.get(name);
}

function emit(name) {
  const rows = [...col(name).entries()].map(([id, data]) => ({ ...data, id }));
  (listeners.get(name) || new Set()).forEach((fn) => fn(rows));
}

function newId() {
  return Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
}

function seed() {
  if (seeded) return seeded;
  seeded = (async () => {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}manga-library-wishlist.json`);
      const json = await res.json();
      for (const name of ["library", "wishlist"]) {
        for (const row of json[name] || []) {
          const { id, kind, ...data } = row;
          col(name).set(id || newId(), data);
        }
      }
    } catch (err) {
      console.warn("Demo seed failed", err);
    }
    const now = Date.now();
    col("suggestions").set("s1", {
      content: "Frieren: Beyond Journey's End",
      type: "manga",
      from: "A friend",
      createdAt: new Date(now - 864e5).toISOString(),
    });
    col("suggestions").set("s2", {
      content: "Dandadan — the art is unreal",
      type: "manga",
      from: "viewer@example.com",
      createdAt: new Date(now - 3 * 864e5).toISOString(),
    });
    col("suggestions").set("s3", {
      content: "Watch Mob Psycho 100",
      type: "anime",
      from: "viewer@example.com",
      createdAt: new Date(now - 9 * 864e5).toISOString(),
    });
    col("users").set("demo-admin", { role: "admin", email: "demo@localhost", displayName: "Demo Admin" });
    col("users").set("demo-viewer", { role: "viewer", email: "viewer@example.com", displayName: "Viewer" });
    col("settings").set("webhooks", { yearly: "", release: "", activity: "" });
  })();
  return seeded;
}

const delay = (ms = 120) => new Promise((r) => setTimeout(r, ms));

export const demoStore = {
  listenCollection(name, onData) {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name).add(onData);
    seed().then(() => emit(name));
    return () => listeners.get(name)?.delete(onData);
  },
  listenDoc(name, id, onData) {
    const fn = () => onData(col(name).get(id) ?? null);
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name).add(fn);
    seed().then(fn);
    return () => listeners.get(name)?.delete(fn);
  },
  async getCollection(name) {
    await seed();
    await delay();
    return [...col(name).entries()].map(([id, data]) => ({ ...data, id }));
  },
  async getDocument(name, id) {
    await seed();
    return col(name).get(id) ?? null;
  },
  async addDocument(name, data) {
    await delay();
    const id = newId();
    col(name).set(id, { ...data });
    emit(name);
    return id;
  },
  async updateDocument(name, id, data) {
    await delay();
    if (!col(name).has(id)) throw new Error(`No document ${name}/${id}`);
    col(name).set(id, { ...col(name).get(id), ...data });
    emit(name);
  },
  async setDocument(name, id, data, options = {}) {
    await delay();
    col(name).set(id, options.merge ? { ...(col(name).get(id) || {}), ...data } : { ...data });
    emit(name);
  },
  async deleteDocument(name, id) {
    await delay();
    col(name).delete(id);
    emit(name);
  },
  async batch(ops) {
    await delay(200);
    const touched = new Set();
    for (const op of ops) {
      const c = col(op.col);
      if (op.type === "add") c.set(newId(), { ...op.data });
      else if (op.type === "update") c.set(op.id, { ...(c.get(op.id) || {}), ...op.data });
      else if (op.type === "set") c.set(op.id, op.merge ? { ...(c.get(op.id) || {}), ...op.data } : { ...op.data });
      else if (op.type === "delete") c.delete(op.id);
      touched.add(op.col);
    }
    touched.forEach(emit);
  },
};
