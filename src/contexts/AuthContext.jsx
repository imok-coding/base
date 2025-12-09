import { createContext, useContext, useEffect, useState } from "react";
import { auth, db } from "../firebaseConfig";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [admin, setAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      if (firebaseUser) {
        try {
          // 1) Preferred: admins/<uid> exists
          const adminRef = doc(db, "admins", firebaseUser.uid);
          const adminSnap = await getDoc(adminRef);

          if (adminSnap.exists()) {
            setAdmin(true);
          } else {
            // 2) Backwards-compat: roles/<uid> with { admin: true }
            const roleRef = doc(db, "roles", firebaseUser.uid);
            const roleSnap = await getDoc(roleRef);

            if (roleSnap.exists() && roleSnap.data().admin === true) {
              setAdmin(true);
            } else {
              setAdmin(false);
            }
          }
        } catch (err) {
          console.error("Error checking admin role:", err);
          setAdmin(false);
        }
      } else {
        setAdmin(false);
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
    <AuthContext.Provider value={{ user, admin, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
