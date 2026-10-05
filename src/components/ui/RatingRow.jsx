import StarRating from "./StarRating";

/**
 * Rating block for detail sheets. Admins tap a star to rate (tap the same
 * star again to clear); everyone else sees it read-only, or nothing if unrated.
 */
export default function RatingRow({ value, canEdit, onRate, step = 0.5 }) {
  const rated = Number(value) > 0;
  if (!canEdit && !rated) return null;
  return (
    <div className="rating-row">
      <span className="rating-row-label">{canEdit ? "Your rating" : "Rating"}</span>
      <StarRating value={value} onChange={canEdit ? onRate : undefined} step={step} size={26} />
      {canEdit && (
        <span className="rating-row-hint">
          {rated ? "Tap a star to change it, or the same star to clear" : "Tap a star to rate"}
        </span>
      )}
    </div>
  );
}
