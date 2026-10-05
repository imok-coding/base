import { Star } from "lucide-react";

// Small star + rating for tiles. Shows nothing when unrated.
export default function TileStars({ value, label = "Rated" }) {
  const n = Number(value);
  if (!(n > 0)) return null;
  const text = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return (
    <span className="tile-stars tile-meta" aria-label={`${label} ${text} out of 5`}>
      <Star aria-hidden="true" /> {text}
    </span>
  );
}
