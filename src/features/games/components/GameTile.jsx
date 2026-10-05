import { memo } from "react";
import { Check, CloudDownload, Disc3, Gamepad2, Layers, Play } from "lucide-react";
import Cover from "../../../components/ui/Cover";
import TileStars from "../../../components/ui/TileStars";
import { platformShort } from "../model";

export const FORMAT_ICON = { Physical: Disc3, Digital: CloudDownload, Both: Layers };

export function GameCover({ game, size = 420, eager, className = "", children }) {
  return (
    <Cover
      src={game.cover}
      alt={game.title}
      size={size}
      eager={eager}
      className={`cover--game ${className}`}
      fallback={
        <div className="game-fallback" data-family={game.family} aria-hidden="true">
          <Gamepad2 />
          <span className="clamp-3">{game.title}</span>
        </div>
      }
    >
      {children}
    </Cover>
  );
}

export const GameTile = memo(function GameTile({ game, isAdmin, selectMode, selected, onOpen, onToggle }) {
  const FormatIcon = FORMAT_ICON[game.format] || Disc3;
  return (
    <article className={`tile ${selectMode ? "is-select-mode" : ""} ${selected ? "is-selected" : ""}`}>
      <button
        type="button"
        className="tile-hit"
        aria-label={`${game.title} (${platformShort(game.platform)}, ${game.format})`}
        aria-pressed={selectMode ? selected : undefined}
        onClick={() => (selectMode ? onToggle([game.id]) : onOpen(game.id))}
      />
      <GameCover game={game}>
        <div className="tile-badges">
          <div>
            <span className="plat" data-family={game.family}>
              {platformShort(game.platform)}
            </span>
          </div>
          <div>
            {game.reviewUrl && (
              <span className="badge badge--accent" title="Has a review video">
                <Play />
              </span>
            )}
            {game.backlog === "Completed" && (
              <span className="badge badge--read" title="Completed">
                <Check />
              </span>
            )}
            <span className="badge badge--muted" title={game.format}>
              <FormatIcon />
            </span>
          </div>
        </div>
        {selectMode && (
          <span className="tile-select" aria-hidden="true">
            <Check />
          </span>
        )}
      </GameCover>
      <div className="tile-body">
        <span className="tile-title clamp-2">{game.title}</span>
        <span className="tile-meta clamp-1">
          {game.edition || (isAdmin && !game.cover ? "No cover yet" : game.format)}
        </span>
        <TileStars value={game.rating} />
      </div>
    </article>
  );
});
