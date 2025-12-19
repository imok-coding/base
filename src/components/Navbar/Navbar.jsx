import "./Navbar.css";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import AuthModal from "../AuthModal/AuthModal";

import {
  GoogleAuthProvider,
  OAuthProvider,
  linkWithPopup,
  signOut,
  unlink,
  updateProfile,
} from "firebase/auth";
import { deleteField, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../../firebaseConfig";

export default function Navbar() {
  const GOOGLE_PROVIDER_ID = "google.com";
  const DISCORD_PROVIDER_ID = "oidc.discord";

  const [open, setOpen] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [profileNameEdit, setProfileNameEdit] = useState("");
  const [profileSaveStatus, setProfileSaveStatus] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("");
  const [connectionsLoading, setConnectionsLoading] = useState({
    google: false,
    discord: false,
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileEditing, setProfileEditing] = useState(false);
  const nameInputRef = useRef(null);

  const { user, admin, role } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    setProfileMenuOpen(false);
    setProfileEditOpen(false);
    setProfileSaveStatus("");
    setConnectionStatus("");
    setProfileEditing(false);
    setProfileNameEdit(user?.displayName || user?.email?.split("@")[0] || "");
  }, [user]);

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
    setConnectionStatus("");
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

  const isLinked = (providerId) =>
    !!user?.providerData?.some((p) => p.providerId === providerId);

  const handleLinkGoogle = async () => {
    if (!user) {
      setOpen(false);
      setShowAuth(true);
      return;
    }
    if (isLinked(GOOGLE_PROVIDER_ID)) {
      setConnectionStatus("Google is already connected.");
      return;
    }
    setConnectionsLoading((p) => ({ ...p, google: true }));
    setConnectionStatus("");
    try {
      const provider = new GoogleAuthProvider();
      const result = await linkWithPopup(auth.currentUser, provider);
      await setDoc(
        doc(db, "users", user.uid),
        {
          connections: {
            [GOOGLE_PROVIDER_ID]: {
              email: result.user.email || "",
              connectedAt: serverTimestamp(),
            },
          },
        },
        { merge: true }
      );
      setConnectionStatus("Google connected.");
    } catch (err) {
      console.error("Failed to link Google", err);
      const msg =
        err?.code === "auth/credential-already-in-use"
          ? "That Google account is already linked elsewhere. Sign in with it instead."
          : "Could not connect Google.";
      setConnectionStatus(msg);
    } finally {
      setConnectionsLoading((p) => ({ ...p, google: false }));
    }
  };

  const handleLinkDiscord = async () => {
    if (!user) {
      setOpen(false);
      setShowAuth(true);
      return;
    }
    if (isLinked(DISCORD_PROVIDER_ID)) {
      setConnectionStatus("Discord is already connected.");
      return;
    }
    setConnectionsLoading((p) => ({ ...p, discord: true }));
    setConnectionStatus("");
    try {
      const provider = new OAuthProvider(DISCORD_PROVIDER_ID);
      provider.addScope("identify");
      provider.addScope("email");
      const result = await linkWithPopup(auth.currentUser, provider);
      const linkedProfile = result.user.providerData.find(
        (p) => p.providerId === DISCORD_PROVIDER_ID
      );
      await setDoc(
        doc(db, "users", user.uid),
        {
          connections: {
            [DISCORD_PROVIDER_ID]: {
              username: linkedProfile?.displayName || linkedProfile?.uid || "Discord",
              email: linkedProfile?.email || "",
              connectedAt: serverTimestamp(),
            },
          },
        },
        { merge: true }
      );
      setConnectionStatus("Discord connected.");
    } catch (err) {
      console.error("Failed to link Discord", err);
      const msg =
        err?.code === "auth/credential-already-in-use"
          ? "That Discord account is already linked elsewhere. Sign in with it instead."
          : "Could not connect Discord.";
      setConnectionStatus(msg);
    } finally {
      setConnectionsLoading((p) => ({ ...p, discord: false }));
    }
  };

  const handleUnlink = async (providerId) => {
    if (!user) return;
    if (user.providerData.length <= 1) {
      setConnectionStatus("You need at least one sign-in method.");
      return;
    }
    const key = providerId === GOOGLE_PROVIDER_ID ? "google" : "discord";
    setConnectionStatus("");
    setConnectionsLoading((p) => ({ ...p, [key]: true }));
    try {
      await unlink(auth.currentUser, providerId);
      await setDoc(
        doc(db, "users", user.uid),
        { connections: { [providerId]: deleteField() } },
        { merge: true }
      );
      setConnectionStatus("Connection removed.");
    } catch (err) {
      console.error("Failed to unlink", err);
      setConnectionStatus("Could not remove connection.");
    } finally {
      setConnectionsLoading((p) => ({ ...p, [key]: false }));
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

        {admin && (
          <Link
            to="/dashboard"
            className="menu-item"
            onClick={() => setOpen(false)}
          >
            Dashboard
          </Link>
        )}

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
                {user ? (admin ? "admin" : role || "viewer") : "Not signed in"}
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
                  setConnectionStatus("");
                  setProfileEditing(false);
                }}
              >
                &times;
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
                    {"\u270e"}
                  </button>
                </div>
                <div className="profile-edit-hint">
                  Click the pencil to edit. Changes save on blur or Enter.
                </div>
              </div>
            </div>

            <div className="profile-connections">
              <div className="profile-connections-header">
                <span>Connections</span>
                {connectionStatus && (
                  <span className="profile-connection-status">{connectionStatus}</span>
                )}
              </div>

              <div className="profile-connection-row">
                <div className="profile-connection-meta">
                  <div className="profile-connection-title">Google</div>
                  <div className="profile-connection-sub">
                    {isLinked(GOOGLE_PROVIDER_ID) ? "Connected" : "Not connected"}
                  </div>
                </div>
                <div className="profile-connection-actions">
                  {isLinked(GOOGLE_PROVIDER_ID) ? (
                    <button
                      type="button"
                      className="profile-connection-btn secondary"
                      onClick={() => handleUnlink(GOOGLE_PROVIDER_ID)}
                      disabled={connectionsLoading.google}
                    >
                      {connectionsLoading.google ? "Removing..." : "Remove"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="profile-connection-btn"
                      onClick={handleLinkGoogle}
                      disabled={connectionsLoading.google}
                    >
                      {connectionsLoading.google ? "Connecting..." : "Connect"}
                    </button>
                  )}
                </div>
              </div>

              <div className="profile-connection-row">
                <div className="profile-connection-meta">
                  <div className="profile-connection-title">Discord</div>
                  <div className="profile-connection-sub">
                    {isLinked(DISCORD_PROVIDER_ID) ? "Connected" : "Not connected"}
                  </div>
                </div>
                <div className="profile-connection-actions">
                  {isLinked(DISCORD_PROVIDER_ID) ? (
                    <button
                      type="button"
                      className="profile-connection-btn secondary"
                      onClick={() => handleUnlink(DISCORD_PROVIDER_ID)}
                      disabled={connectionsLoading.discord}
                    >
                      {connectionsLoading.discord ? "Removing..." : "Remove"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="profile-connection-btn"
                      onClick={handleLinkDiscord}
                      disabled={connectionsLoading.discord}
                    >
                      {connectionsLoading.discord ? "Connecting..." : "Connect"}
                    </button>
                  )}
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
