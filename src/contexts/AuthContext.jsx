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
  const DISCORD_SIGNUP_WEBHOOK =
    "https://discord.com/api/webhooks/1451655828078723156/EA8QhLeiTT-7jOVQ6jFpV2he2zxVpAddAhlu8CiC6RtGFu9wTAOLdRjKeYHIV1OhVbmm";

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

      // If this is a brand-new user doc (no existing data), send a Discord webhook notification
      if (!existing && DISCORD_SIGNUP_WEBHOOK) {
        try {
          const display = firebaseUser.displayName || firebaseUser.email || firebaseUser.uid;
          await fetch(DISCORD_SIGNUP_WEBHOOK, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content: `New signup: ${display}`,
            }),
          });
        } catch (e) {
          console.warn("Failed to send signup webhook", e);
        }
      }
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
