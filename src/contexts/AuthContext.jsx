import { createContext, useContext, useEffect, useState } from "react";
import { auth, db } from "../firebaseConfig";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [admin, setAdmin] = useState(false);
  const [role, setRole] = useState("viewer");
  const [loading, setLoading] = useState(true);

  const ensureUserDoc = async (firebaseUser) => {
    if (!firebaseUser) return null;
    const ref = doc(db, "users", firebaseUser.uid);
    let existing = null;

    try {
      const snap = await getDoc(ref);
      if (snap.exists()) {
        existing = snap.data();
      }
    } catch (err) {
      console.warn("Failed to read user doc", err);
    }

    const payload = {
      role: (existing?.role || "viewer").toLowerCase() === "admin" ? "admin" : "viewer",
      email: firebaseUser.email || existing?.email || "",
      displayName: firebaseUser.displayName || existing?.displayName || "",
      createdAt: existing?.createdAt || serverTimestamp(),
    };

    try {
      await setDoc(ref, payload, { merge: true });
    } catch (err) {
      console.error("Failed to ensure user doc", err);
    }

    return { ...existing, ...payload };
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      if (firebaseUser) {
        try {
          const data = await ensureUserDoc(firebaseUser);
          const userRole = data?.role || "viewer";
          setRole(userRole);
          setAdmin(userRole.toLowerCase() === "admin");
        } catch (err) {
          console.error("Error checking role:", err);
          setAdmin(false);
          setRole("viewer");
        }
      } else {
        setAdmin(false);
        setRole("viewer");
      }

      setLoading(false);
    });

    return () => unsub();
  }, []);

  const login = async (email, password) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, admin, role, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
