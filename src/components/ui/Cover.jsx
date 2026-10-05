import { useState } from "react";
import { BookOpen } from "lucide-react";
import { coverSrc } from "../../lib/images";

// Cover image that lazy loads, fades in, and shows a placeholder if it fails.
// With fitSquare, square art (like PlayStation Store covers) is shown whole
// over a blurred copy instead of being cropped to the frame.
export default function Cover({
  src,
  alt = "",
  size = 480,
  eager = false,
  className = "",
  fitSquare = false,
  fallback,
  children,
}) {
  const [state, setState] = useState(src ? "loading" : "error");
  const [square, setSquare] = useState(false);
  const [prevSrc, setPrevSrc] = useState(src);
  if (src !== prevSrc) {
    setPrevSrc(src);
    setState(src ? "loading" : "error");
    setSquare(false);
  }
  const resized = coverSrc(src, size);

  return (
    <div className={`cover ${className}`} data-state={state} data-square={square || undefined}>
      {square && state !== "error" && <img className="cover-backdrop" src={resized} alt="" aria-hidden="true" />}
      {state !== "error" && (
        <img
          src={resized}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          draggable="false"
          onLoad={(e) => {
            const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
            if (fitSquare && h && w / h > 0.9) setSquare(true);
            setState("loaded");
          }}
          onError={(e) => {
            // the resized URL might not exist, so retry once with the original
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
