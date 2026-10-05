import { memo } from "react";
import { Check, EyeOff, Gem, Sparkles } from "lucide-react";
import Cover from "../../../components/ui/Cover";
import TileStars from "../../../components/ui/TileStars";
import { formatDate } from "../../../lib/format";
import { formatVolumeRange, isCollectible, isSpecialEdition, missingFields } from "../model";

function SpecialBadge({ v }) {
  if (isCollectible(v)) {
    return (
      <span className="badge badge--accent" title="Collectible">
        <Gem /> Collectible
      </span>
    );
  }
  if (isSpecialEdition(v)) {
    return (
      <span className="badge badge--accent" title="Special edition">
        <Sparkles /> Special
      </span>
    );
  }
  return null;
}

export const VolumeTile = memo(function VolumeTile({
  v,
  isAdmin,
  selectMode,
  selected,
  onOpen,
  onToggle,
  showSeries = true,
}) {
  const missing = isAdmin ? missingFields(v).length : 0;
  const label = v.vol ? `Vol. ${v.volumes.length > 1 ? `${v.volumes[0]}–${v.volumes.at(-1)}` : v.vol}` : null;
  return (
    <article
      className={`tile ${selectMode ? "is-select-mode" : ""} ${selected ? "is-selected" : ""} ${v.hidden ? "is-hidden" : ""}`}
    >
      <button
        type="button"
        className="tile-hit"
        aria-label={v.title}
        aria-pressed={selectMode ? selected : undefined}
        onClick={() => (selectMode ? onToggle([v.id]) : onOpen(v.id))}
      />
      <Cover src={v.cover} alt={v.title} size={420}>
        <div className="tile-badges">
          <div>
            {v.read && (
              <span className="badge badge--read">
                <Check /> Read
              </span>
            )}
            <SpecialBadge v={v} />
          </div>
          <div>
            {isAdmin && v.hidden && (
              <span className="badge badge--muted" title="Hidden from the public">
                <EyeOff />
              </span>
            )}
            {missing > 0 && (
              <span className="badge badge--warn" title={`${missing} field${missing === 1 ? "" : "s"} missing`}>
                {missing}
              </span>
            )}
          </div>
        </div>
        {selectMode && (
          <span className="tile-select" aria-hidden="true">
            <Check />
          </span>
        )}
      </Cover>
      <div className="tile-body">
        {label ? <span className="tile-vol">{label}</span> : <span className="tile-title clamp-2">{v.title}</span>}
        {label && showSeries && <span className="tile-meta clamp-2">{v.series}</span>}
        {v.kind === "wishlist" && v.date && <span className="tile-meta">{formatDate(v.date)}</span>}
        <TileStars value={v.rating} />
      </div>
    </article>
  );
});

export const SeriesTile = memo(function SeriesTile({ s, list, isAdmin, selectMode, selected, onOpen, onToggle }) {
  const pct = s.count ? Math.round((s.readCount / s.count) * 100) : 0;
  const complete = s.count > 0 && s.readCount === s.count;
  const range = formatVolumeRange(s.volNumbers);
  const missing = isAdmin ? s.missingCount : 0;
  const ids = s.items.map((v) => v.id);
  return (
    <article
      className={`tile ${selectMode ? "is-select-mode" : ""} ${selected ? "is-selected" : ""} ${s.hidden ? "is-hidden" : ""}`}
    >
      <button
        type="button"
        className="tile-hit"
        aria-label={`${s.title}, ${s.count} volume${s.count === 1 ? "" : "s"}`}
        aria-pressed={selectMode ? selected : undefined}
        onClick={() => (selectMode ? onToggle(ids) : onOpen(s.key))}
      />
      <Cover src={s.cover} alt={s.title} size={480}>
        <div className="tile-badges">
          <div>
            {list === "library" && complete && (
              <span className="badge badge--read">
                <Check /> Read
              </span>
            )}
            {list === "library" && !complete && s.readCount > 0 && (
              <span className="badge badge--muted tabular">
                {s.readCount}/{s.count}
              </span>
            )}
          </div>
          <div>
            {isAdmin && s.hidden && (
              <span className="badge badge--muted" title="Hidden from the public">
                <EyeOff />
              </span>
            )}
            {missing > 0 && (
              <span className="badge badge--warn" title={`${missing} volume${missing === 1 ? "" : "s"} need info`}>
                {missing}
              </span>
            )}
          </div>
        </div>
        {list === "library" && !selectMode && pct > 0 && pct < 100 && (
          <div className="tile-progress" aria-hidden="true">
            <span style={{ width: `${pct}%` }} />
          </div>
        )}
        {selectMode && (
          <span className="tile-select" aria-hidden="true">
            <Check />
          </span>
        )}
      </Cover>
      <div className="tile-body">
        <span className="tile-title clamp-2">{s.title}</span>
        <span className="tile-meta clamp-1">
          {s.count} vol{s.count === 1 ? "" : "s"}
          {range && s.count > 1 ? ` · ${range.replace(/^Vols?\. /, "")}` : ""}
          {list === "wishlist" && s.nextRelease
            ? ` · ${formatDate(s.nextRelease, { month: "short", day: "numeric" })}`
            : ""}
        </span>
        <TileStars value={s.avgRating} label="Average rating" />
      </div>
    </article>
  );
});

export function TileSkeletons({ count = 12, volumes = false }) {
  return (
    <div className={`tile-grid ${volumes ? "tile-grid--volumes" : ""}`} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div className="tile" key={i}>
          <div className="cover skeleton" />
          <div className="skeleton" style={{ height: 12, width: "80%" }} />
          <div className="skeleton" style={{ height: 10, width: "50%" }} />
        </div>
      ))}
    </div>
  );
}
