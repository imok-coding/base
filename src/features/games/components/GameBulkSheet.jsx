import { useState } from "react";
import Sheet from "../../../components/ui/Sheet";
import { useFeedback } from "../../../components/ui/Feedback";
import { normalizeDate } from "../../../lib/format";
import { useAuth } from "../../auth/AuthContext";
import { useSticky } from "../../manga/hooks";
import { patchGames } from "../api";
import { OPTIONS } from "../model";

const FIELDS = [
  { key: "backlog", label: "Backlog status", options: OPTIONS.backlog },
  { key: "priority", label: "Priority", options: OPTIONS.priority },
  { key: "status", label: "Collection", options: OPTIONS.status },
  { key: "genre", label: "Genre", options: OPTIONS.genre },
  { key: "format", label: "Format", options: OPTIONS.format },
  { key: "platform", label: "Platform", options: OPTIONS.platform },
  { key: "playMode", label: "Play mode", options: OPTIONS.playMode },
  { key: "store", label: "Store / source", options: OPTIONS.store },
  { key: "region", label: "Region", options: OPTIONS.region },
  { key: "condition", label: "Condition", options: OPTIONS.condition },
  { key: "acquired", label: "Acquired", type: "date" },
];

function shared(games, key) {
  const vals = new Set(games.map((g) => String(g[key] ?? "")));
  return vals.size === 1 ? [...vals][0] : "";
}

function BulkInner({ games, open, onClose }) {
  const { user } = useAuth();
  const { toast } = useFeedback();
  const [enabled, setEnabled] = useState({});
  const [values, setValues] = useState(() => Object.fromEntries(FIELDS.map((f) => [f.key, shared(games, f.key)])));
  const [saving, setSaving] = useState(false);
  const count = Object.values(enabled).filter(Boolean).length;

  const set = (key, v) => {
    setValues((vs) => ({ ...vs, [key]: v }));
    setEnabled((e) => ({ ...e, [key]: true }));
  };

  const apply = async () => {
    const data = {};
    for (const f of FIELDS)
      if (enabled[f.key]) data[f.key] = f.type === "date" ? normalizeDate(values[f.key]) : values[f.key];
    setSaving(true);
    try {
      await patchGames(games, data, { user });
      toast(`Updated ${games.length} game${games.length === 1 ? "" : "s"}`);
      onClose(true);
    } catch {
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
      subtitle={`${games.length} game${games.length === 1 ? "" : "s"} · only checked fields change`}
      width={540}
      footer={
        <button type="button" className="btn btn--primary" disabled={!count || saving} onClick={apply}>
          {saving && <span className="spinner" />}
          Apply{count ? ` ${count} change${count === 1 ? "" : "s"}` : ""}
        </button>
      }
    >
      {FIELDS.map((f) => (
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
            {f.type === "date" ? (
              <input className="input" type="date" value={values[f.key]} onChange={(e) => set(f.key, e.target.value)} />
            ) : (
              <select className="select" value={values[f.key]} onChange={(e) => set(f.key, e.target.value)}>
                <option value="">None</option>
                {[...new Set([...f.options, values[f.key]].filter(Boolean))].map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      ))}
    </Sheet>
  );
}

export default function GameBulkSheet({ games, onClose }) {
  const kept = useSticky(games);
  if (!kept) return null;
  return <BulkInner key={kept.map((g) => g.id).join(",")} games={kept} open={!!games} onClose={onClose} />;
}
