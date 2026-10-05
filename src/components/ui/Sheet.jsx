import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";

/**
 * Modal dialog built on <dialog>. Centered on desktop, bottom sheet on phones
 * (drag the handle down to dismiss). Esc, backdrop click and the close button
 * all call onClose.
 */
export default function Sheet({
  open,
  onClose,
  title,
  subtitle,
  headerExtra,
  footer,
  width,
  className = "",
  hideHeader = false,
  children,
}) {
  const ref = useRef(null);
  const titleId = useId();
  const drag = useRef(null);
  // "open", then "closing" (exit animation), then "closed". Derived during render so
  // content never blinks out before the animation finishes.
  const [phase, setPhase] = useState(open ? "open" : "closed");
  if (open && phase !== "open") setPhase("open");
  if (!open && phase === "open") setPhase("closing");

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return undefined;
    if (phase === "open") {
      if (!dialog.open) dialog.showModal();
      return undefined;
    }
    if (phase === "closing") {
      const timer = setTimeout(() => {
        dialog.close();
        dialog.style.transform = "";
        setPhase("closed");
      }, 190);
      return () => clearTimeout(timer);
    }
    if (dialog.open) dialog.close();
    return undefined;
  }, [phase]);

  // Close the native dialog if this component unmounts while open.
  useEffect(() => {
    const dialog = ref.current;
    return () => dialog?.open && dialog.close();
  }, []);

  const onCancel = (e) => {
    e.preventDefault();
    onClose?.();
  };

  const onBackdrop = (e) => {
    if (e.target !== ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) onClose?.();
  };

  const onTouchStart = (e) => {
    if (window.innerWidth > 640) return;
    drag.current = { y: e.touches[0].clientY, dy: 0 };
  };
  const onTouchMove = (e) => {
    if (!drag.current) return;
    const dy = Math.max(0, e.touches[0].clientY - drag.current.y);
    drag.current.dy = dy;
    ref.current.style.transform = `translateY(${dy}px)`;
    ref.current.style.transition = "none";
  };
  const onTouchEnd = () => {
    if (!drag.current) return;
    const { dy } = drag.current;
    drag.current = null;
    ref.current.style.transition = "";
    if (dy > 90) onClose?.();
    else ref.current.style.transform = "";
  };

  return (
    <dialog
      ref={ref}
      className={`sheet ${phase === "closing" ? "is-closing" : ""} ${className}`}
      style={width ? { "--sheet-w": `${width}px` } : undefined}
      aria-labelledby={title ? titleId : undefined}
      onCancel={onCancel}
      onClick={onBackdrop}
    >
      <div className="sheet-grabber" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} />
      {!hideHeader && (
        <div className="sheet-header" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
          <div style={{ minWidth: 0 }}>
            {title && (
              <h2 className="sheet-title" id={titleId}>
                {title}
              </h2>
            )}
            {subtitle && <div className="sheet-subtitle">{subtitle}</div>}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {headerExtra}
            <button type="button" className="btn btn--ghost btn--icon" onClick={onClose} aria-label="Close">
              <X />
            </button>
          </div>
        </div>
      )}
      {phase !== "closed" && (
        <>
          <div className="sheet-body">{children}</div>
          {footer && <div className="sheet-footer">{footer}</div>}
        </>
      )}
    </dialog>
  );
}
