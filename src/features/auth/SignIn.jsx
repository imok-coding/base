import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { useAuth } from "./AuthContext";
import "./signin.css";

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}

export default function SignIn() {
  const { user, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    document.title = "Sign in · Tyler's Collection";
  }, []);

  useEffect(() => {
    if (user) navigate("/", { replace: true });
  }, [user, navigate]);

  const go = async () => {
    setBusy(true);
    setError("");
    try {
      await signInWithGoogle();
    } catch (err) {
      if (err?.code !== "auth/popup-closed-by-user" && err?.code !== "auth/cancelled-popup-request") {
        setError(
          err?.code === "auth/popup-blocked"
            ? "Your browser blocked the sign-in popup. Allow popups for this site and try again."
            : "Sign-in didn't work. Please try again."
        );
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page signin">
      <div className="signin-card card">
        <img
          className="signin-avatar"
          src={`${import.meta.env.BASE_URL}icons/icon-192.png`}
          alt=""
          width="88"
          height="88"
        />
        <h1 className="signin-title">Welcome back</h1>
        <p className="muted signin-sub">
          Sign in to suggest manga, or to manage the collection if you&apos;re an admin.
        </p>
        <button type="button" className="btn btn--lg btn--block signin-google" onClick={go} disabled={busy}>
          {busy ? <span className="spinner" /> : <GoogleMark />}
          Continue with Google
        </button>
        {error && (
          <p className="signin-error" role="alert">
            {error}
          </p>
        )}
        <p className="signin-note subtle">
          <ShieldCheck size={14} /> Only your name and email are stored.
        </p>
        <Link to="/" className="btn btn--ghost btn--sm">
          <ArrowLeft /> Back home
        </Link>
      </div>
    </div>
  );
}
