import { useMemo, useRef, useState } from "react";
import { Bookmark, ChevronLeft, ChevronRight, Plus, ScanSearch, X } from "lucide-react";
import Sheet from "../../../components/ui/Sheet";
import Cover from "../../../components/ui/Cover";
import StarRating from "../../../components/ui/StarRating";
import { SelectField, Switch, TextField } from "../../../components/ui/Fields";
import { useFeedback } from "../../../components/ui/Feedback";
import { todayISO } from "../../../lib/format";
import { lookupIsbn } from "../../../lib/isbn";
import { useAuth } from "../../auth/AuthContext";
import { useManga } from "../MangaData";
import { saveEntries } from "../api";
import { DEMOGRAPHICS, EMPTY_ENTRY, LIST_LABEL, missingFields, nextVolumeTitle, parseTitle } from "../model";
import { useSticky } from "../hooks";

let uidCounter = 0;
const uid = () => `e${++uidCounter}`;

/** Short tab label: "Vol. 3", "Vol. 23–24" for 2-in-1s, or the title. */
function entryLabel(title) {
  const p = parseTitle(title);
  if (!p.vol) return title.slice(0, 18) || "Untitled";
  return p.volumes.length > 1 ? `Vol. ${p.volumes[0]}–${p.volumes.at(-1)}` : `Vol. ${p.vol}`;
}

/** Build an editor config. */
export function editorConfig({ mode, list = "library", entries }) {
  return {
    key: uid(),
    mode,
    list,
    entries: (entries?.length ? entries : [{ form: { ...EMPTY_ENTRY } }]).map((e) => ({
      uid: uid(),
      id: e.id || null,
      list: e.list || list,
      form: { ...EMPTY_ENTRY, ...e.form },
    })),
  };
}

