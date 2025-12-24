// src/components/AuthModal/AuthModal.jsx
import "./AuthModal.css";
import { useState } from "react";
import { auth } from "../../firebaseConfig";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from "firebase/auth";

export default function AuthModal({ onClose }) {
  const [mode, setMode] = useState("login"); // login | register
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function googleLogin() {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      onClose();
    } catch (err) {
      alert(err.message);
    }
  }

  async function emailLogin(e) {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email, password);
      onClose();
    } catch (err) {
      alert(err.message);
    }
  }

  async function emailRegister(e) {
    e.preventDefault();
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      onClose();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div className="auth-modal-backdrop" onClick={onClose}>
      <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="auth-title">
          {mode === "login" ? "Sign In" : "Create Account"}
        </h2>

        {/* Google Login */}
        <button className="google-btn" onClick={googleLogin}>
          <img
            src="https://www.svgrepo.com/show/475656/google-color.svg"
            alt=""
            className="google-icon"
          />
          Continue with Google
        </button>

        <div className="auth-divider">
          <span>or</span>
        </div>

        {/* Email Form */}
        <form
          onSubmit={mode === "login" ? emailLogin : emailRegister}
          className="auth-form"
        >
          <input
            type="email"
            placeholder="Email address"
            className="auth-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <input
            type="password"
            placeholder="Password"
            className="auth-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <button className="auth-submit">
            {mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>

        <div className="auth-switcher">
          {mode === "login" ? (
            <p>
              No account?{" "}
              <button onClick={() => setMode("register")}>Register</button>
            </p>
          ) : (
            <p>
              Already have an account?{" "}
              <button onClick={() => setMode("login")}>Sign in</button>
            </p>
          )}
        </div>

        <button className="auth-close" onClick={onClose} aria-label="Close">
          X
        </button>
      </div>
    </div>
  );
}
