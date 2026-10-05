import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { CheckSquare, Eye, EyeOff, MoreHorizontal, Pencil, Trash2, X } from "lucide-react";
import Menu from "../../components/ui/Menu";
import { useFeedback } from "../../components/ui/Feedback";
import { coverKey, findCoversFor } from "../../lib/gameCovers";
import { store } from "../../lib/store";
import { todayISO } from "../../lib/format";
import { useAuth } from "../auth/AuthContext";
import { useGames } from "./GamesData";
import { deleteGames, patchGames, rateGame, setGameCovers, setGamesHidden } from "./api";
import { needsCover, toGameForm, toGamePayload } from "./model";
import GameSheet from "./components/GameSheet";
import GameEditor, { gameEditorConfig } from "./components/GameEditor";
import GameBulkSheet from "./components/GameBulkSheet";
import ImportSheet from "./components/ImportSheet";
import "./games.css";

const Ctx = createContext(null);
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** Detail sheet (?g=<id>), editor, bulk edit, import and selection for game pages. */
export function GamesWorkspace({ children }) {
  const { user, isAdmin } = useAuth();
  const { games, byId } = useGames();
  const { toast, confirm } = useFeedback();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [editor, setEditor] = useState(null);
  const [bulk, setBulk] = useState(null);
  const [importing, setImporting] = useState(false);
  const [coverJob, setCoverJob] = useState(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const visible = useRef([]);

  const gameId = params.get("g");
  const game = gameId ? byId.get(gameId) || null : null;

  const openGame = useCallback(
    (id, replace = false) => {
      const next = new URLSearchParams(params);
      next.set("g", id);
      setParams(next, { replace: replace || !!params.get("g"), state: { sheet: true } });
    },
    [params, setParams]
  );
  const closeGame = useCallback(() => {
    if (location.state?.sheet) navigate(-1);
    else {
      const next = new URLSearchParams(params);
      next.delete("g");
      setParams(next, { replace: true });
    }
  }, [location.state, navigate, params, setParams]);

  const toggle = useCallback((ids) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = ids.every((id) => next.has(id));
      ids.forEach((id) => (allOn ? next.delete(id) : next.add(id)));
      return next;
    });
  }, []);
  const exitSelect = useCallback(() => {
    setSelectMode(false);
    setSelected(new Set());
  }, []);

  const actions = useMemo(
    () => ({
      add: (form = {}) => setEditor(gameEditorConfig(null, form)),
      edit: ([g]) => setEditor(gameEditorConfig(g, toGameForm(g))),
      bulk: (list) => setBulk(list),
      import: () => setImporting(true),
      async rate(g, rating) {
        try {
          await rateGame(g, rating, { user });
          toast(rating ? `Rated ${rating} ★` : "Rating cleared");
        } catch {
          toast("Couldn't save the rating", { type: "error" });
        }
      },
      async setHidden(list, hidden) {
        try {
          await setGamesHidden(list, hidden, { user });
          toast(
            hidden
              ? `Hid ${list.length === 1 ? list[0].title : plural(list.length, "game")} from visitors`
              : `${list.length === 1 ? list[0].title : plural(list.length, "game")} visible again`
          );
        } catch {
          toast("Couldn't update that, try again", { type: "error" });
        }
      },
      async markCompleted(g) {
        try {
          await patchGames([g], { backlog: "Completed", completedDate: g.completedDate || todayISO() }, { user });
          toast(`${g.title} marked completed`);
        } catch {
          toast("Couldn't update that game", { type: "error" });
        }
      },
      async remove(list) {
        const ok = await confirm({
          title: list.length === 1 ? `Delete "${list[0].title}"?` : `Delete ${plural(list.length, "game")}?`,
          message: "This removes them from Firestore. You can undo right after.",
          confirmLabel: "Delete",
          danger: true,
        });
        if (!ok) return;
        const backup = list.map((g) => ({ ...toGamePayload(toGameForm(g)), importKey: g.importKey || "" }));
        try {
          await deleteGames(list, { user });
        } catch {
          toast("Couldn't delete, nothing was changed", { type: "error" });
          return;
        }
        if (list.some((g) => g.id === gameId)) closeGame();
        exitSelect();
        toast(`Deleted ${plural(list.length, "game")}`, {
          type: "info",
          duration: 7000,
          action: {
            label: "Undo",
            onClick: () => store.batch(backup.map((data) => ({ type: "add", col: "games", data }))),
          },
        });
      },
      async findMissingCovers() {
        const missing = games.filter(needsCover);
        if (!missing.length) return toast("Every game already has cover art", { type: "info" });
        setCoverJob({ done: 0, total: new Set(missing.map(coverKey)).size });
        try {
          const found = await findCoversFor(missing, (done, total) => setCoverJob({ done, total }));
          const pairs = missing
            .filter((g) => found.get(coverKey(g)))
            .map((g) => ({ id: g.id, cover: found.get(coverKey(g)) }));
          await setGameCovers(pairs, { user });
          toast(
            `Found covers for ${plural(pairs.length, "game")}${pairs.length < missing.length ? ` · ${missing.length - pairs.length} still need one` : ""}`
          );
        } catch {
          toast("Cover search stopped early, try again", { type: "error" });
        } finally {
          setCoverJob(null);
        }
      },
    }),
    [games, user, toast, confirm, gameId, closeGame, exitSelect]
  );

  const siblings = useMemo(() => {
    const ids = visible.current;
    const list = ids.length ? ids.map((id) => byId.get(id)).filter(Boolean) : [];
    return game && list.some((g) => g.id === game.id) ? list : game ? [game] : [];
  }, [game, byId]);

  const selectedGames = [...selected].map((id) => byId.get(id)).filter(Boolean);
  const hideLabel = !selectedGames.length || selectedGames.some((g) => !g.hidden) ? "Hide" : "Show";

  const value = useMemo(
    () => ({
      isAdmin,
      openGame,
      actions,
      selectMode,
      setSelectMode: (on) => (on ? setSelectMode(true) : exitSelect()),
      selected,
      toggle,
      setVisibleIds: (ids) => {
        visible.current = ids;
      },
      coverJob,
    }),
    [isAdmin, openGame, actions, selectMode, exitSelect, selected, toggle, coverJob]
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <GameSheet
        game={game}
        siblings={siblings}
        isAdmin={isAdmin}
        onClose={closeGame}
        onOpen={openGame}
        actions={actions}
      />
      {isAdmin && (
        <>
          <GameEditor config={editor} onClose={() => setEditor(null)} />
          <GameBulkSheet
            games={bulk}
            onClose={(saved) => {
              setBulk(null);
              if (saved) exitSelect();
            }}
          />
          <ImportSheet open={importing} onClose={() => setImporting(false)} />
          {selectMode && (
            <div className="select-bar" role="toolbar" aria-label="Selection actions">
              <span className="select-bar-count tabular">{selectedGames.length} selected</span>
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                onClick={() => setSelected(new Set(visible.current))}
                aria-label="Select all"
                title="Select all"
              >
                <CheckSquare /> <span className="btn-label">All</span>
              </button>
              <button
                type="button"
                className="btn btn--sm"
                disabled={!selectedGames.length}
                onClick={() => setBulk(selectedGames)}
                aria-label="Edit"
                title="Edit"
              >
                <Pencil /> <span className="btn-label">Edit</span>
              </button>
              <button
                type="button"
                className="btn btn--sm"
                disabled={!selectedGames.length}
                onClick={() => actions.setHidden(selectedGames, hideLabel === "Hide")}
                aria-label={hideLabel === "Hide" ? "Hide from visitors" : "Show to visitors"}
                title={hideLabel === "Hide" ? "Hide from visitors" : "Show to visitors"}
              >
                {hideLabel === "Hide" ? <EyeOff /> : <Eye />} <span className="btn-label">{hideLabel}</span>
              </button>
              <Menu
                up
                trigger={(p) => (
                  <button
                    type="button"
                    className="btn btn--sm btn--icon"
                    aria-label="More"
                    disabled={!selectedGames.length}
                    {...p}
                  >
                    <MoreHorizontal />
                  </button>
                )}
                items={[
                  { label: "Clear selection", icon: X, onClick: () => setSelected(new Set()) },
                  { separator: true },
                  {
                    label: `Delete ${selectedGames.length}`,
                    icon: Trash2,
                    danger: true,
                    onClick: () => actions.remove(selectedGames),
                  },
                ]}
              />
              <button
                type="button"
                className="btn btn--sm btn--ghost btn--icon"
                onClick={exitSelect}
                aria-label="Exit selection"
              >
                <X />
              </button>
            </div>
          )}
        </>
      )}
    </Ctx.Provider>
  );
}

export function useGamesWorkspace() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useGamesWorkspace must be used inside <GamesWorkspace>");
  return ctx;
}
