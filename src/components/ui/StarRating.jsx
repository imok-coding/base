import { useState } from "react";

const STAR_PATH = "M12 2.6l2.85 5.95 6.55.86-4.8 4.53 1.2 6.5L12 17.3l-5.8 3.14 1.2-6.5-4.8-4.53 6.55-.86z";

/** 0.5–5 star rating. Read-only unless onChange is given. */
export default function StarRating({ value, onChange, size = 22, showValue = true, label = "Rating" }) {
  const [hover, setHover] = useState(null);
  const base = Math.max(0, Math.min(5, Number(value) || 0));
  const shown = hover ?? base;
  const interactive = typeof onChange === "function";

  return (
    <div
      className="stars"
      style={{ "--star-size": `${size}px` }}
      role={interactive ? "group" : "img"}
      aria-label={interactive ? label : `${label}: ${base || "none"} of 5`}
    >
      <div className="stars-track" onMouseLeave={() => setHover(null)}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div className="star" key={i} style={{ "--fill": `${Math.max(0, Math.min(1, shown - i)) * 100}%` }}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path className="star-bg" d={STAR_PATH} />
            </svg>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path className="star-fg" d={STAR_PATH} />
            </svg>
          </div>
        ))}
        {interactive && (
          <div className="stars-hit">
            {Array.from({ length: 10 }, (_, i) => (i + 1) / 2).map((v) => (
              <button
                key={v}
                type="button"
                aria-label={`${v} stars`}
                aria-pressed={base === v}
                onMouseEnter={() => setHover(v)}
                onFocus={() => setHover(v)}
                onBlur={() => setHover(null)}
                onClick={() => onChange(base === v ? "" : v)}
              />
            ))}
          </div>
        )}
      </div>
      {showValue && <span className="stars-value">{shown ? shown.toFixed(1) : "—"}</span>}
    </div>
  );
}
