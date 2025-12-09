import "./Navbar.css";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import AuthModal from "../AuthModal/AuthModal"; // NEW — modal for Google + Email login

import { signOut } from "firebase/auth";
import { auth } from "../../firebaseConfig";

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [showAuth, setShowAuth] = useState(false); // NEW — controls modal visibility

  const { user, role } = useAuth();
  const navigate = useNavigate();

  // --- AUTH HANDLER: LOGOUT ---
  async function handleLogoutClick() {
    try {
      await signOut(auth);

      // Close menu on logout
      setOpen(false);

      // Redirect home
      navigate("/");
    } catch (err) {
      console.error(err);
      alert("Logout failed.");
    }
  }

  return (
    <>
      {/* Hamburger Button */}
      <button
        className={`menu-toggle ${open ? "active" : ""}`}
        onClick={() => setOpen(!open)}
      >
        <span></span>
        <span></span>
        <span></span>
      </button>

      {/* Sliding Left Menu */}
      <nav className={`menu-panel ${open ? "open" : ""}`}>
        <Link to="/" className="menu-item" onClick={() => setOpen(false)}>
          Home
        </Link>

        <Link to="/manga" className="menu-item" onClick={() => setOpen(false)}>
          Manga
        </Link>

        <Link to="/anime" className="menu-item" onClick={() => setOpen(false)}>
          Anime
        </Link>

        <Link to="/tcg" className="menu-item" onClick={() => setOpen(false)}>
          TCG
        </Link>

        {/* ADMIN-ONLY DASHBOARD */}
        {role === "admin" && (
          <Link
            to="/dashboard"
            className="menu-item"
            onClick={() => setOpen(false)}
          >
            Dashboard
          </Link>
        )}

        {/* AUTH SECTION */}
        <div className="auth-section">
          <p className="auth-section-status">
            {user
              ? `Signed in as ${user.email || user.uid}`
              : "Not signed in"}
          </p>

          <div>
            {/* SIGN IN BUTTON — Opens Modal */}
            {!user && (
              <button
                className="auth-btn"
                onClick={() => {
                  setOpen(false);
                  setShowAuth(true);
                }}
              >
                Sign in
              </button>
            )}

            {/* SIGN OUT BUTTON */}
            {user && (
              <button
                className="auth-btn secondary"
                onClick={handleLogoutClick}
              >
                Sign out
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* AUTH MODAL — Appears when clicking Sign In */}
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </>
  );
}