function useOptions(volumes, field) {
  return useMemo(() => {
    const set = new Set();
    for (const v of volumes) if (v[field]) set.add(v[field]);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [volumes, field]);
}

function EditorInner({ cfg, open, onClose }) {
  const { user } = useAuth();
  const { library, wishlist, seriesInfo } = useManga();
  const { toast } = useFeedback();
  const [entries, setEntries] = useState(cfg.entries);
  const [index, setIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [titleFocus, setTitleFocus] = useState(false);
  const bodyRef = useRef(null);

  const all = useMemo(() => [...library, ...wishlist], [library, wishlist]);
  const publishers = useOptions(all, "publisher");
  const genres = useOptions(all, "genre");
  const subGenres = useOptions(all, "subGenre");
  const authorsList = useOptions(all, "authors");

  const entry = entries[Math.min(index, entries.length - 1)];
  const form = entry.form;
  const isLib = entry.list === "library";
  const missing = new Set(missingFields({ ...form, kind: entry.list }));
  const parsed = parseTitle(form.title);

  const update = (patch) =>
    setEntries((list) => list.map((e, i) => (i === index ? { ...e, form: { ...e.form, ...patch } } : e)));

  const setField = (field) => (value) => {
    const patch = { [field]: value };
    if (field === "read") patch.dateRead = value ? form.dateRead || todayISO() : "";
    if (field === "title") {
      // fill blank shared fields from an existing series
      const info = seriesInfo.get(parseTitle(value).key);
      if (info) {
        for (const f of ["authors", "publisher", "demographic", "genre", "subGenre"]) {
          if (!form[f] && info[f]) patch[f] = info[f];
        }
        if (!form.msrp && info.msrp !== "") patch.msrp = String(info.msrp);
      }
    }
    update(patch);
  };

  const setList = (list) => setEntries((es) => es.map((e) => (e.id ? e : { ...e, list })));

  const titleSuggestions = useMemo(() => {
    const q = form.title.trim().toLowerCase();
    if (!titleFocus || entry.id || q.length < 2) return [];
    const out = [];
    for (const info of seriesInfo.values()) {
      if (info.display.toLowerCase().includes(q) && info.key !== parsed.key) {
        out.push(nextVolumeTitle(info.display, (info.maxVol || 0) + 1));
        if (out.length >= 5) break;
      }
    }
    return out;
  }, [form.title, titleFocus, entry.id, seriesInfo, parsed.key]);

  const addNextVolume = () => {
    if (!parsed.series) return;
    let maxVol = Math.max(parsed.vol || 0, seriesInfo.get(parsed.key)?.maxVol || 0);
    for (const e of entries) {
      const p = parseTitle(e.form.title);
      if (p.key === parsed.key) maxVol = Math.max(maxVol, ...p.volumes, p.vol || 0);
    }
    const next = {
      uid: uid(),
      id: null,
      list: entry.list,
      form: {
        ...EMPTY_ENTRY,
        title: nextVolumeTitle(parsed.series, maxVol + 1),
        authors: form.authors,
        publisher: form.publisher,
        demographic: form.demographic,
        genre: form.genre,
        subGenre: form.subGenre,
        msrp: form.msrp,
        amountPaid: form.amountPaid,
        datePurchased: form.datePurchased,
        hidden: form.hidden,
      },
    };
    setEntries((es) => [...es, next]);
    setIndex(entries.length);
    bodyRef.current?.closest(".sheet-body")?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const removeEntry = (i) => {
    setEntries((es) => es.filter((_, j) => j !== i));
    setIndex((cur) => Math.max(0, cur >= i ? cur - 1 : cur));
  };

  const doLookup = async () => {
    setLookingUp(true);
    try {
      const found = await lookupIsbn(form.isbn);
      if (!found) {
        toast("No match found for that ISBN", { type: "info" });
        return;
      }
      // an existing series' details win, so naming stays consistent
      const info = seriesInfo.get(parseTitle(form.title || found.title).key);
      const merged = { ...found };
      if (info) {
        for (const f of ["authors", "publisher", "demographic", "genre", "subGenre"]) if (info[f]) merged[f] = info[f];
        if (info.msrp !== "") merged.msrp = String(info.msrp);
      }
      const patch = {};
      for (const [k, v] of Object.entries(merged)) if (v && !form[k]) patch[k] = v;
      update(patch);
      const n = Object.keys(patch).length;
      toast(n ? `Filled ${n} field${n === 1 ? "" : "s"} from ISBN` : "Nothing new to fill in", {
        type: n ? "success" : "info",
      });
    } catch (err) {
      toast(err.message || "Lookup failed", { type: "error" });
    } finally {
      setLookingUp(false);
    }
  };

  const save = async () => {
    const blank = entries.findIndex((e) => !e.form.title.trim());
    if (blank !== -1) {
      setIndex(blank);
      toast("Every entry needs a title", { type: "error" });
      return;
    }
    setSaving(true);
    try {
      await saveEntries(
        entries.map((e) => ({ id: e.id, list: e.list, form: e.form })),
        { allVolumes: all, seriesInfo, user }
      );
      const added = entries.filter((e) => !e.id).length;
      toast(
        added === entries.length
          ? `Added ${added} to ${LIST_LABEL[entries[0].list]}`
          : `Saved ${entries.length} change${entries.length === 1 ? "" : "s"}`
      );
      onClose();
    } catch (err) {
      console.error(err);
      toast(err.message || "Couldn't save — try again", { type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const newCount = entries.filter((e) => !e.id).length;
  const mixedLists = new Set(entries.map((e) => e.list)).size > 1;
  const title = cfg.mode === "add" ? "Add to collection" : entries.length > 1 ? "Edit volumes" : "Edit volume";
  const editionValue = form.specialType || "";

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      subtitle={entries.length > 1 ? `Entry ${index + 1} of ${entries.length}` : undefined}
      headerExtra={
        entries.length > 1 && (
          <div className="volume-nav">
            <button
              type="button"
              className="btn btn--ghost btn--icon"
              disabled={index === 0}
              onClick={() => setIndex(index - 1)}
              aria-label="Previous entry"
            >
              <ChevronLeft />
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--icon"
              disabled={index === entries.length - 1}
              onClick={() => setIndex(index + 1)}
              aria-label="Next entry"
            >
              <ChevronRight />
            </button>
          </div>
        )
      }
      width={860}
      footer={
        <>
          {parsed.vol > 0 && (
            <button type="button" className="btn btn--ghost" onClick={addNextVolume}>
              <Plus /> Next volume
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn btn--ghost hide-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={save} disabled={saving}>
            {saving && <span className="spinner" />}
            {newCount === entries.length
              ? entries.length > 1
                ? `Add ${entries.length} volumes`
                : "Add"
              : entries.length > 1
                ? `Save ${entries.length}`
                : "Save changes"}
          </button>
        </>
      }
    >
      <div ref={bodyRef}>
        {entries.length > 1 && (
          <div className="entry-tabs" role="tablist">
            {entries.map((e, i) => {
              const needsInfo = missingFields({ ...e.form, kind: e.list }).length > 0;
              const markWishlist = mixedLists && e.list === "wishlist";
              return (
                <button
                  type="button"
                  key={e.uid}
                  role="tab"
                  className="entry-tab"
                  aria-selected={i === index}
                  onClick={() => setIndex(i)}
                  title={`${e.form.title}${markWishlist ? " (wishlist)" : ""}${needsInfo ? " — missing info" : ""}`}
                >
                  {needsInfo && <span className="dot" style={{ color: "var(--warn)", width: 6, height: 6 }} />}
                  {entryLabel(e.form.title)}
                  {markWishlist && <Bookmark size={12} aria-label="wishlist" />}
                  {!e.id && cfg.mode === "add" && entries.length > 1 && (
                    <span
                      className="x"
                      role="button"
                      aria-label="Remove entry"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        removeEntry(i);
                      }}
                    >
                      <X />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <div className="editor-layout">
          <div className="editor-cover">
            <Cover src={form.cover} alt={form.title || "Cover preview"} size={500} eager key={form.cover} />
            {cfg.mode === "add" && !entry.id && (
              <div className="segmented segmented--sm" role="group" aria-label="List">
                {["library", "wishlist"].map((l) => (
                  <button type="button" key={l} aria-pressed={entry.list === l} onClick={() => setList(l)}>
                    {LIST_LABEL[l]}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="form-section">
              <div className="field">
                <TextField
                  label="Title"
                  placeholder="Series Name, Vol. 1"
                  value={form.title}
                  onChange={setField("title")}
                  onFocus={() => setTitleFocus(true)}
                  onBlur={() => setTimeout(() => setTitleFocus(false), 150)}
                  autoComplete="off"
                  required
                />
                {titleSuggestions.length > 0 && (
                  <div className="title-suggest">
                    {titleSuggestions.map((s) => (
                      <button
                        type="button"
                        key={s}
                        className="btn btn--soft btn--sm"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => setField("title")(s)}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="form-grid form-grid--2">
                <TextField
                  label="Author(s)"
                  value={form.authors}
                  onChange={setField("authors")}
                  missing={missing.has("authors")}
                  list="dl-authors"
                />
                <TextField
                  label="Publisher"
                  value={form.publisher}
                  onChange={setField("publisher")}
                  missing={missing.has("publisher")}
                  list="dl-publishers"
                />
              </div>
              <div className="form-grid form-grid--3">
                <SelectField
                  label="Demographic"
                  value={form.demographic}
                  onChange={setField("demographic")}
                  placeholder="—"
                  options={[...new Set([...DEMOGRAPHICS, form.demographic].filter(Boolean))]}
                  missing={missing.has("demographic")}
                />
                <TextField
                  label="Genre"
                  value={form.genre}
                  onChange={setField("genre")}
                  list="dl-genres"
                  missing={missing.has("genre")}
                />
                <TextField
                  label="Sub-genre"
                  value={form.subGenre}
                  onChange={setField("subGenre")}
                  list="dl-subgenres"
                />
              </div>
            </div>

            <div className="form-section">
              <div className="form-section-title">Details</div>
              <div className="form-grid form-grid--2" style={{ alignItems: "end" }}>
                <TextField
                  label="ISBN"
                  value={form.isbn}
                  onChange={setField("isbn")}
                  missing={isLib && missing.has("isbn")}
                  inputMode="numeric"
                />
                <button
                  type="button"
                  className="btn btn--soft"
                  style={{ justifySelf: "start", height: 42 }}
                  onClick={doLookup}
                  disabled={lookingUp || !form.isbn.trim()}
                >
                  {lookingUp ? <span className="spinner" /> : <ScanSearch />}
                  Fill from ISBN
                </button>
              </div>
              <div className="form-grid form-grid--3">
                <TextField
                  label="Release date"
                  type="date"
                  value={form.date}
                  onChange={setField("date")}
                  missing={missing.has("date")}
                />
                <TextField
                  label={isLib ? "Purchased" : "Pre-ordered"}
                  type="date"
                  value={form.datePurchased}
                  onChange={setField("datePurchased")}
                  missing={isLib && missing.has("datePurchased")}
                />
                <TextField
                  label="Pages"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={form.pageCount}
                  onChange={setField("pageCount")}
                  missing={missing.has("pageCount")}
                />
              </div>
              <TextField
                label="Cover image URL"
                type="url"
                placeholder="https://…"
                value={form.cover}
                onChange={setField("cover")}
              />
              {!isLib && (
                <TextField
                  label="Store link"
                  type="url"
                  placeholder="https://amazon.com/…"
                  value={form.amazonURL}
                  onChange={setField("amazonURL")}
                />
              )}
            </div>

            {isLib && (
              <div className="form-section">
                <div className="form-section-title">Price & edition</div>
                <div className="segmented segmented--sm" role="group" aria-label="Edition">
                  {[
                    ["", "Standard"],
                    ["specialEdition", "Special edition"],
                    ["collectible", "Collectible"],
                  ].map(([value, label]) => (
                    <button
                      type="button"
                      key={label}
                      aria-pressed={editionValue === value}
                      onClick={() => update({ specialType: value })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="form-grid form-grid--3">
                  {editionValue !== "collectible" && (
                    <TextField
                      label="Paid"
                      prefix="$"
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      value={form.amountPaid}
                      onChange={setField("amountPaid")}
                      missing={missing.has("amountPaid")}
                    />
                  )}
                  <TextField
                    label="MSRP"
                    prefix="$"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={form.msrp}
                    onChange={setField("msrp")}
                    missing={missing.has("msrp")}
                  />
                  {editionValue === "collectible" && (
                    <TextField
                      label="Collectible value"
                      prefix="$"
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      value={form.collectiblePrice}
                      onChange={setField("collectiblePrice")}
                      missing={missing.has("collectiblePrice")}
                    />
                  )}
                  {editionValue === "specialEdition" && (
                    <TextField
                      label="Volumes contained"
                      type="number"
                      inputMode="numeric"
                      min="0"
                      value={form.specialVolumes}
                      onChange={setField("specialVolumes")}
                      missing={missing.has("specialVolumes")}
                    />
                  )}
                </div>
              </div>
            )}

            <div className="form-section">
              <div className="form-section-title">{isLib ? "Reading & visibility" : "Visibility"}</div>
              {isLib && (
                <>
                  <div className="form-grid form-grid--2" style={{ alignItems: "end" }}>
                    <Switch label="I've read this" checked={form.read} onChange={setField("read")} />
                    {form.read && (
                      <TextField label="Date read" type="date" value={form.dateRead} onChange={setField("dateRead")} />
                    )}
                  </div>
                  {form.read && (
                    <div className="field">
                      <span className="field-label">Rating</span>
                      <StarRating
                        value={form.rating}
                        onChange={(v) => update({ rating: v === "" ? "" : String(v) })}
                        size={26}
                      />
                    </div>
                  )}
                </>
              )}
              <Switch label="Hide this series from visitors" checked={form.hidden} onChange={setField("hidden")} />
            </div>
          </div>
        </div>

        <datalist id="dl-authors">
          {authorsList.slice(0, 300).map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
        <datalist id="dl-publishers">
          {publishers.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
        <datalist id="dl-genres">
          {genres.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
        <datalist id="dl-subgenres">
          {subGenres.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      </div>
    </Sheet>
  );
}

/** Add/edit sheet. Pass a config from editorConfig(), or null to close. */
export default function EntryEditor({ config, onClose }) {
  const cfg = useSticky(config);
  if (!cfg) return null;
  return <EditorInner key={cfg.key} cfg={cfg} open={!!config} onClose={onClose} />;
}
