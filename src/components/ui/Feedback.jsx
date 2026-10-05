// Toasts and confirm dialogs (used instead of alert() / confirm()).
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import Sheet from "./Sheet";

const FeedbackContext = createContext(null);
const ICONS = { success: CheckCircle2, error: AlertCircle, info: Info };

export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null);
  const [option, setOption] = useState(false);
  const resolver = useRef(null);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((ts) => ts.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 200);
  }, []);

  const toast = useCallback(
    (message, { type = "success", action, duration = 3800 } = {}) => {
      const id = ++idRef.current;
      setToasts((ts) => [...ts.slice(-2), { id, message, type, action }]);
      setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss]
  );

  /**
   * confirm({ title, message, confirmLabel, danger, option: { label, default } })
   * returns Promise<null | { option: boolean }>
   */
  const confirm = useCallback((opts) => {
    setOption(!!opts.option?.default);
    setDialog({ ...opts, open: true });
    return new Promise((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = (result) => {
    resolver.current?.(result);
    resolver.current = null;
    setDialog((d) => (d ? { ...d, open: false } : d));
  };

  const value = useMemo(() => ({ toast, confirm }), [toast, confirm]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <div className="toaster" role="status" aria-live="polite">
        {toasts.map((t) => {
          const Icon = ICONS[t.type] || Info;
          return (
            <div key={t.id} className={`toast toast--${t.type} ${t.leaving ? "is-leaving" : ""}`}>
              <Icon />
              <span className="toast-msg">{t.message}</span>
              {t.action && (
                <button
                  type="button"
                  className="btn btn--sm btn--ghost"
                  onClick={() => {
                    t.action.onClick();
                    dismiss(t.id);
                  }}
                >
                  {t.action.label}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <Sheet
        open={!!dialog?.open}
        onClose={() => settle(null)}
        title={dialog?.title}
        width={440}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => settle(null)}>
              {dialog?.cancelLabel || "Cancel"}
            </button>
            <button
              type="button"
              className={`btn ${dialog?.danger ? "btn--danger" : "btn--primary"}`}
              onClick={() => settle({ option })}
              autoFocus
            >
              {dialog?.confirmLabel || "Confirm"}
            </button>
          </>
        }
      >
        {dialog?.message && <p className="muted">{dialog.message}</p>}
        {dialog?.option && (
          <label className="switch" style={{ marginTop: 16 }}>
            <input type="checkbox" checked={option} onChange={(e) => setOption(e.target.checked)} />
            {dialog.option.label}
          </label>
        )}
      </Sheet>
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error("useFeedback must be used inside <FeedbackProvider>");
  return ctx;
}
