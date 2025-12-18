import "./Navbar.css";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import AuthModal from "../AuthModal/AuthModal";

import { signOut, updateProfile } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "../../firebaseConfig";

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [profileNameEdit, setProfileNameEdit] = useState("");
  const [profileSaveStatus, setProfileSaveStatus] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileEditing, setProfileEditing] = useState(false);
  const nameInputRef = useRef(null);

  const { user, admin, role } = useAuth();
  const navigate = useNavigate();

  // Close profile menu whenever auth state changes
  useEffect(() => {
    setProfileMenuOpen(false);
    setProfileEditOpen(false);
    setProfileSaveStatus("");
    setProfileEditing(false);
    setProfileNameEdit(user?.displayName || user?.email?.split("@")[0] || "");
  }, [user]);

  // --- AUTH HANDLER: LOGOUT ---
  async function handleLogoutClick() {
    try {
      await signOut(auth);

      setOpen(false);
      setProfileMenuOpen(false);
      navigate("/");
    } catch (err) {
      console.error(err);
      alert("Logout failed.");
    }
  }

  const handleOpenProfileEdit = () => {
    if (!user) {
      setOpen(false);
      setShowAuth(true);
      return;
    }
    setProfileMenuOpen(false);
    setProfileSaveStatus("");
    setProfileEditing(false);
    setProfileEditOpen(true);
  };

  const handleSaveProfile = async () => {
    if (!user) {
      setOpen(false);
      setShowAuth(true);
      return;
    }
    const name = (profileNameEdit || "").trim();
    if (!name) {
      setProfileSaveStatus("Display name is required.");
      return;
    }
    setProfileSaving(true);
    setProfileSaveStatus("");
    setProfileEditing(false);
    try {
      await updateProfile(auth.currentUser, { displayName: name });
      await setDoc(doc(db, "users", user.uid), { displayName: name }, { merge: true });
      setProfileSaveStatus("Profile updated.");
      setProfileEditing(false);
    } catch (err) {
      console.error("Failed to update profile", err);
      setProfileSaveStatus("Failed to update profile.");
    } finally {
      setProfileSaving(false);
    }
  };

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
      <nav
        className={`menu-panel ${open ? "open" : ""}`}
        onMouseLeave={() => setProfileMenuOpen(false)}
      >
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

        <Link to="/music" className="menu-item" onClick={() => setOpen(false)}>
          Music
        </Link>

        <Link to="/steam" className="menu-item" onClick={() => setOpen(false)}>
          Gaming
        </Link>

        {/* ADMIN-ONLY DASHBOARD */}
        {admin && (
          <Link
            to="/dashboard"
            className="menu-item"
            onClick={() => setOpen(false)}
          >
            Dashboard
          </Link>
        )}

        {/* Footer: divider + profile summary */}
        <div className="menu-footer">
          <div className="profile-divider" />
          <div
            className="profile-card"
            onMouseEnter={() => user && setProfileMenuOpen(true)}
            onMouseLeave={() => setProfileMenuOpen(false)}
            onClick={() => {
              if (!user) {
                setProfileMenuOpen(false);
                setOpen(false);
                setShowAuth(true);
              } else {
                setProfileMenuOpen((v) => !v);
              }
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (!user) {
                  setOpen(false);
                  setShowAuth(true);
                } else {
                  setProfileMenuOpen((v) => !v);
                }
              }
            }}
          >
            <div className="profile-avatar">
              {user
                ? (user.displayName?.[0] ||
                    user.email?.[0] ||
                    user.uid?.[0] ||
                    "?").toUpperCase()
                : "?"}
            </div>
            <div className="profile-meta">
              <div className="profile-name">
                {user?.displayName || user?.email || "Guest"}
              </div>
              <div className="profile-role">
                {user ? (admin ? "admin" : (role || "viewer")) : "Not signed in"}
              </div>
            </div>
            {user && profileMenuOpen && (
              <div className="profile-menu">
                <button
                  type="button"
                  className="profile-menu-item"
                  onClick={handleOpenProfileEdit}
                >
                  Edit profile
                </button>
                <button type="button" className="profile-menu-item" onClick={handleLogoutClick}>
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Auth modal with Google + email/password */}
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}

      {profileEditOpen && (
        <div className="profile-edit-backdrop">
          <div className="profile-edit-card">
            <div className="profile-edit-header">
              <h3>Edit profile</h3>
              <button
                type="button"
                className="profile-edit-close"
                onClick={() => {
                  setProfileEditOpen(false);
                  setProfileSaveStatus("");
                  setProfileEditing(false);
                }}
              >
                ×
              </button>
            </div>
            <div className="profile-edit-body">
              <div className="profile-edit-avatar">
                {user
                  ? (user.displayName?.[0] ||
                      user.email?.[0] ||
                      user.uid?.[0] ||
                      "?").toUpperCase()
                  : "?"}
              </div>
                            <div className="profile-edit-field">
                <label className="profile-edit-label" htmlFor="displayName">
                  Display name
                </label>
                <div className="profile-edit-input-row">
                  <input
                    id="displayName"
                    className="profile-edit-input"
                    type="text"
                    readOnly={!profileEditing}
                    value={profileNameEdit}
                    onChange={(e) => setProfileNameEdit(e.target.value)}
                    maxLength={40}
                    placeholder="Enter display name"
                    ref={nameInputRef}
                    onBlur={() => {
                      if (profileEditing) handleSaveProfile();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && profileEditing) {
                        e.preventDefault();
                        handleSaveProfile();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="profile-edit-pencil"
                    onClick={() => {
                      setProfileEditing(true);
                      setProfileSaveStatus("");
                      setTimeout(() => nameInputRef.current?.focus(), 50);
                    }}
                    aria-label="Edit display name"
                  >
                    ✎
                  </button>
                </div>
                <div className="profile-edit-hint">
                  Click the pencil to edit. Changes save on blur or Enter.
                </div>
              </div>
            </div>
            {profileSaveStatus && (
              <div className="profile-edit-status">{profileSaveStatus}</div>
            )}
            {profileSaving && (
              <div className="profile-edit-status saving">Saving...</div>
            )}
          </div>
        </div>
      )}
    </>
  );
}










