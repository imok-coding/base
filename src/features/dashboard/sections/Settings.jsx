import { useEffect, useState } from "react";
import { Download, Shield, ShieldCheck, Users, Webhook } from "lucide-react";
import { useFeedback } from "../../../components/ui/Feedback";
import { TextField } from "../../../components/ui/Fields";
import { UserAvatar } from "../../../components/layout/AppShell";
import { downloadJSON } from "../../../lib/download";
import { store } from "../../../lib/store";
import { loadWebhooks, saveWebhooks } from "../../../lib/webhooks";
import { useAuth } from "../../auth/AuthContext";
import { useManga } from "../../manga/MangaData";

function WebhookSettings() {
  const { toast } = useFeedback();
  const [values, setValues] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadWebhooks({ refresh: true }).then(setValues);
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      setValues(await saveWebhooks(values));
      toast("Webhooks saved");
    } catch {
      toast("Couldn't save webhooks", { type: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="card dash-card span-6" onSubmit={save}>
      <div className="card-head">
        <div>
          <div className="card-title">
            <Webhook /> Discord webhooks
          </div>
          <div className="card-sub">Where activity, release and yearly posts go. Leave blank for the default.</div>
        </div>
      </div>
      {!values ? (
        <div className="skeleton" style={{ height: 200 }} />
      ) : (
        <div className="form-section">
          <TextField
            label="Activity log"
            type="url"
            value={values.activity}
            onChange={(v) => setValues({ ...values, activity: v })}
            placeholder="https://discord.com/api/webhooks/…"
          />
          <TextField
            label="Release day"
            type="url"
            value={values.release}
            onChange={(v) => setValues({ ...values, release: v })}
            placeholder="https://discord.com/api/webhooks/…"
          />
          <TextField
            label="Yearly summary"
            type="url"
            value={values.yearly}
            onChange={(v) => setValues({ ...values, yearly: v })}
            placeholder="https://discord.com/api/webhooks/…"
          />
          <div>
            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving && <span className="spinner" />} Save webhooks
            </button>
          </div>
        </div>
      )}
    </form>
  );
}

function UserRoles() {
  const { user } = useAuth();
  const { toast, confirm } = useFeedback();
  const [users, setUsers] = useState(null);

  useEffect(
    () =>
      store.listenCollection(
        "users",
        (rows) => {
          const rank = (u) => (u.role === "admin" ? 0 : 1);
          const name = (u) => u.displayName || u.email || "";
          setUsers(rows.sort((a, b) => rank(a) - rank(b) || name(a).localeCompare(name(b))));
        },
        () => setUsers([])
      ),
    []
  );

  const setRole = async (u, role) => {
    const ok = await confirm({
      title:
        role === "admin"
          ? `Make ${u.displayName || u.email} an admin?`
          : `Remove admin from ${u.displayName || u.email}?`,
      message:
        role === "admin"
          ? "Admins can add, edit and delete anything in the collection."
          : "They'll be able to browse and suggest only.",
      confirmLabel: role === "admin" ? "Make admin" : "Make viewer",
      danger: role !== "admin",
    });
    if (!ok) return;
    try {
      await store.setDocument(
        "users",
        u.id,
        { role, updatedBy: user?.uid || "manual", updatedAt: new Date().toISOString() },
        { merge: true }
      );
      toast(`${u.displayName || u.email} is now ${role === "admin" ? "an admin" : "a viewer"}`);
    } catch {
      toast("Couldn't change that role", { type: "error" });
    }
  };

  return (
    <section className="card dash-card span-6">
      <div className="card-head">
        <div>
          <div className="card-title">
            <Users /> People & roles
          </div>
          <div className="card-sub">Everyone who has signed in</div>
        </div>
      </div>
      {!users ? (
        <div className="skeleton" style={{ height: 200 }} />
      ) : (
        <div>
          {users.map((u) => (
            <div key={u.id} className="user-row">
              <UserAvatar user={u} />
              <div className="user-row-info">
                <div className="user-row-name">
                  {u.displayName || u.email || u.id}
                  {u.id === user?.uid && <span className="subtle"> (you)</span>}
                </div>
                <div className="user-row-email">{u.email || u.id}</div>
              </div>
              <span className={`role-pill ${u.role === "admin" ? "role-pill--admin" : ""}`} style={{ marginTop: 0 }}>
                {u.role === "admin" ? "Admin" : "Viewer"}
              </span>
              {u.id !== user?.uid &&
                (u.role === "admin" ? (
                  <button type="button" className="btn btn--sm btn--ghost" onClick={() => setRole(u, "viewer")}>
                    <Shield /> <span className="hide-xs">Make viewer</span>
                  </button>
                ) : (
                  <button type="button" className="btn btn--sm btn--soft" onClick={() => setRole(u, "admin")}>
                    <ShieldCheck /> <span className="hide-xs">Make admin</span>
                  </button>
                ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function Settings() {
  const { library, wishlist } = useManga();
  const strip = (rows) => rows.map(({ series, seriesKey, vol, volumes, ...rest }) => rest);
  return (
    <div className="dash-grid">
      <WebhookSettings />
      <UserRoles />
      <section className="card dash-card span-12">
        <div className="card-head" style={{ marginBottom: 6 }}>
          <div>
            <div className="card-title">
              <Download /> Backup
            </div>
            <div className="card-sub">
              Download the whole collection as JSON. Replacing <code>public/manga-library-wishlist.json</code> with it
              keeps the offline fallback fresh.
            </div>
          </div>
          <button
            type="button"
            className="btn"
            onClick={() =>
              downloadJSON({ library: strip(library), wishlist: strip(wishlist) }, "manga-library-wishlist.json")
            }
          >
            <Download /> Download
          </button>
        </div>
      </section>
    </div>
  );
}
