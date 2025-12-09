import { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from '../api/firebase.js';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [admin, setAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // Example admin check:
        // Firestore doc: roles/<uid> with { admin: true }
        try {
          const ref = doc(db, 'roles', u.uid);
          const snap = await getDoc(ref);
          if (snap.exists() && snap.data().admin === true) {
            setAdmin(true);
          } else {
            setAdmin(false);
          }
        } catch (err) {
          console.error('Error checking admin role:', err);
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
