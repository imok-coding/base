import { useState } from "react";
import { Copy, Gamepad2, ShieldAlert } from "lucide-react";
import { useAuth } from "../auth/AuthContext";

export const GAMES_RULE = `match /games/{gameId} {
  allow read: if true;
  allow write: if request.auth != null
    && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "admin";
}`;

/** Shown while Firestore rules don't cover the `games` collection yet. */
export default function SetupNotice() {
  const { isAdmin } = useAuth();
  const [copied, setCopied] = useState(false);

  if (!isAdmin) {
    return (
      <div className="empty">
        <div className="empty-icon">
          <Gamepad2 />
        </div>
        <div className="empty-title">The game library is almost here</div>
        <div className="empty-text">Check back soon.</div>
      </div>
    );
  }

  return (
    <div className="card" style={{ maxWidth: 680, margin: "0 auto" }}>
      <div className="card-title" style={{ color: "var(--text-1)", fontSize: "var(--text-lg)" }}>
        <ShieldAlert /> One-time setup: allow the games collection
      </div>
      <p className="muted" style={{ marginTop: 8, fontSize: "var(--text-sm)" }}>
        Firestore is blocking the new <code>games</code> collection. In the Firebase console open{" "}
        <strong>Firestore Database → Rules</strong>, paste this inside{" "}
        <code>match /databases/{"{database}"}/documents</code> (next to your <code>library</code> rule), then{" "}
        <strong>Publish</strong> and refresh this page.
      </p>
      <pre className="setup-code">{GAMES_RULE}</pre>
      <button
        type="button"
        className="btn btn--soft btn--sm"
        style={{ marginTop: 10 }}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(GAMES_RULE);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        <Copy /> {copied ? "Copied" : "Copy rule"}
      </button>
    </div>
  );
}
