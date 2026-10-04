import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { store } from "../../lib/store";
import { useAuth } from "../auth/AuthContext";
import { buildSeriesInfo, compareVolumes, hiddenSeriesKeys, normalizeVolume } from "./model";

const MangaContext = createContext(null);

/**
 * Live library + wishlist from Firestore, shared app-wide so navigating
 * between pages never refetches. Falls back to the bundled JSON export when
 * Firestore is unreachable.
 */
export function MangaProvider({ children }) {
  const { isAdmin, user } = useAuth();
  const [raw, setRaw] = useState({ library: null, wishlist: null });
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let fellBack = false;

    const loadOffline = async (err) => {
      console.error("Manga listener failed", err);
      if (cancelled || fellBack) return;
      fellBack = true;
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}manga-library-wishlist.json`, { cache: "no-cache" });
        const json = await res.json();
        if (cancelled) return;
        setRaw({ library: json.library || [], wishlist: json.wishlist || [] });
        setOffline(true);
      } catch {
        if (!cancelled) setError("Couldn't load the collection. Check your connection and refresh.");
      }
    };

    const unsubs = ["library", "wishlist"].map((name) =>
      store.listenCollection(
        name,
        (rows) => {
          if (cancelled) return;
          setOffline(false);
          setError("");
          setRaw((prev) => ({ ...prev, [name]: rows }));
        },
        loadOffline
      )
    );
    return () => {
      cancelled = true;
      unsubs.forEach((u) => u?.());
    };
    // Re-subscribe on sign-in changes: security rules may expose more to admins.
  }, [user?.uid]);

  const value = useMemo(() => {
    const library = (raw.library || []).map((r) => normalizeVolume(r, "library")).sort(compareVolumes);
    const wishlist = (raw.wishlist || []).map((r) => normalizeVolume(r, "wishlist")).sort(compareVolumes);
    const hiddenKeys = hiddenSeriesKeys(library, wishlist);
    const visible = (list) => (isAdmin ? list : list.filter((v) => !hiddenKeys.has(v.seriesKey)));
    return {
      loading: raw.library === null || raw.wishlist === null,
      error,
      offline,
      library,
      wishlist,
      hiddenKeys,
      // what this viewer is allowed to see (admins see hidden series)
      publicLibrary: visible(library),
      publicWishlist: visible(wishlist),
      seriesInfo: buildSeriesInfo(library, wishlist),
      byId: new Map([...library, ...wishlist].map((v) => [v.id, v])),
    };
  }, [raw, error, offline, isAdmin]);

  return <MangaContext.Provider value={value}>{children}</MangaContext.Provider>;
}

export function useManga() {
  const ctx = useContext(MangaContext);
  if (!ctx) throw new Error("useManga must be used inside <MangaProvider>");
  return ctx;
}
