import { useCallback, useEffect, useState } from "react";
import { store } from "../../lib/store";

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Live suggestions submitted by signed-in visitors (admin only). */
export function useSuggestions() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(
    () =>
      store.listenCollection(
        "suggestions",
        (rows) => {
          setItems(
            rows
              .map((r) => ({ ...r, createdAt: toDate(r.createdAt), type: (r.type || "manga").toLowerCase() }))
              .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))
          );
          setLoading(false);
          setError("");
        },
        (err) => {
          console.error("Suggestions listener failed", err);
          setError("Couldn't load suggestions.");
          setLoading(false);
        }
      ),
    []
  );

  const remove = useCallback((id) => store.deleteDocument("suggestions", id), []);
  const restore = useCallback(
    ({ id, createdAt, ...data }) =>
      store.setDocument("suggestions", id, { ...data, createdAt: createdAt?.toISOString() || "" }),
    []
  );

  return { items, loading, error, remove, restore };
}
