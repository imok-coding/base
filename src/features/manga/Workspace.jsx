import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useFeedback } from "../../components/ui/Feedback";
import { store } from "../../lib/store";
import { useAuth } from "../auth/AuthContext";
import { useManga } from "./MangaData";
import { deleteVolumes, moveVolumes, patchVolume, patchVolumes, setReadState } from "./api";
import { compareVolumes, LIST_LABEL, toFormValues, toPayload, parseTitle, nextVolumeTitle } from "./model";
import BulkEditSheet from "./components/BulkEditSheet";
import EntryEditor, { editorConfig } from "./components/EntryEditor";
import SelectBar from "./components/SelectBar";
import SuggestSheet from "./components/SuggestSheet";
import VolumeSheet from "./components/VolumeSheet";

const WorkspaceContext = createContext(null);
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

/**
 * Shared state + overlays for pages that show manga: the volume detail sheet
 * (driven by ?v=<id> so links and the back button work), the editor, bulk
 * edit, multi-select and the suggestion form.
 */
export function MangaWorkspace({ children }) {
  const { user, isAdmin } = useAuth();
  const { library, wishlist, byId, seriesInfo } = useManga();
  const { toast, confirm } = useFeedback();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [editor, setEditor] = useState(null);
  const [bulk, setBulk] = useState(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  // ids currently on screen, reported by the page, for "select all"
  const visibleIds = useRef([]);
  const setVisibleIds = useCallback((ids) => {
    visibleIds.current = ids;
  }, []);

  const all = useMemo(() => [...library, ...wishlist], [library, wishlist]);

  // ----- volume sheet via URL -----
  const volumeId = params.get("v");
  const volume = volumeId ? byId.get(volumeId) || null : null;
  const siblings = useMemo(
    () =>
      volume
        ? all
            .filter((v) => v.seriesKey === volume.seriesKey && (isAdmin || !v.hidden))
            .sort((a, b) => a.vol - b.vol || (a.kind > b.kind ? 1 : -1))
        : [],
    [volume, all, isAdmin]
  );

  const openVolume = useCallback(
    (id, replace = false) => {
      const next = new URLSearchParams(params);
      next.set("v", id);
      setParams(next, { replace: replace || !!params.get("v"), state: { sheet: true } });
    },
    [params, setParams]
  );

  const closeVolume = useCallback(() => {
    if (location.state?.sheet) navigate(-1);
    else {
      const next = new URLSearchParams(params);
      next.delete("v");
      setParams(next, { replace: true });
    }
  }, [location.state, navigate, params, setParams]);

  // ----- selection -----
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

  const selectedVolumes = useMemo(() => [...selected].map((id) => byId.get(id)).filter(Boolean), [selected, byId]);

  // ----- actions -----
  const run = useCallback(
    async (fn, success) => {
      try {
        await fn();
        if (success) toast(success);
        return true;
      } catch (err) {
        console.error(err);
        toast("Something went wrong — nothing was changed", { type: "error" });
        return false;
      }
    },
    [toast]
  );

  const actions = useMemo(() => {
    const add = (list = "library", prefill = {}) =>
      setEditor(editorConfig({ mode: "add", list, entries: [{ form: prefill }] }));
    return {
      edit(volumes) {
        setBulk(null);
        setEditor(
          editorConfig({
            mode: "edit",
            // series/volume order, regardless of which list each came from
            entries: [...volumes].sort(compareVolumes).map((v) => ({ id: v.id, list: v.kind, form: toFormValues(v) })),
          })
        );
      },
      add,
      addNext(seriesKey, list = "library") {
        const info = seriesInfo.get(seriesKey);
        if (!info) return add(list);
        return add(list, {
          title: nextVolumeTitle(info.display, (info.maxVol || 0) + 1),
          authors: info.authors,
          publisher: info.publisher,
          demographic: info.demographic,
          genre: info.genre,
          subGenre: info.subGenre,
          msrp: info.msrp === "" ? "" : String(info.msrp),
        });
      },
      bulk(volumes) {
        setBulk(volumes);
      },
      async setRead(volumes, read) {
        const ok = await run(() => setReadState(volumes, read, { user }));
        if (ok)
          toast(
            volumes.length === 1
              ? read
                ? "Marked as read"
                : "Marked as unread"
              : `Marked ${plural(volumes.length, "volume")} ${read ? "read" : "unread"}`
          );
        if (ok && selectMode) exitSelect();
      },
      async rate(v, rating) {
        await run(() => patchVolume(v, { rating }, { user, message: `Rated "${v.title}" ${rating || "(cleared)"}` }));
      },
      async setHidden(volumes, hidden) {
        const ok = await run(() => patchVolumes(volumes, { hidden }, { user, allVolumes: all }));
        if (ok) toast(hidden ? "Hidden from visitors" : "Visible to visitors");
      },
      async move(volumes, to) {
        const res = await confirm({
          title: `Move ${volumes.length === 1 ? `"${parseTitle(volumes[0].title).series}${volumes[0].vol ? ` Vol. ${volumes[0].vol}` : ""}"` : plural(volumes.length, "volume")} to ${LIST_LABEL[to]}?`,
          message:
            to === "library"
              ? "It'll show up in your library as unread."
              : "Reading status and rating will be cleared.",
          confirmLabel: `Move to ${LIST_LABEL[to]}`,
          option: to === "library" ? { label: "Set purchase date to today (if blank)", default: true } : undefined,
        });
        if (!res) return;
        const ok = await run(() => moveVolumes(volumes, to, { seriesInfo, user, purchasedToday: res.option }));
        if (ok) {
          toast(`Moved to ${LIST_LABEL[to]}`);
          if (volumes.some((v) => v.id === volumeId)) closeVolume();
          exitSelect();
        }
      },
      async remove(volumes) {
        const res = await confirm({
          title: volumes.length === 1 ? `Delete "${volumes[0].title}"?` : `Delete ${plural(volumes.length, "volume")}?`,
          message: "This removes them from Firestore. You can undo right after.",
          confirmLabel: "Delete",
          danger: true,
        });
        if (!res) return;
        const backup = volumes.map((v) => ({ col: v.kind, data: toPayload(toFormValues(v), v.kind) }));
        const ok = await run(() => deleteVolumes(volumes, { user }));
        if (!ok) return;
        if (volumes.some((v) => v.id === volumeId)) closeVolume();
        exitSelect();
        toast(`Deleted ${plural(volumes.length, "volume")}`, {
          type: "info",
          duration: 7000,
          action: {
            label: "Undo",
            onClick: () =>
              run(() => store.batch(backup.map((b) => ({ type: "add", col: b.col, data: b.data }))), "Restored"),
          },
        });
      },
      suggest() {
        setSuggestOpen(true);
      },
    };
  }, [all, user, run, toast, confirm, seriesInfo, volumeId, closeVolume, exitSelect, selectMode]);

  const value = useMemo(
    () => ({
      isAdmin,
      selectMode,
      setSelectMode: (on) => (on ? setSelectMode(true) : exitSelect()),
      selected,
      toggle,
      openVolume,
      setVisibleIds,
      actions,
    }),
    [isAdmin, selectMode, exitSelect, selected, toggle, openVolume, setVisibleIds, actions]
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
      <VolumeSheet
        volume={volume}
        siblings={siblings}
        isAdmin={isAdmin}
        onClose={closeVolume}
        onOpen={openVolume}
        actions={actions}
      />
      {isAdmin && (
        <>
          <EntryEditor config={editor} onClose={() => setEditor(null)} />
          <BulkEditSheet
            volumes={bulk}
            onClose={(saved) => {
              setBulk(null);
              if (saved) exitSelect();
            }}
            onEditEach={(vols) => actions.edit(vols)}
          />
          {selectMode && (
            <SelectBar
              volumes={selectedVolumes}
              actions={actions}
              onSelectAll={() => setSelected(new Set(visibleIds.current))}
              onClear={() => setSelected(new Set())}
              onExit={exitSelect}
            />
          )}
        </>
      )}
      {user && !isAdmin && <SuggestSheet open={suggestOpen} onClose={() => setSuggestOpen(false)} />}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside <MangaWorkspace>");
  return ctx;
}
