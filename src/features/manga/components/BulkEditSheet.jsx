import { useMemo, useState } from "react";
import { ListChecks } from "lucide-react";
import Sheet from "../../../components/ui/Sheet";
import { useFeedback } from "../../../components/ui/Feedback";
import { numberOrBlank, normalizeDate } from "../../../lib/format";
import { useAuth } from "../../auth/AuthContext";
import { useManga } from "../MangaData";
import { patchVolumes, readPatch } from "../api";
import { DEMOGRAPHICS } from "../model";
import { useSticky } from "../hooks";

const FIELDS = [
  { key: "datePurchased", label: "Purchase date", type: "date" },
  { key: "amountPaid", label: "Amount paid", type: "money", libraryOnly: true },
  { key: "msrp", label: "MSRP", type: "money", libraryOnly: true },
  { key: "publisher", label: "Publisher", type: "text", list: "dl-bulk-publishers" },
  { key: "demographic", label: "Demographic", type: "select", options: DEMOGRAPHICS },
  { key: "genre", label: "Genre", type: "text", list: "dl-bulk-genres" },
  { key: "subGenre", label: "Sub-genre", type: "text" },
  { key: "read", label: "Read", type: "bool", libraryOnly: true },
  { key: "hidden", label: "Hidden from visitors", type: "bool" },
];

/** Shared value across all volumes, or "" when they differ. */
function sharedValue(volumes, key) {
  const vals = new Set(volumes.map((v) => (v[key] ?? "").toString()));
  return vals.size === 1 ? [...vals][0] : "";
}

function BulkInner({ volumes, open, onClose, onEditEach }) {
  const { user } = useAuth();
  const { library, wishlist } = useManga();
  const { toast } = useFeedback();
  const hasLibrary = volumes.some((v) => v.kind === "library");
  const fields = FIELDS.filter((f) => !f.libraryOnly || hasLibrary);
  const [enabled, setEnabled] = useState({});
  const [values, setValues] = useState(() =>
    Object.fromEntries(
      FIELDS.map((f) => [f.key, f.type === "bool" ? volumes.every((v) => !!v[f.key]) : sharedValue(volumes, f.key)])
    )
  );
  const [saving, setSaving] = useState(false);
  const all = useMemo(() => [...library, ...wishlist], [library, wishlist]);
  const publishers = useMemo(() => [...new Set(all.map((v) => v.publisher).filter(Boolean))].sort(), [all]);
  const genres = useMemo(() => [...new Set(all.map((v) => v.genre).filter(Boolean))].sort(), [all]);

  const set = (key, value) => {
    setValues((vs) => ({ ...vs, [key]: value }));
    setEnabled((e) => ({ ...e, [key]: true }));
  };

  const activeCount = Object.values(enabled).filter(Boolean).length;

  const apply = async () => {
    const data = {};
    for (const f of fields) {
      if (!enabled[f.key] || f.key === "read") continue;
      const val = values[f.key];
      if (f.type === "money") data[f.key] = numberOrBlank(val);
      else if (f.type === "date") data[f.key] = normalizeDate(val);
      else if (f.type === "bool") data[f.key] = !!val;
      else data[f.key] = (val || "").trim();
    }
    const libKeys = new Set(FIELDS.filter((f) => f.libraryOnly).map((f) => f.key));
    setSaving(true);
    try {
      await patchVolumes(
        volumes,
        (v) => {
          const patch = {};
          for (const [k, val] of Object.entries(data)) if (v.kind === "library" || !libKeys.has(k)) patch[k] = val;
          if (enabled.read && v.kind === "library") Object.assign(patch, readPatch(v, !!values.read));
          return patch;
        },
        { user, allVolumes: all }
      );
      toast(`Updated ${volumes.length} volume${volumes.length === 1 ? "" : "s"}`);
      onClose(true);
    } catch (err) {
      console.error(err);
      toast("Couldn't apply changes", { type: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={() => onClose(false)}
      title="Edit selected"
      subtitle={`${volumes.length} volume${volumes.length === 1 ? "" : "s"} · only checked fields change`}
      width={560}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={() => onEditEach(volumes)}>
            <ListChecks /> Edit one by one
          </button>
          <span className="spacer" />
          <button type="button" className="btn btn--primary" disabled={!activeCount || saving} onClick={apply}>
            {saving && <span className="spinner" />}
            Apply{activeCount ? ` ${activeCount} change${activeCount === 1 ? "" : "s"}` : ""}
          </button>
        </>
      }
    >
      <div>
        {fields.map((f) => (
          <div key={f.key} className={`bulk-row ${enabled[f.key] ? "" : "is-off"}`}>
            <input
              type="checkbox"
              className="checkbox"
              aria-label={`Change ${f.label}`}
              checked={!!enabled[f.key]}
              onChange={(e) => setEnabled((en) => ({ ...en, [f.key]: e.target.checked }))}
            />
            <div className="field">
              <span className="field-label">{f.label}</span>
              {f.type === "bool" ? (
                <label className="switch">
                  <input type="checkbox" checked={!!values[f.key]} onChange={(e) => set(f.key, e.target.checked)} />
                  {values[f.key] ? "Yes" : "No"}
                </label>
              ) : f.type === "select" ? (
                <select className="select" value={values[f.key]} onChange={(e) => set(f.key, e.target.value)}>
                  <option value="">None</option>
                  {[...new Set([...f.options, values[f.key]].filter(Boolean))].map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : f.type === "money" ? (
                <div className="input-wrap">
                  <span className="input-adorn">$</span>
                  <input
                    className="input"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={values[f.key]}
                    placeholder="mixed"
                    onChange={(e) => set(f.key, e.target.value)}
                  />
                </div>
              ) : (
                <input
                  className="input"
                  type={f.type === "date" ? "date" : "text"}
                  list={f.list}
                  value={values[f.key]}
                  placeholder="mixed"
                  onChange={(e) => set(f.key, e.target.value)}
                />
              )}
            </div>
          </div>
        ))}
        <datalist id="dl-bulk-publishers">
          {publishers.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        <datalist id="dl-bulk-genres">
          {genres.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
      </div>
    </Sheet>
  );
}

export default function BulkEditSheet({ volumes, onClose, onEditEach }) {
  const kept = useSticky(volumes);
  if (!kept) return null;
  return (
    <BulkInner
      key={kept.map((v) => v.id).join(",")}
      volumes={kept}
      open={!!volumes}
      onClose={onClose}
      onEditEach={onEditEach}
    />
  );
}
