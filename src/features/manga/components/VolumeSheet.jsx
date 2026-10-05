import { Link } from "react-router-dom";
import {
  ArrowLeftRight,
  BookCheck,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  EyeOff,
  Gem,
  MoreHorizontal,
  Pencil,
  Sparkles,
  Trash2,
} from "lucide-react";
import Sheet from "../../../components/ui/Sheet";
import Cover from "../../../components/ui/Cover";
import Menu from "../../../components/ui/Menu";
import RatingRow from "../../../components/ui/RatingRow";
import { formatDate, money } from "../../../lib/format";
import { FIELD_LABELS, isCollectible, isSpecialEdition, LIST_LABEL, missingFields, seriesSlug } from "../model";
import { useSticky } from "../hooks";

function Detail({ label, value, missing, wide }) {
  if (!value && !missing) return null;
  return (
    <div className={wide ? "details--wide" : undefined}>
      <dt>{label}</dt>
      <dd className={!value ? "is-missing" : undefined}>{value || "Missing"}</dd>
    </div>
  );
}

export default function VolumeSheet({ volume, siblings = [], isAdmin, onClose, onOpen, actions }) {
  const v = useSticky(volume);
  if (!v) return null;
  const missing = new Set(isAdmin ? missingFields(v) : []);
  const idx = siblings.findIndex((s) => s.id === v.id);
  const prev = idx > 0 ? siblings[idx - 1] : null;
  const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;
  const isLib = v.kind === "library";
  const other = isLib ? "wishlist" : "library";

  const nav = siblings.length > 1 && (
    <div className="volume-nav">
      <button
        type="button"
        className="btn btn--ghost btn--icon"
        disabled={!prev}
        onClick={() => onOpen(prev.id, true)}
        aria-label="Previous volume"
      >
        <ChevronLeft />
      </button>
      <button
        type="button"
        className="btn btn--ghost btn--icon"
        disabled={!next}
        onClick={() => onOpen(next.id, true)}
        aria-label="Next volume"
      >
        <ChevronRight />
      </button>
    </div>
  );

  const footer = isAdmin ? (
    <>
      <Menu
        up
        align="left"
        trigger={(p) => (
          <button type="button" className="btn btn--ghost btn--icon" aria-label="More actions" {...p}>
            <MoreHorizontal />
          </button>
        )}
        items={[
          { label: `Move to ${LIST_LABEL[other]}`, icon: ArrowLeftRight, onClick: () => actions.move([v], other) },
          { label: "Delete", icon: Trash2, danger: true, onClick: () => actions.remove([v]) },
        ]}
      />
      <span className="spacer" />
      <button type="button" className="btn" onClick={() => actions.edit([v])}>
        <Pencil /> Edit
      </button>
      {isLib ? (
        <button
          type="button"
          className={`btn ${v.read ? "" : "btn--primary"}`}
          onClick={() => actions.setRead([v], !v.read)}
        >
          {v.read ? <BookOpen /> : <BookCheck />}
          {v.read ? "Mark unread" : "Mark read"}
        </button>
      ) : (
        <button type="button" className="btn btn--primary" onClick={() => actions.move([v], "library")}>
          <ArrowLeftRight /> Got it, move to Library
        </button>
      )}
    </>
  ) : v.amazonURL ? (
    <a className="btn btn--soft" href={v.amazonURL} target="_blank" rel="noreferrer">
      <ExternalLink /> View in store
    </a>
  ) : null;

  return (
    <Sheet open={!!volume} onClose={onClose} title={LIST_LABEL[v.kind]} headerExtra={nav} width={720} footer={footer}>
      <div className="volume-layout">
        <Cover src={v.cover} alt={v.title} size={900} eager key={v.id} />
        <div className="volume-main">
          <div className="volume-head">
            <h3>{v.title || "Untitled"}</h3>
            <Link className="volume-series-link" to={`/manga/series/${seriesSlug(v.seriesKey)}`} onClick={onClose}>
              {v.series} <ChevronRight />
            </Link>
            <div className="volume-chips">
              {isLib &&
                (v.read ? (
                  <span className="chip chip--read">
                    <BookCheck /> Read{v.dateRead ? ` · ${formatDate(v.dateRead)}` : ""}
                  </span>
                ) : (
                  <span className="chip">Unread</span>
                ))}
              {isSpecialEdition(v) && (
                <span className="chip chip--accent">
                  <Sparkles /> Special edition
                </span>
              )}
              {isCollectible(v) && (
                <span className="chip chip--accent">
                  <Gem /> Collectible
                </span>
              )}
              {isAdmin && v.hidden && (
                <span className="chip">
                  <EyeOff /> Hidden
                </span>
              )}
              {missing.size > 0 && <span className="chip chip--warn">{missing.size} missing</span>}
            </div>
            {isLib && <RatingRow value={v.rating} canEdit={isAdmin} onRate={(r) => actions.rate(v, r)} />}
          </div>
          <dl className="details">
            <Detail label="Author" value={v.authors} missing={missing.has("authors")} wide />
            <Detail label="Publisher" value={v.publisher} missing={missing.has("publisher")} />
            <Detail label="Release date" value={formatDate(v.date)} missing={missing.has("date")} />
            <Detail label="Demographic" value={v.demographic} missing={missing.has("demographic")} />
            <Detail
              label="Genre"
              value={[v.genre, v.subGenre].filter(Boolean).join(" · ")}
              missing={missing.has("genre")}
            />
            <Detail label="Pages" value={v.pageCount ? String(v.pageCount) : ""} missing={missing.has("pageCount")} />
            <Detail label="ISBN" value={v.isbn} missing={missing.has("isbn")} />
            <Detail
              label={isLib ? "Purchased" : "Pre-ordered"}
              value={formatDate(v.datePurchased)}
              missing={missing.has("datePurchased")}
            />
            {!isCollectible(v) && (
              <Detail
                label="Paid"
                value={v.amountPaid !== "" ? money(v.amountPaid) : ""}
                missing={missing.has("amountPaid")}
              />
            )}
            <Detail label="MSRP" value={v.msrp !== "" ? money(v.msrp) : ""} missing={missing.has("msrp")} />
            <Detail
              label="Collectible value"
              value={v.collectiblePrice !== "" ? money(v.collectiblePrice) : ""}
              missing={missing.has("collectiblePrice")}
            />
            <Detail
              label="Volumes contained"
              value={v.specialVolumes !== "" ? String(v.specialVolumes) : ""}
              missing={missing.has("specialVolumes")}
            />
            {isAdmin && v.amazonURL && (
              <Detail
                label="Store link"
                wide
                value={
                  <a
                    href={v.amazonURL}
                    target="_blank"
                    rel="noreferrer"
                    className="volume-series-link"
                    style={{ marginTop: 0 }}
                  >
                    Open <ExternalLink />
                  </a>
                }
              />
            )}
          </dl>
        </div>
      </div>
      {isAdmin && missing.size > 0 && (
        <p className="subtle" style={{ fontSize: "var(--text-xs)", marginTop: 18 }}>
          Missing: {[...missing].map((f) => FIELD_LABELS[f]).join(", ")}
        </p>
      )}
    </Sheet>
  );
}
