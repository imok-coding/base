import { useRef, useState } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";
import Sheet from "../../../components/ui/Sheet";
import { Switch } from "../../../components/ui/Fields";
import { useFeedback } from "../../../components/ui/Feedback";
import { findCoversFor } from "../../../lib/gameCovers";
import { useAuth } from "../../auth/AuthContext";
import { useGames } from "../GamesData";
import { applyImport } from "../api";
import { planImport, readGameWorkbook } from "../importer";

/** Import / re-import games from the tracker spreadsheet. */
export default function ImportSheet({ open, onClose }) {
  const { user } = useAuth();
  const { games } = useGames();
  const { toast } = useFeedback();
  const input = useRef(null);
  const [file, setFile] = useState(null);
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState("");
  const [covers, setCovers] = useState(true);
  const [busy, setBusy] = useState("");
  const [over, setOver] = useState(false);

  const reset = () => {
    setFile(null);
    setPlan(null);
    setError("");
    setBusy("");
  };

  const load = async (f) => {
    if (!f) return;
    reset();
    setFile(f);
    setBusy("Reading spreadsheet...");
    try {
      const { sheet, rows } = await readGameWorkbook(f);
      setPlan({ ...planImport(rows, games), sheet, total: rows.length });
    } catch (err) {
      console.error(err);
      setError(err.message || "That file couldn't be read.");
    } finally {
      setBusy("");
    }
  };

  const run = async () => {
    try {
      let found = new Map();
      if (covers) {
        const need = [
          ...plan.adds.filter((a) => !a.cover).map((a) => a.title),
          ...plan.updates.filter((u) => !u.game.cover).map((u) => u.game.title),
        ];
        if (need.length) {
          found = await findCoversFor(need, (done, total) => setBusy(`Finding cover art... ${done} / ${total}`));
        }
      }
      setBusy("Saving to the library...");
      await applyImport(plan, { user, covers: found });
      const withCover = [...found.values()].filter(Boolean).length;
      toast(
        `Imported ${plan.adds.length} new · ${plan.updates.length} updated${covers ? ` · ${withCover} covers found` : ""}`
      );
      reset();
      onClose();
    } catch (err) {
      console.error(err);
      setBusy("");
      setError("Import stopped part way. Nothing was lost, so just try again.");
    }
  };

  const changes = plan ? plan.adds.length + plan.updates.length : 0;

  return (
    <Sheet
      open={open}
      onClose={() => {
        if (!busy) {
          reset();
          onClose();
        }
      }}
      title="Import from spreadsheet"
      subtitle="Your Game Library & Backlog Tracker (.xlsx)"
      width={580}
      footer={
        plan && (
          <>
            <button type="button" className="btn btn--ghost" onClick={reset} disabled={!!busy}>
              Choose another file
            </button>
            <span className="spacer" />
            <button type="button" className="btn btn--primary" onClick={run} disabled={!!busy || !changes}>
              {busy && <span className="spinner" />}
              {changes ? `Import ${changes} game${changes === 1 ? "" : "s"}` : "Nothing to import"}
            </button>
          </>
        )
      }
    >
      {!plan && (
        <>
          <button
            type="button"
            className={`import-drop ${over ? "is-over" : ""}`}
            style={{ width: "100%" }}
            onClick={() => input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              load(e.dataTransfer.files?.[0]);
            }}
            disabled={!!busy}
          >
            {busy ? <span className="spinner" /> : <Upload />}
            <strong style={{ color: "var(--text-1)" }}>{busy || "Choose or drop your .xlsx file"}</strong>
            <span>Rows are read from the sheet with a "Game Title" column (your Backlog tab).</span>
          </button>
          <input
            ref={input}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            hidden
            onChange={(e) => load(e.target.files?.[0])}
          />
          {error && (
            <p style={{ color: "var(--danger)", fontSize: "var(--text-sm)", marginTop: 12 }} role="alert">
              {error}
            </p>
          )}
          <p className="subtle" style={{ fontSize: "var(--text-xs)", marginTop: 14 }}>
            The file is read in your browser and only the game rows are saved. Re-importing later updates games that
            already exist and adds new rows; blank cells never erase info already on the site.
          </p>
        </>
      )}

      {plan && (
        <>
          <div className="card-title" style={{ color: "var(--text-1)" }}>
            <FileSpreadsheet /> {file?.name} · {plan.sheet} · {plan.total} rows
          </div>
          <div className="import-summary">
            <div>
              <strong>{plan.adds.length}</strong>
              <span>new games</span>
            </div>
            <div>
              <strong>{plan.updates.length}</strong>
              <span>updated</span>
            </div>
            <div>
              <strong>{plan.unchanged}</strong>
              <span>already up to date</span>
            </div>
          </div>
          {plan.updates.length > 0 && (
            <details style={{ marginBottom: 14 }}>
              <summary className="muted" style={{ cursor: "pointer", fontSize: "var(--text-sm)" }}>
                What will change
              </summary>
              <ul className="subtle" style={{ fontSize: "var(--text-xs)", paddingLeft: 18 }}>
                {plan.updates.slice(0, 40).map(({ game, changes: c }) => (
                  <li key={game.id}>
                    {game.title}: {Object.keys(c).join(", ")}
                  </li>
                ))}
                {plan.updates.length > 40 && <li>and {plan.updates.length - 40} more</li>}
              </ul>
            </details>
          )}
          {plan.notInSheet.length > 0 && (
            <p className="subtle" style={{ fontSize: "var(--text-xs)", marginBottom: 14 }}>
              {plan.notInSheet.length} game{plan.notInSheet.length === 1 ? " is" : "s are"} on the site but not in this
              file. They&apos;ll be left alone.
            </p>
          )}
          <Switch label="Find cover art automatically (Wikipedia)" checked={covers} onChange={setCovers} />
          {busy && (
            <p className="muted" style={{ fontSize: "var(--text-sm)", marginTop: 12 }} aria-live="polite">
              {busy}
            </p>
          )}
          {error && (
            <p style={{ color: "var(--danger)", fontSize: "var(--text-sm)", marginTop: 12 }} role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </Sheet>
  );
}
