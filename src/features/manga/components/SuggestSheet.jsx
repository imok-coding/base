import { useState } from "react";
import { Send } from "lucide-react";
import Sheet from "../../../components/ui/Sheet";
import { useFeedback } from "../../../components/ui/Feedback";
import { useAuth } from "../../auth/AuthContext";
import { submitSuggestion } from "../api";

const LIMIT = 5;
const WINDOW_MS = 60 * 60 * 1000;
const KEY = "mangaSuggestionsSent";

function recentSends() {
  try {
    const arr = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(arr) ? arr.filter((t) => Date.now() - t < WINDOW_MS) : [];
  } catch {
    return [];
  }
}

export default function SuggestSheet({ open, onClose }) {
  const { user } = useAuth();
  const { toast } = useFeedback();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const send = async () => {
    const recent = recentSends();
    if (recent.length >= LIMIT) {
      setError("That's 5 suggestions this hour — try again a bit later.");
      return;
    }
    if (!text.trim()) {
      setError("Type a title first.");
      return;
    }
    setSending(true);
    setError("");
    try {
      await submitSuggestion(text, user);
      try {
        localStorage.setItem(KEY, JSON.stringify([...recent, Date.now()].slice(-LIMIT)));
      } catch {
        /* ignore */
      }
      setText("");
      toast("Suggestion sent — thank you!");
      onClose();
    } catch (err) {
      console.error(err);
      setError("Couldn't send that. Please try again later.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Suggest a manga"
      subtitle="Something I should read or add to the shelf? Titles are fine, notes welcome."
      width={500}
      footer={
        <>
          <button type="button" className="btn btn--ghost hide-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={send} disabled={sending}>
            {sending ? <span className="spinner" /> : <Send />}
            Send
          </button>
        </>
      }
    >
      <textarea
        className="textarea"
        placeholder="e.g. Frieren — you'd love it"
        maxLength={500}
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label="Suggestion"
      />
      <div className="field-hint" style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
        <span style={{ color: error ? "var(--danger)" : undefined }}>{error}</span>
        <span>{text.length}/500</span>
      </div>
    </Sheet>
  );
}
