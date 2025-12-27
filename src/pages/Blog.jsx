import { useEffect, useMemo, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import "../styles/blog.css";
import { db } from "../firebaseConfig";
import { useAuth } from "../contexts/AuthContext";

const EMPTY_FORM = {
  id: null,
  title: "",
  summary: "",
  body: "",
  cover: "",
  tags: "",
  status: "draft",
  publishedAt: null,
};

function normalizeDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value?.toDate) return value.toDate();
  return null;
}

function formatDate(value) {
  const d = normalizeDate(value);
  if (!d) return "—";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function tagsToInput(tags = []) {
  return Array.isArray(tags) ? tags.join(", ") : "";
}

function parseTags(str) {
  return (str || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export default function Blog() {
  const { admin, user, loading: authLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [status, setStatus] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedId, setSelectedId] = useState(null);

  const publishedPosts = useMemo(
    () => posts.filter((p) => p.status === "published"),
    [posts]
  );
  const visiblePosts = useMemo(
    () => (admin ? posts : publishedPosts),
    [admin, posts, publishedPosts]
  );
  const selectedPost = useMemo(
    () => visiblePosts.find((p) => p.id === selectedId) || null,
    [selectedId, visiblePosts]
  );

  useEffect(() => {
    document.title = "Blog | Reviews";
  }, []);

  useEffect(() => {
    if (authLoading) return;
    loadPosts();
  }, [admin, authLoading]);

  useEffect(() => {
    const incoming = searchParams.get("post");
    if (incoming) {
      setSelectedId(incoming);
    }
  }, [searchParams]);

  useEffect(() => {
    if (loading) return;
    const paramId = searchParams.get("post");
    const preferredId = paramId || selectedId;
    const usableId = preferredId && visiblePosts.some((p) => p.id === preferredId)
      ? preferredId
      : visiblePosts[0]?.id || null;
    applySelection(usableId, { list: visiblePosts });
  }, [loading, visiblePosts]);

  const underConstruction = !admin && !loading && publishedPosts.length === 0;

  function mapToForm(post) {
    return {
      id: post.id,
      title: post.title || "",
      summary: post.summary || "",
      body: post.body || "",
      cover: post.cover || "",
      tags: tagsToInput(post.tags),
      status: post.status || "draft",
      publishedAt: post.publishedAt || null,
    };
  }

  async function loadPosts(nextSelectionId = null) {
    if (authLoading) return;
    setLoading(true);
    setStatus("");
    try {
      const colRef = collection(db, "blogPosts");
      const baseQuery = admin
        ? query(colRef, orderBy("updatedAt", "desc"))
        : query(
            colRef,
            where("status", "==", "published"),
            orderBy("publishedAt", "desc")
          );
      const snap = await getDocs(baseQuery);
      const rows = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          createdAt: normalizeDate(data.createdAt),
          updatedAt: normalizeDate(data.updatedAt),
          publishedAt: normalizeDate(data.publishedAt),
          tags: Array.isArray(data.tags) ? data.tags : [],
        };
      });
      setPosts(rows);
      const list = admin ? rows : rows.filter((p) => p.status === "published");
      const desired =
        nextSelectionId ||
        searchParams.get("post") ||
        (list.length ? list[0].id : null);
      if (desired && list.some((p) => p.id === desired)) {
        applySelection(desired, { list });
      } else {
        applySelection(list[0]?.id || null, { list });
      }
    } catch (err) {
      console.error("Failed to load blog posts", err);
      const needsAuth = err?.code === "permission-denied";
      setStatus(
        needsAuth
          ? "You do not have permission to view these posts. Make sure you are signed in with an admin account."
          : "Failed to load posts. Try again shortly."
      );
    } finally {
      setLoading(false);
    }
  }

  function applySelection(id, { list } = {}) {
    setSelectedId(id || null);
    setSearchParams(id ? { post: id } : {});
    const source = list || posts;
    if (admin) {
      const match = source.find((p) => p.id === id);
      if (match) {
        setForm(mapToForm(match));
      } else {
        setForm(EMPTY_FORM);
      }
    }
  }

  function handleSelect(postId) {
    applySelection(postId);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleStartNew() {
    setForm(EMPTY_FORM);
    setSelectedId(null);
    setSearchParams({});
  }

  function toPayload(statusOverride) {
    const statusValue = statusOverride || form.status || "draft";
    const publishedValue =
      statusValue === "published"
        ? form.publishedAt || serverTimestamp()
        : null;
    return {
      title: form.title.trim(),
      summary: form.summary.trim(),
      body: form.body.trim(),
      cover: form.cover.trim(),
      tags: parseTags(form.tags),
      status: statusValue,
      publishedAt: publishedValue,
      updatedAt: serverTimestamp(),
    };
  }

  async function handleSave(statusOverride = "draft") {
    if (!admin || saving) return;
    if (!form.title.trim() || !form.body.trim()) {
      setStatus("Title and body are required.");
      return;
    }

    setSaving(true);
    setStatus("");
    try {
      const payload = toPayload(statusOverride);
      let targetId = form.id;
      if (form.id) {
        await updateDoc(doc(db, "blogPosts", form.id), payload);
      } else {
        const ref = await addDoc(collection(db, "blogPosts"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        targetId = ref.id;
      }
      setStatus(
        statusOverride === "published"
          ? "Post published and visible to everyone."
          : "Draft saved."
      );
      await loadPosts(targetId);
    } catch (err) {
      console.error("Failed to save blog post", err);
      setStatus("Could not save the post. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(postId) {
    if (!admin || !postId || deleting) return;
    const ok = window.confirm("Delete this post? This cannot be undone.");
    if (!ok) return;
    setDeleting(true);
    setStatus("");
    try {
      await deleteDoc(doc(db, "blogPosts", postId));
      setStatus("Post deleted.");
      await loadPosts();
      handleStartNew();
    } catch (err) {
      console.error("Failed to delete post", err);
      setStatus("Could not delete the post.");
    } finally {
      setDeleting(false);
    }
  }

  const renderedBody = (selectedPost?.body || "")
    .split(/\n{2,}/)
    .map((chunk, idx) => (
      <p key={idx} className="blog-body-paragraph">
        {chunk}
      </p>
    ));

  if (authLoading) {
    return (
      <div className="page blog-page">
        <div className="blog-guard-card">Checking access...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/signin" replace />;
  }

  if (!admin) {
    return <Navigate to="/home" replace />;
  }

  return (
    <div className="page blog-page">
      <header className="blog-hero">
        <div className="blog-pill">
          {admin ? "Admin workspace" : "Latest updates"}
        </div>
        <h1>Blog & Reviews</h1>
        <p>
          Share reviews for anime or manga you have read. Draft privately, publish when ready,
          and keep visitors in the loop with new releases.
        </p>
      </header>

      {status && <div className="blog-status">{status}</div>}

      <div className="blog-shell">
        <aside className="blog-sidebar">
          <div className="blog-sidebar-header">
            <div>
              <div className="blog-sidebar-label">Posts</div>
              <div className="blog-sidebar-count">
                {visiblePosts.length} {visiblePosts.length === 1 ? "entry" : "entries"}
              </div>
            </div>
            {admin && (
              <button
                type="button"
                className="blog-btn solid"
                onClick={handleStartNew}
              >
                + New draft
              </button>
            )}
          </div>

          <div className="blog-list">
            {loading && <div className="blog-muted">Loading posts...</div>}
            {!loading && !visiblePosts.length && (
              <div className="blog-muted">No posts yet.</div>
            )}
            {visiblePosts.map((post) => (
              <button
                key={post.id}
                className={
                  "blog-list-item" + (selectedId === post.id ? " active" : "")
                }
                onClick={() => handleSelect(post.id)}
              >
                <div className="blog-list-row">
                  <span className="blog-list-title">{post.title || "Untitled"}</span>
                  <span
                    className={
                      "blog-chip " +
                      (post.status === "published" ? "success" : "draft")
                    }
                  >
                    {post.status === "published" ? "Published" : "Draft"}
                  </span>
                </div>
                <div className="blog-list-sub">
                  {post.status === "published"
                    ? `Published ${formatDate(post.publishedAt)}`
                    : `Last touched ${formatDate(post.updatedAt)}`}
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="blog-main">
          {underConstruction ? (
            <div className="blog-guard-card">
              <h3>Under construction</h3>
              <p>
                This blog page is being built. Once posts are published, they will appear here.
                Admins can already create and publish posts.
              </p>
            </div>
          ) : selectedPost ? (
            <article className="blog-article">
              <div className="blog-article-meta">
                <span
                  className={
                    "blog-chip " +
                    (selectedPost.status === "published" ? "success" : "draft")
                  }
                >
                  {selectedPost.status === "published" ? "Published" : "Draft"}
                </span>
                <span className="blog-meta-text">
                  {selectedPost.status === "published"
                    ? `Published ${formatDate(selectedPost.publishedAt)}`
                    : `Last saved ${formatDate(selectedPost.updatedAt)}`}
                </span>
              </div>
              <h2 className="blog-article-title">
                {selectedPost.title || "Untitled"}
              </h2>
              {selectedPost.summary && (
                <p className="blog-article-summary">{selectedPost.summary}</p>
              )}
              {selectedPost.cover && (
                <div className="blog-cover">
                  <img src={selectedPost.cover} alt="" />
                </div>
              )}
              <div className="blog-body">{renderedBody}</div>
              {selectedPost.tags?.length ? (
                <div className="blog-tag-row">
                  {selectedPost.tags.map((tag) => (
                    <span key={tag} className="blog-chip ghost">
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
            </article>
          ) : (
            <div className="blog-guard-card">
              <h3>No post selected</h3>
              <p>Select a post from the left to read it.</p>
            </div>
          )}

          {admin && (
            <div className="blog-editor-card">
              <div className="blog-editor-header">
                <div>
                  <div className="blog-sidebar-label">
                    {form.id ? "Edit post" : "New draft"}
                  </div>
                  <div className="blog-sidebar-count">
                    {form.id ? "Update and publish when ready" : "Fill in the details to create"}
                  </div>
                </div>
                {form.id && (
                  <button
                    type="button"
                    className="blog-btn danger"
                    onClick={() => handleDelete(form.id)}
                    disabled={deleting}
                  >
                    {deleting ? "Deleting..." : "Delete"}
                  </button>
                )}
              </div>

              <div className="blog-form">
                <label className="blog-field">
                  <span>Title</span>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                    placeholder="e.g., Chainsaw Man Volume 14 Review"
                  />
                </label>

                <label className="blog-field">
                  <span>Summary</span>
                  <input
                    type="text"
                    value={form.summary}
                    onChange={(e) => setForm((p) => ({ ...p, summary: e.target.value }))}
                    placeholder="One-liner that appears in previews"
                  />
                </label>

                <label className="blog-field">
                  <span>Cover image URL (optional)</span>
                  <input
                    type="url"
                    value={form.cover}
                    onChange={(e) => setForm((p) => ({ ...p, cover: e.target.value }))}
                    placeholder="https://..."
                  />
                </label>

                <label className="blog-field">
                  <span>Tags (comma separated)</span>
                  <input
                    type="text"
                    value={form.tags}
                    onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))}
                    placeholder="anime, manga, review"
                  />
                </label>

                <label className="blog-field">
                  <span>Body</span>
                  <textarea
                    rows={8}
                    value={form.body}
                    onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))}
                    placeholder="Write your review here. Separate paragraphs with blank lines."
                  />
                </label>

                <div className="blog-actions">
                  <button
                    type="button"
                    className="blog-btn"
                    onClick={() => handleSave("draft")}
                    disabled={saving}
                  >
                    {saving ? "Saving..." : "Save draft"}
                  </button>
                  <button
                    type="button"
                    className="blog-btn solid"
                    onClick={() => handleSave("published")}
                    disabled={saving}
                  >
                    {saving ? "Publishing..." : "Publish"}
                  </button>
                  {form.status === "published" && (
                    <button
                      type="button"
                      className="blog-btn ghost"
                      onClick={() => handleSave("draft")}
                      disabled={saving}
                    >
                      Move to draft
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
