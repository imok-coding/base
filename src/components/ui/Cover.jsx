import { useState } from "react";
import { BookOpen } from "lucide-react";
import { coverSrc } from "../../lib/images";

/** Book cover with lazy loading, fade-in and a graceful placeholder. */
export default function Cover({ src, alt = "", size = 480, eager = false, className = "", fallback, children }) {
  const [state, setState] = useState(src ? "loading" : "error");
  const [prevSrc, setPrevSrc] = useState(src);
  if (src !== prevSrc) {
    setPrevSrc(src);
    setState(src ? "loading" : "error");
  }
  const resized = coverSrc(src, size);

  return (
    <div className={`cover ${className}`} data-state={state}>
      {state !== "error" && (
        <img
          src={resized}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          draggable="false"
          onLoad={() => setState("loaded")}
          onError={(e) => {
            // the resized URL might not exist — retry once with the original
            if (resized !== src && e.currentTarget.src !== src) e.currentTarget.src = src;
            else setState("error");
          }}
        />
      )}
      {state === "error" &&
        (fallback || (
          <div className="cover-fallback" aria-hidden="true">
            <BookOpen />
            {alt && <span className="clamp-3">{alt}</span>}
          </div>
        ))}
      {children}
    </div>
  );
}
