import { useCallback, useEffect, useMemo, useState } from "react";
import { checkNewVolumes, seriesToCheck } from "../../lib/newVolumes";
import { toISODate } from "../../lib/format";
import { useManga } from "../manga/MangaData";

// Results live in this browser only. The check runs on its own when the
// dashboard opens and the last one is more than a day old.
const KEY = "newVolumeCheck";
const EVERY = 20 * 60 * 60 * 1000;
const EMPTY = { checkedAt: 0, results: [], unmatched: [], dismissed: [] };

function load() {
  try {
    return { ...EMPTY, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return EMPTY;
  }
}

function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* private mode or storage full, results just won't stick */
  }
}

// one check at a time, even if the dashboard is opened twice
let running = null;

export function useNewVolumes() {
  const { library, wishlist, seriesInfo, loading } = useManga();
  const [state, setState] = useState(load);
  const [job, setJob] = useState(null);

  const run = useCallback(async () => {
    if (running) return running;
    const series = seriesToCheck(seriesInfo, [...library, ...wishlist]);
    setJob({ done: 0, total: series.length });
    running = (async () => {
      try {
        const { results, unmatched } = await checkNewVolumes(series, (done, total) => setJob({ done, total }));
        const next = { ...load(), checkedAt: Date.now(), results, unmatched };
        save(next);
        setState(next);
      } catch (err) {
        console.error("New volume check failed", err);
      } finally {
        running = null;
        setJob(null);
      }
    })();
    return running;
  }, [seriesInfo, library, wishlist]);

  // check once the manga has actually loaded (it can still be empty right after signing in)
  const ready = !loading && seriesInfo.size > 0;
  useEffect(() => {
    if (ready && Date.now() - load().checkedAt > EVERY) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const dismiss = useCallback((id) => {
    setState((s) => {
      const next = { ...s, dismissed: [...new Set([...s.dismissed, id])] };
      save(next);
      return next;
    });
  }, []);

  // hide what's been added since, dismissed, or is too old now
  const items = useMemo(() => {
    const now = new Date();
    const since = toISODate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30));
    const dismissed = new Set(state.dismissed);
    return state.results.filter(
      (r) => !dismissed.has(r.id) && r.vol > (seriesInfo.get(r.seriesKey)?.maxVol || 0) && (r.approx || r.date >= since)
    );
  }, [state, seriesInfo]);

  return { items, unmatched: state.unmatched, checkedAt: state.checkedAt, job, run, dismiss };
}
