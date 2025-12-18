import "./SignIn.css";
import { useEffect } from "react";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth, db } from "../firebaseConfig";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function SignIn() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const upsertUserDoc = async (u) => {
    if (!u?.uid) return;
    const ref = doc(db, "users", u.uid);
    try {
      const snap = await getDoc(ref);
      const existing = snap.exists() ? snap.data() : null;
      const role = existing?.role || "viewer";
      await setDoc(
        ref,
        {
          role,
          email: u.email || existing?.email || "",
          displayName: u.displayName || existing?.displayName || "",
          createdAt: existing?.createdAt || serverTimestamp(),
        },
        { merge: true }
      );
    } catch (err) {
      console.warn("Failed to upsert user doc", err);
    }
  };

  // Already signed in? Ensure user doc exists before redirecting.
  useEffect(() => {
    if (!user?.uid) return;
    upsertUserDoc(user).finally(() => navigate("/"));
  }, [user, navigate]);

  async function googleSignIn() {
    try {
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);

      // Ensure user document exists with default role on every sign in
      await upsertUserDoc(cred.user);

      // Redirect after sign in
      navigate("/");
    } catch (err) {
      console.error(err);
      alert("Google Sign-In failed.");
    }
  }

  return (
    <div className="signin-page">
      <div className="signin-card">
        <h2 className="signin-title">Welcome Back</h2>
        <p className="signin-sub">Sign in to access the dashboard & edit collections.</p>

        <button className="google-btn" onClick={googleSignIn}>
          <img
            src="https://www.svgrepo.com/show/475656/google-color.svg"
            alt=""
            className="google-icon"
          />
          Continue with Google
        </button>

        <button className="signin-cancel" onClick={() => navigate("/")}>
          {"<"} Back to Home
        </button>
      </div>
    </div>
  );
}
