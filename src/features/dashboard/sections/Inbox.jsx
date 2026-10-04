import { useEffect, useState } from "react";
import { Activity, BookmarkPlus, Inbox as InboxIcon, Lightbulb, Trash2, Tv } from "lucide-react";
import Empty from "../../../components/ui/Empty";
import { useFeedback } from "../../../components/ui/Feedback";
import { clearActivity, readActivity, subscribeActivity } from "../../../lib/activity";
import { timeAgo } from "../../../lib/format";
import { useWorkspace } from "../../manga/Workspace";

function useActivity() {
  const [entries, setEntries] = useState(readActivity);
  useEffect(() => subscribeActivity(() => setEntries(readActivity())), []);
  return entries;
}

export default function Inbox({ suggestions }) {
  const ws = useWorkspace();
  const { toast, confirm } = useFeedback();
  const activity = useActivity();
  const [type, setType] = useState("all");
  const counts = suggestions.items.reduce((acc, s) => ({ ...acc, [s.type]: (acc[s.type] || 0) + 1 }), {});
  const types = Object.keys(counts).sort();
  const shown = type === "all" ? suggestions.items : suggestions.items.filter((s) => s.type === type);

  const remove = async (s) => {
    try {
      await suggestions.remove(s.id);
      toast("Suggestion deleted", { type: "info", action: { label: "Undo", onClick: () => suggestions.restore(s) } });
    } catch {
      toast("Couldn't delete that", { type: "error" });
    }
  };

  return (
    <div className="dash-grid">
      <section className="card dash-card span-8">
        <div className="card-head">
          <div>
            <div className="card-title">
              <Lightbulb /> Suggestions
            </div>
            <div className="card-sub">Sent by signed-in visitors</div>
          </div>
          {types.length > 1 && (
            <div className="segmented segmented--sm">
              <button type="button" aria-pressed={type === "all"} onClick={() => setType("all")}>
                All <span className="count">{suggestions.items.length}</span>
              </button>
              {types.map((t) => (
                <button
                  type="button"
                  key={t}
                  aria-pressed={type === t}
                  onClick={() => setType(t)}
                  style={{ textTransform: "capitalize" }}
                >
                  {t} <span className="count">{counts[t]}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {suggestions.error && <p style={{ color: "var(--danger)", fontSize: "var(--text-sm)" }}>{suggestions.error}</p>}
        {suggestions.loading ? (
          <div className="skeleton" style={{ height: 120 }} />
        ) : shown.length === 0 ? (
          <Empty icon={InboxIcon} title="Inbox zero">
            New suggestions will show up here.
          </Empty>
        ) : (
          <div className="inbox-list">
            {shown.map((s) => (
              <div key={s.id} className="inbox-item">
                <span className="inbox-icon">{s.type === "anime" ? <Tv /> : <Lightbulb />}</span>
                <div className="inbox-body">
                  <div className="inbox-text">{s.content || "(empty)"}</div>
                  <div className="inbox-meta">
                    {s.from || "anonymous"} · {s.createdAt ? timeAgo(s.createdAt) : "unknown date"}
                    {s.type !== "manga" && ` · ${s.type}`}
                  </div>
                </div>
                <div className="inbox-actions">
                  {s.type === "manga" && (
                    <button
                      type="button"
                      className="btn btn--sm btn--soft"
                      onClick={() => ws.actions.add("wishlist", { title: s.content })}
                      title="Add to wishlist"
                    >
                      <BookmarkPlus /> <span className="hide-xs">Wishlist</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn--sm btn--ghost btn--icon"
                    onClick={() => remove(s)}
                    aria-label="Delete suggestion"
                  >
                    <Trash2 />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card dash-card span-4">
        <div className="card-head">
          <div>
            <div className="card-title">
              <Activity /> Activity
            </div>
            <div className="card-sub">Changes made from this browser</div>
          </div>
          {activity.length > 0 && (
            <button
              type="button"
              className="card-link"
              onClick={async () => {
                const ok = await confirm({
                  title: "Clear the activity log?",
                  message: "This only clears the copy saved in this browser.",
                  confirmLabel: "Clear",
                  danger: true,
                });
                if (ok) clearActivity();
              }}
            >
              Clear
            </button>
          )}
        </div>
        {activity.length === 0 ? (
          <p className="subtle chart-empty">No activity yet.</p>
        ) : (
          <div className="inbox-list" style={{ maxHeight: 560, overflowY: "auto" }}>
            {activity.map((a, i) => (
              <div key={`${a.ts.getTime()}-${i}`} className="inbox-item" style={{ padding: "10px 0" }}>
                <div className="inbox-body">
                  <div className="inbox-text" style={{ fontWeight: 500 }}>
                    {a.message}
                  </div>
                  <div className="inbox-meta">
                    {timeAgo(a.ts)}
                    {a.user ? ` · ${a.user}` : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
