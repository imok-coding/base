import {
  ArrowLeftRight,
  BookCheck,
  BookOpen,
  CheckSquare,
  Eye,
  EyeOff,
  MoreHorizontal,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import Menu from "../../../components/ui/Menu";

export default function SelectBar({ volumes, onSelectAll, onClear, onExit, actions }) {
  const count = volumes.length;
  const kinds = new Set(volumes.map((v) => v.kind));
  const allLibrary = kinds.size === 1 && kinds.has("library");
  const allWishlist = kinds.size === 1 && kinds.has("wishlist");
  const anyVisible = volumes.some((v) => !v.hidden);
  const disabled = count === 0;

  return (
    <div className="select-bar" role="toolbar" aria-label="Selection actions">
      <span className="select-bar-count tabular">{count} selected</span>
      <button type="button" className="btn btn--sm btn--ghost" onClick={onSelectAll}>
        <CheckSquare /> All
      </button>
      {allLibrary && (
        <button
          type="button"
          className="btn btn--sm"
          disabled={disabled}
          onClick={() => actions.setRead(volumes, true)}
        >
          <BookCheck /> Read
        </button>
      )}
      <button type="button" className="btn btn--sm" disabled={disabled} onClick={() => actions.bulk(volumes)}>
        <Pencil /> Edit
      </button>
      {allWishlist && (
        <button
          type="button"
          className="btn btn--sm"
          disabled={disabled}
          onClick={() => actions.move(volumes, "library")}
        >
          <ArrowLeftRight /> To Library
        </button>
      )}
      <Menu
        up
        trigger={(p) => (
          <button type="button" className="btn btn--sm btn--icon" aria-label="More" disabled={disabled} {...p}>
            <MoreHorizontal />
          </button>
        )}
        items={[
          { label: "Mark unread", icon: BookOpen, onClick: () => actions.setRead(volumes, false), hidden: !allLibrary },
          {
            label: "Move to Wishlist",
            icon: ArrowLeftRight,
            onClick: () => actions.move(volumes, "wishlist"),
            hidden: !allLibrary,
          },
          {
            label: anyVisible ? "Hide from visitors" : "Show to visitors",
            icon: anyVisible ? EyeOff : Eye,
            onClick: () => actions.setHidden(volumes, anyVisible),
          },
          { label: "Clear selection", icon: X, onClick: onClear },
          { separator: true },
          { label: `Delete ${count}`, icon: Trash2, danger: true, onClick: () => actions.remove(volumes) },
        ]}
      />
      <button type="button" className="btn btn--sm btn--ghost btn--icon" onClick={onExit} aria-label="Exit selection">
        <X />
      </button>
    </div>
  );
}
