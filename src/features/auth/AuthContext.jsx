import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, updateProfile } from "firebase/auth";
import { serverTimestamp } from "firebase/firestore";
import { auth } from "../../lib/firebase";
import { DEMO, store } from "../../lib/store";
import { DEFAULT_WEBHOOKS, postWebhook } from "../../lib/webhooks";

const AuthContext = createContext(null);

/** Create/refresh users/{uid}. Role is only ever read back, never escalated here. */
async function ensureUserDoc(firebaseUser) {
  let existing = null;
  try {
    existing = await store.getDocument("users", firebaseUser.uid);
  } catch (err) {
    console.warn("Failed to read user doc", err);
  }
  const role = (existing?.role || "viewer").toLowerCase() === "admin" ? "admin" : "viewer";
  try {
    await store.setDocument(
      "users",
      firebaseUser.uid,
      {
        role,
        email: firebaseUser.email || existing?.email || "",
        displayName: firebaseUser.displayName || existing?.displayName || "",
        createdAt: existing?.createdAt || serverTimestamp(),
      },
      { merge: true }
    );
    if (!existing) {
      const who = firebaseUser.displayName || firebaseUser.email || firebaseUser.uid;
      postWebhook(DEFAULT_WEBHOOKS.signup, `New signup: ${who}`);
    }
  } catch (err) {
    console.error("Failed to ensure user doc", err);
  }
  return role;
}

const DEMO_USERS = {
  admin: { uid: "demo-admin", email: "demo@localhost", displayName: "Demo Admin", photoURL: "" },
  viewer: { uid: "demo-viewer", email: "viewer@example.com", displayName: "Viewer", photoURL: "" },
};

function DemoAuthProvider({ children }) {
  const [role, setRole] = useState(() => {
    try {
      return sessionStorage.getItem("demoRole") || "admin";
    } catch {
      return "admin";
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem("demoRole", role);
    } catch {
      /* ignore */
    }
  }, [role]);
  const user = role === "signedOut" ? null : DEMO_USERS[role];
  const value = useMemo(
    () => ({
      user,
      role: role === "admin" ? "admin" : "viewer",
      isAdmin: role === "admin",
      loading: false,
      demo: true,
      demoRole: role,
      setDemoRole: setRole,
      signInWithGoogle: async () => setRole("admin"),
      signOut: async () => setRole("signedOut"),
      updateDisplayName: async () => {},
    }),
    [role, user]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function FirebaseAuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState("viewer");
  const [loading, setLoading] = useState(true);

  useEffect(
    () =>
      onAuthStateChanged(auth, async (firebaseUser) => {
        setUser(firebaseUser);
        setRole(firebaseUser ? await ensureUserDoc(firebaseUser) : "viewer");
        setLoading(false);
      }),
    []
  );

  const signInWithGoogle = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    await signInWithPopup(auth, provider);
  }, []);

  const doSignOut = useCallback(() => signOut(auth), []);

  const updateDisplayName = useCallback(async (name) => {
    if (!auth.currentUser) return;
    await updateProfile(auth.currentUser, { displayName: name });
    await store.setDocument("users", auth.currentUser.uid, { displayName: name }, { merge: true });
    setUser({ ...auth.currentUser });
  }, []);

  const value = useMemo(
    () => ({
      user,
      role,
      isAdmin: role === "admin",
      loading,
      demo: false,
      signInWithGoogle,
      signOut: doSignOut,
      updateDisplayName,
    }),
    [user, role, loading, signInWithGoogle, doSignOut, updateDisplayName]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const AuthProvider = DEMO ? DemoAuthProvider : FirebaseAuthProvider;

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
