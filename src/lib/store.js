// Thin data-access layer over Firestore.
// Every read/write in the app goes through here so `npm run demo` can swap in
// an in-memory store (see demoStore.js) without touching real data.
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
  updateDoc,
  addDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import * as demo from "./demoStore";

export const DEMO = import.meta.env.VITE_DEMO === "1";

const firestoreStore = {
  listenCollection(name, onData, onError) {
    return onSnapshot(
      collection(db, name),
      (snap) => onData(snap.docs.map((d) => ({ ...d.data(), id: d.id }))),
      onError
    );
  },
  listenDoc(name, id, onData, onError) {
    return onSnapshot(doc(db, name, id), (snap) => onData(snap.exists() ? snap.data() : null), onError);
  },
  async getCollection(name) {
    const snap = await getDocs(collection(db, name));
    return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
  },
  async getDocument(name, id) {
    const snap = await getDoc(doc(db, name, id));
    return snap.exists() ? snap.data() : null;
  },
  async addDocument(name, data) {
    const ref = await addDoc(collection(db, name), data);
    return ref.id;
  },
  updateDocument(name, id, data) {
    return updateDoc(doc(db, name, id), data);
  },
  setDocument(name, id, data, options = {}) {
    return setDoc(doc(db, name, id), data, options);
  },
  deleteDocument(name, id) {
    return deleteDoc(doc(db, name, id));
  },
  // ops: [{ type: "add" | "update" | "set" | "delete", col, id?, data? }]
  // Firestore caps a batch at 500 writes, so large jobs are chunked.
  async batch(ops) {
    for (let i = 0; i < ops.length; i += 450) {
      const batch = writeBatch(db);
      for (const op of ops.slice(i, i + 450)) {
        if (op.type === "add") batch.set(doc(collection(db, op.col)), op.data);
        else if (op.type === "update") batch.update(doc(db, op.col, op.id), op.data);
        else if (op.type === "set") batch.set(doc(db, op.col, op.id), op.data, { merge: !!op.merge });
        else if (op.type === "delete") batch.delete(doc(db, op.col, op.id));
      }
      await batch.commit();
    }
  },
};

export const store = DEMO ? demo.demoStore : firestoreStore;
