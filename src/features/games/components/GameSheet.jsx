import { ChevronLeft, ChevronRight, MoreHorizontal, Pencil, Trash2, Trophy } from "lucide-react";
import Sheet from "../../../components/ui/Sheet";
import Menu from "../../../components/ui/Menu";
import RatingRow from "../../../components/ui/RatingRow";
import ReviewVideo from "../../../components/ui/ReviewVideo";
import { formatDate, money } from "../../../lib/format";
import { useSticky } from "../../manga/hooks";
import { completionPct, hoursRemaining, platformShort } from "../model";
import { FORMAT_ICON, GameCover } from "./GameTile";

function Detail({ label, value, wide }) {
  if (value === "" || value === null || value === undefined) return null;
  return (
    <div className={wide ? "details--wide" : undefined}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

const hours = (h) => (h === "" ? "" : `${Number(h).toLocaleString()} h`);

export default function GameSheet({ game, siblings = [], isAdmin, onClose, onOpen, actions }) {
  const g = useSticky(game);
  if (!g) return null;
  const idx = siblings.findIndex((s) => s.id === g.id);
  const prev = idx > 0 ? siblings[idx - 1] : null;
  const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;
  const FormatIcon = FORMAT_ICON[g.format];
  const pct = completionPct(g);
  const left = hoursRemaining(g);

  const nav = siblings.length > 1 && (
    <div className="volume-nav">
      <button
        type="button"
        className="btn btn--ghost btn--icon"
        disabled={!prev}
        onClick={() => onOpen(prev.id, true)}
        aria-label="Previous game"
      >
        <ChevronLeft />
      </button>
      <button
        type="button"
        className="btn btn--ghost btn--icon"
        disabled={!next}
        onClick={() => onOpen(next.id, true)}
        aria-label="Next game"
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
        items={[{ label: "Delete", icon: Trash2, danger: true, onClick: () => actions.remove([g]) }]}
      />
      <span className="spacer" />
      {g.backlog !== "Completed" && (
        <button type="button" className="btn" onClick={() => actions.markCompleted(g)}>
          <Trophy /> Completed
        </button>
      )}
      <button type="button" className="btn btn--primary" onClick={() => actions.edit([g])}>
        <Pencil /> Edit
      </button>
    </>
  ) : null;

  return (
    <Sheet
      open={!!game}
      onClose={onClose}
      title={g.status === "Owned" ? "Game library" : g.status}
      headerExtra={nav}
      width={720}
      footer={footer}
    >
      <div className="volume-layout">
        <GameCover game={g} size={700} eager key={g.id} />
        <div className="volume-main">
          <div className="volume-head">
            <h3>{g.title}</h3>
            {g.edition && (
              <p className="muted" style={{ marginTop: 4, fontWeight: 600 }}>
                {g.edition}
              </p>
            )}
            <div className="volume-chips">
              <span className="chip" data-family={g.family}>
                <span className="plat-dot" /> {platformShort(g.platform)}
              </span>
              <span className="chip">
                {FormatIcon && <FormatIcon />} {g.format}
              </span>
              <span
                className={`chip ${g.backlog === "Completed" ? "chip--read" : g.backlog === "In Progress" ? "chip--accent" : ""}`}
              >
                {g.backlog}
              </span>
              {g.priority && g.priority !== "Low" && <span className="chip chip--warn">{g.priority}</span>}
            </div>
            <RatingRow value={g.rating} canEdit={isAdmin} onRate={(r) => actions.rate(g, r)} step={1} />
            {pct !== "" && (
              <div className="game-progress">
                <div className="series-progress-label">
                  <span>Completion</span>
                  <span className="tabular">{pct}%</span>
                </div>
                <div className="progress">
                  <span style={{ width: `${pct}%` }} />
                </div>
              </div>
            )}
          </div>
          <dl className="details">
            <Detail label="Platform" value={g.platform} />
            <Detail label="Genre" value={g.genre} />
            <Detail label="Released" value={g.releaseYear} />
            <Detail label="Acquired" value={formatDate(g.acquired)} />
            {isAdmin && <Detail label="Paid" value={g.price !== "" ? money(g.price) : ""} />}
            <Detail label="Store" value={g.store} />
            <Detail label="Region" value={g.region} />
            <Detail label="Condition" value={g.condition} />
            <Detail label="Play mode" value={g.playMode} />
            <Detail label="Hours played" value={hours(g.hoursPlayed)} />
            <Detail label="Estimated length" value={hours(g.hoursEstimated)} />
            <Detail label="Hours left" value={hours(left)} />
            <Detail label="Last played" value={formatDate(g.lastPlayed)} />
            <Detail label="Completed" value={formatDate(g.completedDate)} />
            <Detail label="Worth revisiting" value={g.revisit === true ? "Yes" : g.revisit === false ? "No" : ""} />
          </dl>
          {g.notes && <p className="notes">{g.notes}</p>}
        </div>
      </div>
      <ReviewVideo url={g.reviewUrl} key={g.id} />
      {isAdmin && !g.reviewUrl && (
        <button type="button" className="card-link" style={{ marginTop: 14 }} onClick={() => actions.edit([g])}>
          + Add a review video
        </button>
      )}
    </Sheet>
  );
}
