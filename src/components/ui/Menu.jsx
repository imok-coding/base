import { useEffect, useRef, useState } from "react";

/**
 * Dropdown menu. `trigger` is a render function receiving button props.
 * Items: { label, icon: Icon, onClick, danger, trail, separator, heading, hidden }
 */
export default function Menu({ trigger, items, align = "right", up = false, children, className = "" }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!wrap.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={`menu-anchor ${className}`} ref={wrap}>
      {trigger({
        onClick: () => setOpen((o) => !o),
        "aria-expanded": open,
        "aria-haspopup": "menu",
      })}
      {open && (
        <div className={`menu ${align === "left" ? "menu--left" : ""} ${up ? "menu--up" : ""}`} role="menu">
          {children}
          {items
            ?.filter((it) => it && !it.hidden)
            .map((it, i) => {
              if (it.separator) return <div className="menu-sep" key={`sep-${i}`} />;
              if (it.heading)
                return (
                  <div className="menu-label" key={`h-${i}`}>
                    {it.heading}
                  </div>
                );
              const Icon = it.icon;
              return (
                <button
                  key={it.label}
                  type="button"
                  role="menuitem"
                  className={`menu-item ${it.danger ? "menu-item--danger" : ""}`}
                  disabled={it.disabled}
                  onClick={() => {
                    setOpen(false);
                    it.onClick?.();
                  }}
                >
                  {Icon && <Icon />}
                  <span>{it.label}</span>
                  {it.trail && <span className="menu-trail">{it.trail}</span>}
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
}
