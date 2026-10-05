import { useEffect, useState } from "react";
import { ImageOff, Search } from "lucide-react";
import Sheet from "../../../components/ui/Sheet";
import StarRating from "../../../components/ui/StarRating";
import { SelectField, TextField } from "../../../components/ui/Fields";
import { useFeedback } from "../../../components/ui/Feedback";
import { searchGameCovers } from "../../../lib/gameCovers";
import { todayISO } from "../../../lib/format";
import { youtubeId, youtubeThumb } from "../../../lib/youtube";
import { useAuth } from "../../auth/AuthContext";
import { useSticky } from "../../manga/hooks";
import { saveGames } from "../api";
import { EMPTY_GAME, normalizeGame, OPTIONS } from "../model";
import { GameCover } from "./GameTile";

const withCurrent = (list, value) => [...new Set([...list, value].filter(Boolean))];

function CoverPicker({ query, open, onClose, onPick }) {
  const [state, setState] = useState({ q: "", loading: false, results: null, error: "" });
  const [text, setText] = useState(query);

  const run = async (q) => {
    setState({ q, loading: true, results: null, error: "" });
    try {
      setState({ q, loading: false, results: await searchGameCovers(q, 12), error: "" });
    } catch {
      setState({ q, loading: false, results: [], error: "Search failed — try again in a moment." });
    }
  };

  // search for the game's title as soon as the picker opens
  useEffect(() => {
    if (open && query) run(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Sheet open={open} onClose={onClose} title="Pick cover art" subtitle="Box art from Wikipedia articles" width={680}>
      <form
        className="input-wrap"
        style={{ marginBottom: 16 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) run(text.trim());
        }}
      >
        <Search />
        <input
          className="input"
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Search for cover art"
        />
      </form>
      {state.loading && <div className="skeleton" style={{ height: 180 }} />}
      {state.error && <p style={{ color: "var(--danger)" }}>{state.error}</p>}
      {state.results && !state.results.length && !state.error && (
        <p className="subtle" style={{ textAlign: "center", padding: 24 }}>
          <ImageOff size={20} style={{ verticalAlign: "-4px" }} /> No images found — try a shorter title.
        </p>
      )}
      {state.results?.length > 0 && (
        <div className="cover-picks">
          {state.results.map((r) => (
            <button type="button" key={r.image} className="cover-pick" onClick={() => onPick(r.image)}>
              <GameCover game={{ title: r.article, cover: r.image }} size={300} />
              <strong className="clamp-2">{r.article}</strong>
              <span className="clamp-2">{r.description}</span>
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}

function EditorInner({ cfg, open, onClose }) {
  const { user } = useAuth();
  const { toast } = useFeedback();
  const [form, setForm] = useState(cfg.form);
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);
  const set = (field) => (value) =>
    setForm((f) => {
      const next = { ...f, [field]: value };
      if (field === "backlog" && value === "Completed" && !f.completedDate) next.completedDate = todayISO();
      return next;
    });

  const reviewId = youtubeId(form.reviewUrl);

  const save = async () => {
    if (!form.title.trim()) {
      toast("Give the game a title", { type: "error" });
      return;
    }
    if (form.reviewUrl.trim() && !reviewId) {
      toast("Fix the review video link first", { type: "error" });
      return;
    }
    setSaving(true);
    try {
      await saveGames([{ id: cfg.id, form }], { user });
      toast(cfg.id ? "Saved" : `Added ${form.title}`);
      onClose();
    } catch (err) {
      console.error(err);
      toast("Couldn't save — try again", { type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const preview = normalizeGame(form);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={cfg.id ? "Edit game" : "Add a game"}
      width={860}
      footer={
        <>
          <span className="spacer" />
          <button type="button" className="btn btn--ghost hide-sm" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={save} disabled={saving}>
            {saving && <span className="spinner" />}
            {cfg.id ? "Save changes" : "Add game"}
          </button>
        </>
      }
    >
      <div className="editor-layout">
        <div className="editor-cover">
          <GameCover game={preview} size={500} eager key={form.cover} />
          <button
            type="button"
            className="btn btn--soft btn--sm"
            onClick={() => setPicking(true)}
            disabled={!form.title.trim()}
          >
            <Search /> Find cover
          </button>
        </div>
        <div>
          <div className="form-section">
            <TextField label="Title" value={form.title} onChange={set("title")} required autoComplete="off" />
            <div className="form-grid form-grid--2">
              <SelectField
                label="Platform"
                value={form.platform}
                onChange={set("platform")}
                placeholder="—"
                options={withCurrent(OPTIONS.platform, form.platform)}
              />
              <TextField
                label="Edition / version"
                value={form.edition}
                onChange={set("edition")}
                placeholder="e.g. Deluxe Edition"
              />
            </div>
            <div className="form-grid form-grid--3">
              <SelectField label="Format" value={form.format} onChange={set("format")} options={OPTIONS.format} />
              <SelectField label="Collection" value={form.status} onChange={set("status")} options={OPTIONS.status} />
              <SelectField
                label="Genre"
                value={form.genre}
                onChange={set("genre")}
                placeholder="—"
                options={withCurrent(OPTIONS.genre, form.genre)}
              />
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title">Backlog</div>
            <div className="form-grid form-grid--3">
              <SelectField label="Status" value={form.backlog} onChange={set("backlog")} options={OPTIONS.backlog} />
              <SelectField
                label="Priority"
                value={form.priority}
                onChange={set("priority")}
                placeholder="—"
                options={OPTIONS.priority}
              />
              <SelectField
                label="Play mode"
                value={form.playMode}
                onChange={set("playMode")}
                placeholder="—"
                options={OPTIONS.playMode}
              />
            </div>
            <div className="form-grid form-grid--3">
              <TextField
                label="Hours played"
                type="number"
                inputMode="decimal"
                min="0"
                value={form.hoursPlayed}
                onChange={set("hoursPlayed")}
              />
              <TextField
                label="Estimated hours"
                type="number"
                inputMode="decimal"
                min="0"
                value={form.hoursEstimated}
                onChange={set("hoursEstimated")}
              />
              <TextField
                label="Completion %"
                type="number"
                inputMode="numeric"
                min="0"
                max="100"
                value={form.completion}
                onChange={set("completion")}
              />
            </div>
            <div className="form-grid form-grid--3">
              <TextField label="Last played" type="date" value={form.lastPlayed} onChange={set("lastPlayed")} />
              <TextField label="Completed" type="date" value={form.completedDate} onChange={set("completedDate")} />
              <SelectField
                label="Worth revisiting?"
                value={form.revisit}
                onChange={set("revisit")}
                placeholder="—"
                options={["Yes", "No"]}
              />
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title">Review</div>
            <div className="field">
              <span className="field-label">Rating</span>
              <StarRating
                value={form.rating}
                onChange={(v) => set("rating")(v === "" ? "" : String(v))}
                step={1}
                size={26}
              />
            </div>
            <div className="field">
              <TextField
                label="Review video (YouTube link)"
                type="url"
                inputMode="url"
                placeholder="https://youtu.be/…"
                value={form.reviewUrl}
                onChange={set("reviewUrl")}
              />
              {form.reviewUrl.trim() && !reviewId && (
                <span className="field-hint" style={{ color: "var(--danger)" }} role="alert">
                  That doesn&apos;t look like a YouTube video link.
                </span>
              )}
              {reviewId && (
                <div className="review-thumb">
                  <img src={youtubeThumb(reviewId)} alt="" />
                  <span className="field-hint">Shows on the game&apos;s page — visitors tap to play.</span>
                </div>
              )}
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title">Purchase</div>
            <div className="form-grid form-grid--3">
              <TextField label="Acquired" type="date" value={form.acquired} onChange={set("acquired")} />
              <TextField
                label="Paid"
                prefix="$"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={form.price}
                onChange={set("price")}
              />
              <TextField
                label="Release year"
                type="number"
                inputMode="numeric"
                min="1970"
                value={form.releaseYear}
                onChange={set("releaseYear")}
              />
            </div>
            <div className="form-grid form-grid--3">
              <SelectField
                label="Store / source"
                value={form.store}
                onChange={set("store")}
                placeholder="—"
                options={withCurrent(OPTIONS.store, form.store)}
              />
              <SelectField
                label="Region"
                value={form.region}
                onChange={set("region")}
                placeholder="—"
                options={withCurrent(OPTIONS.region, form.region)}
              />
              <SelectField
                label="Condition"
                value={form.condition}
                onChange={set("condition")}
                placeholder="—"
                options={withCurrent(OPTIONS.condition, form.condition)}
              />
            </div>
            <TextField
              label="Cover image URL"
              type="url"
              placeholder="https://…"
              value={form.cover}
              onChange={set("cover")}
            />
            <div className="field">
              <label className="field-label" htmlFor="game-notes">
                Notes
              </label>
              <textarea
                id="game-notes"
                className="textarea"
                value={form.notes}
                onChange={(e) => set("notes")(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>
      <CoverPicker
        key={picking ? form.title : "closed"}
        query={form.title}
        open={picking}
        onClose={() => setPicking(false)}
        onPick={(url) => {
          set("cover")(url);
          setPicking(false);
        }}
      />
    </Sheet>
  );
}

/** config: { key, id?, form } or null */
export default function GameEditor({ config, onClose }) {
  const cfg = useSticky(config);
  if (!cfg) return null;
  return <EditorInner key={cfg.key} cfg={cfg} open={!!config} onClose={onClose} />;
}

let n = 0;
export function gameEditorConfig(game, form) {
  return { key: `g${++n}`, id: game?.id || null, form: { ...EMPTY_GAME, ...form } };
}
