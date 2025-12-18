import React from "react";

export default function SuggestionModal({
  open,
  title,
  placeholder,
  value,
  status,
  loading,
  onChange,
  onSubmit,
  onClose,
}) {
  if (!open) return null;

  const statusColor =
    typeof status === "string" && status.toLowerCase().startsWith("sent!")
      ? "#a3f0cf"
      : "#ffb6c1";

  return (
    <div
      className="suggestion-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
    >
      <div className="suggestion-modal">
        <div className="suggestion-modal-header">
          <h3>{title}</h3>
          <button className="suggestion-close" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="suggestion-hint">
          Tell me what to add next. Titles only is fine, but extra notes are welcome.
        </p>
        <textarea
          className="suggestion-textarea"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          maxLength={500}
        />
        {status && (
          <div className="suggestion-status" style={{ color: statusColor }}>
            {status}
          </div>
        )}
        <div className="suggestion-actions">
          <button
            className="suggestion-send"
            type="button"
            onClick={onSubmit}
            disabled={loading}
          >
            {loading ? "Sending..." : "Send Suggestion"}
          </button>
          <button className="suggestion-cancel" type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
