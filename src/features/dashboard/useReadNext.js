import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { store } from "../../lib/store";
import { useAuth } from "../auth/AuthContext";
import { purchaseNextSuggestion, readNextSuggestion, sanitizeSnoozed } from "./stats";

const COLLECTION = "readNextState";
const LOCAL_KEY = "dashboard.readNextSnoozed";
const DAY = 86400000;

function readLocal() {
  try {
    return sanitizeSnoozed(JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}"));
  } catch {
    return {};
  }
}

/** Read-next / purchase-next picks, with snoozes + shuffle synced to Firestore. */
export function useReadNext(stats) {
  const { user } = useAuth();
  const [snoozed, setSnoozed] = useState(readLocal);
  const [seed, setSeed] = useState(() => Math.random());
  const [loaded, setLoaded] = useState(false);
  const synced = useRef("");
  const lastSummary = useRef("");

  useEffect(() => {
    if (!user) return undefined;
    return store.listenDoc(
      COLLECTION,
      user.uid,
      (data) => {
        const next = { snoozed: sanitizeSnoozed(data?.snoozed), seed: Number.isFinite(data?.seed) ? data.seed : null };
        if (next.seed !== null) setSeed(next.seed);
        setSnoozed(next.snoozed);
        synced.current = JSON.stringify({ snoozed: next.snoozed, seed: next.seed });
        setLoaded(true);
      },
      (err) => {
        console.warn("read-next state unavailable", err);
        setLoaded(true);
      }
    );
  }, [user]);

  // persist local changes (but not echoes of what we just received)
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(snoozed));
    } catch {
      /* ignore */
    }
    if (!user || !loaded) return;
    const key = JSON.stringify({ snoozed, seed });
    if (key === synced.current) return;
    synced.current = key;
    store
      .setDocument(COLLECTION, user.uid, { snoozed, seed, updatedAt: new Date().toISOString() }, { merge: true })
      .catch((e) => console.warn(e));
  }, [snoozed, seed, user, loaded]);

  const readNext = useMemo(
    () => readNextSuggestion(stats.progress, stats.releases, snoozed, seed),
    [stats, snoozed, seed]
  );
  const purchaseNext = useMemo(
    () => purchaseNextSuggestion(stats.progress, stats.releases, stats.globalAvgMsrp),
    [stats]
  );

  // keep a summary of the latest pick, as the old dashboard did
  useEffect(() => {
    if (!user || !loaded || !readNext?.pick) return;
    const { pick, backup } = readNext;
    const summary = {
      pick: {
        key: pick.key,
        title: pick.title,
        score: Number(pick.score.toFixed(3)),
        ownershipRatio: pick.ownershipRatio,
        behindCount: pick.behindCount,
      },
      backup: backup ? { key: backup.key, title: backup.title, behindCount: backup.behindCount } : null,
      weights: { pick: pick.weights, seed },
    };
    const key = JSON.stringify(summary);
    if (key === lastSummary.current) return;
    lastSummary.current = key;
    store
      .setDocument(
        COLLECTION,
        user.uid,
        { lastSuggestion: { ...summary, updatedAt: new Date().toISOString() } },
        { merge: true }
      )
      .catch((e) => console.warn(e));
  }, [readNext, user, loaded, seed]);

  const shuffle = useCallback(() => setSeed((s) => s + 1), []);
  const snooze = useCallback(
    (key, days = 7) => {
      setSnoozed((prev) => ({ ...prev, [key]: Date.now() + days * DAY }));
      shuffle();
    },
    [shuffle]
  );
  const clearSnoozes = useCallback(() => setSnoozed({}), []);

  return { readNext, purchaseNext, shuffle, snooze, clearSnoozes, snoozedCount: Object.keys(snoozed).length };
}
