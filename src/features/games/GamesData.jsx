import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { store } from "../../lib/store";
import { useAuth } from "../auth/AuthContext";
import { compareGames, isOwned, normalizeGame } from "./model";

const GamesContext = createContext(null);

/**
 * Live `games` collection, shared app-wide. `setupNeeded` is true when
 * Firestore rules don't allow the collection yet (permission-denied).
 */
export function GamesProvider({ children }) {
  const { user } = useAuth();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [setupNeeded, setSetupNeeded] = useState(false);

  useEffect(() => {
    setSetupNeeded(false);
    return store.listenCollection(
      "games",
      (docs) => {
        setRows(docs);
        setError("");
      },
      (err) => {
        if (err?.code === "permission-denied") setSetupNeeded(true);
        else {
          console.error("Games listener failed", err);
          setError("Couldn't load the game library.");
        }
        setRows([]);
      }
    );
  }, [user?.uid]);

  const value = useMemo(() => {
    const games = (rows || []).map(normalizeGame).sort(compareGames);
    return {
      loading: rows === null,
      error,
      setupNeeded,
      games,
      owned: games.filter(isOwned),
      wishlist: games.filter((g) => g.status === "Wishlist"),
      byId: new Map(games.map((g) => [g.id, g])),
    };
  }, [rows, error, setupNeeded]);

  return <GamesContext.Provider value={value}>{children}</GamesContext.Provider>;
}

export function useGames() {
  const ctx = useContext(GamesContext);
  if (!ctx) throw new Error("useGames must be used inside <GamesProvider>");
  return ctx;
}
