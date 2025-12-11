import { useEffect, useRef, useState } from "react";

export default function Home() {
  const TITLE_EN = "Tyler's Collection Homepage";
  const TITLE_JP = "\u30bf\u30a4\u30e9\u30fc\u306e\u30b3\u30ec\u30af\u30b7\u30e7\u30f3";
  const [title, setTitle] = useState("");
  const [cursorVisible, setCursorVisible] = useState(true);
  const blinkRef = useRef(null);
  const [lang, setLang] = useState("jp");
  const [contentOpacity, setContentOpacity] = useState(1);

  useEffect(() => {
    blinkRef.current = setInterval(() => setCursorVisible((v) => !v), 450);
    return () => {
      if (blinkRef.current) clearInterval(blinkRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

    const typeText = async (text, step = 120) => {
      for (let i = 1; i <= text.length; i += 1) {
        if (cancelled) return;
        setTitle(text.slice(0, i));
        await sleep(step);
      }
    };

    const backspace = async (text, step = 70) => {
      for (let i = text.length; i >= 0; i -= 1) {
        if (cancelled) return;
        setTitle(text.slice(0, i));
        await sleep(step);
      }
    };

    (async () => {
      const alreadySeen = localStorage.getItem("homeTitleTyped") === "1";
      if (alreadySeen) {
        setLang("en");
        setTitle(TITLE_EN);
        setCursorVisible(false);
        if (blinkRef.current) clearInterval(blinkRef.current);
        return;
      }

      await sleep(250);
      setLang("jp");
      await typeText(TITLE_JP, 140);
      await sleep(700);
      await backspace(TITLE_JP, 80);
      await sleep(320);
      setContentOpacity(0);
      await sleep(180);
      setLang("en");
      setContentOpacity(1);
      await typeText(TITLE_EN, 110);
      await sleep(2000);
      setCursorVisible(false);
      localStorage.setItem("homeTitleTyped", "1");
      if (blinkRef.current) clearInterval(blinkRef.current);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="page">
      <header style={{ textAlign: "center", marginTop: "32px", marginBottom: "24px" }}>
        <h1
          style={{
            margin: 0,
            fontSize: "2.2rem",
            color: "#ffb6c1",
            textShadow: "0 0 8px rgba(255,182,193,0.8)",
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <span>{title || " "}</span>
          <span
            style={{
              width: "6px",
              height: "1.1em",
              background: "#ffb6c1",
              opacity: cursorVisible ? 1 : 0,
              transition: "opacity 0.15s ease",
            }}
          />
        </h1>
        <p
          style={{
            margin: "6px 0 0",
            color: "var(--text-soft)",
            fontSize: "0.95rem",
            opacity: contentOpacity,
            transition: "opacity 0.25s ease",
          }}
        >
          {lang === "jp"
            ? "\u81ea\u5206\u306e\u66f8\u68b6\u3001\u30a6\u30a3\u30c3\u30b7\u30e5\u30ea\u30b9\u30c8\u3001TCG\u3092\u307e\u3068\u3081\u3066\u78ba\u8a8d\u3067\u304d\u308b\u30de\u30a4\u30da\u30fc\u30b8\u3067\u3059\u3002"
            : "This is my personal webpage to see what is on my shelves, wishlists, and TCG collections."}
        </p>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "10px",
            padding: "8px 14px",
            borderRadius: "999px",
            border: "1px solid rgba(255,182,193,0.5)",
            background: "linear-gradient(135deg, rgba(255,182,193,0.18), rgba(43,15,29,0.9))",
            boxShadow: "0 8px 24px rgba(0,0,0,0.55)",
            marginTop: "14px",
            fontSize: "0.78rem",
            color: "#ffe6ed",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            fontWeight: 700,
            opacity: contentOpacity,
            transition: "opacity 0.25s ease",
          }}
        >
          {lang === "jp" ? (
            <>
              <span role="img" aria-label="manga">📚</span> マンガ
              <span style={{ color: "rgba(255,182,193,0.6)" }}>•</span>
              <span role="img" aria-label="anime">🎬</span> アニメ
              <span style={{ color: "rgba(255,182,193,0.6)" }}>•</span>
              <span role="img" aria-label="tcg">🃏</span> TCG
            </>
          ) : (
            <>
              <span role="img" aria-label="manga">📚</span> Manga
              <span style={{ color: "rgba(255,182,193,0.6)" }}>•</span>
              <span role="img" aria-label="anime">🎬</span> Anime
              <span style={{ color: "rgba(255,182,193,0.6)" }}>•</span>
              <span role="img" aria-label="tcg">🃏</span> TCG
            </>
          )}
        </div>
      </header>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 2fr) minmax(0, 3fr)",
          gap: "20px",
          marginTop: "24px",
        }}
      >
        <article className="card">
          <h2 style={{ marginTop: 0, marginBottom: "8px", fontSize: "1.2rem", color: "#ffb6c1" }}>
            <span style={{ opacity: contentOpacity, transition: "opacity 0.25s ease" }}>
              {lang === "jp" ? "\u81ea\u5df1\u7d39\u4ecb" : "About Me"}
            </span>
          </h2>
          <p
            style={{
              margin: 0,
              color: "var(--text-soft)",
              fontSize: "0.9rem",
              lineHeight: 1.5,
              opacity: contentOpacity,
              transition: "opacity 0.25s ease",
            }}
          >
            {lang === "jp"
              ? "\u3053\u3093\u306b\u3061\u306f\u3001\u30bf\u30a4\u30e9\u30fc\uff08im.ok\uff09\u3067\u3059\u3002\u30de\u30f3\u30ac\u3092\u96c6\u3081\u3001\u30a2\u30cb\u30e1\u3092\u898b\u3066\u3001TCG\u3092\u697d\u3057\u3093\u3067\u3044\u307e\u3059\u3002"
              : "Hey, I am Tyler and I go by im.ok. I hoard manga, binge anime, and collect trading cards."}
          </p>
          <p
            style={{
              marginTop: "10px",
              color: "var(--text-soft)",
              fontSize: "0.9rem",
              opacity: contentOpacity,
              transition: "opacity 0.25s ease",
            }}
          >
            {lang === "jp"
              ? "\u3053\u306e\u30b5\u30a4\u30c8\u3067\u306f\u672c\u68da\u306e\u8535\u66f8\u3001\u8996\u8074\u6e08\u307f\u30a2\u30cb\u30e1\u3001TCG\u30b3\u30ec\u30af\u30b7\u30e7\u30f3\u3092\u5168\u90e8\u307e\u3068\u3081\u3066\u7ba1\u7406\u3057\u3066\u3044\u307e\u3059\u3002"
              : "This site is where I track everything: volumes on my shelves, finished shows, and my TCG collection as they all slowly grow."}
          </p>
          <div
            style={{
              marginTop: "12px",
              display: "flex",
              flexWrap: "wrap",
              gap: "6px",
              opacity: contentOpacity,
              transition: "opacity 0.25s ease",
            }}
          >
            <span className="pill">{lang === "jp" ? "\u30de\u30f3\u30ac\u8535\u66f8" : "Manga library"}</span>
            <span className="pill">{lang === "jp" ? "\u30de\u30a4\u30a2\u30cb\u30e1\u30ea\u30b9\u30c8" : "My Anime List (MAL)"}</span>
            <span className="pill">{lang === "jp" ? "\u30dd\u30b1\u30ab & \u30ef\u30f3\u30d4TCG" : "Pokemon & One Piece TCG"}</span>
            <span className="pill">{lang === "jp" ? "\u30c7\u30fc\u30bf\u597d\u304d" : "Data Nerd"}</span>
          </div>
        </article>

        <article className="card">
          <h2 style={{ marginTop: 0, marginBottom: "8px", fontSize: "1.2rem", color: "#ffb6c1" }}>
            <span style={{ opacity: contentOpacity, transition: "opacity 0.25s ease" }}>
              {lang === "jp" ? "\u5404\u30da\u30fc\u30b8\u3092\u63a2\u7d22" : "Explore these pages"}
            </span>
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
              gap: "14px",
              marginTop: "10px",
            }}
          >
            <a href="/base/manga" className="section-card">
              <h3 style={{ opacity: contentOpacity, transition: "opacity 0.25s ease" }}>
                {lang === "jp" ? "\u30de\u30f3\u30ac\u8535\u66f8" : "Manga Library"}
              </h3>
              <p style={{ opacity: contentOpacity, transition: "opacity 0.25s ease" }}>
                {lang === "jp" ? "\u8535\u66f8\u3068\u30a6\u30a3\u30c3\u30b7\u30e5\u30ea\u30b9\u30c8\u3092\u4e00\u89a7\u3002" : "Full manga collection & wishlist."}
              </p>
              <div className="section-chip-row">
                <span className="section-chip accent" style={{ opacity: contentOpacity, transition: "opacity 0.25s ease" }}>
                  {lang === "jp" ? "\u8535\u66f8\u30fb\u6b32\u3057\u3044\u672c" : "Library & wishlist"}
                </span>
              </div>
            </a>

            <a href="/base/anime" className="section-card">
              <h3 style={{ opacity: contentOpacity, transition: "opacity 0.25s ease" }}>
                {lang === "jp" ? "\u30a2\u30cb\u30e1\u4e00\u89a7" : "Anime Library"}
              </h3>
              <p style={{ opacity: contentOpacity, transition: "opacity 0.25s ease" }}>
                {lang === "jp"
                  ? "\u8996\u8074\u4e2d\u30fb\u5b8c\u4e86\u30fb\u4e88\u5b9a\u306e\u30ea\u30b9\u30c8\u3092MAL\u304b\u3089\u540c\u671f\u3002"
                  : "The entire watched, plan to watch, and watching list synced directly from MyAnimeList."}
              </p>
              <div className="section-chip-row">
                <span className="section-chip accent" style={{ opacity: contentOpacity, transition: "opacity 0.25s ease" }}>
                  {lang === "jp" ? "MAL\u540c\u671f" : "MAL synced"}
                </span>
                <span className="section-chip" style={{ opacity: contentOpacity, transition: "opacity 0.25s ease" }}>
                  {lang === "jp" ? "\u30b9\u30c6\u30fc\u30bf\u30b9\u7d5e\u308a\u8fbc\u307f" : "Status filters"}
                </span>
                <span className="section-chip" style={{ opacity: contentOpacity, transition: "opacity 0.25s ease" }}>
                  {lang === "jp" ? "\u30af\u30a4\u30c3\u30af\u30b9\u30c6\u30fc\u30bf\u30b9" : "Quick stats"}
                </span>
              </div>
            </a>

            <a href="/base/tcg" className="section-card">
              <h3 style={{ opacity: contentOpacity, transition: "opacity 0.25s ease" }}>
                {lang === "jp" ? "TCG\u30b3\u30ec\u30af\u30b7\u30e7\u30f3" : "TCG Collection"}
              </h3>
              <p style={{ opacity: contentOpacity, transition: "opacity 0.25s ease" }}>
                {lang === "jp"
                  ? "\u30dd\u30b1\u30e2\u30f3\u30fb\u30ef\u30f3\u30d4TCG\u306e\u6240\u6301\u30ab\u30fc\u30c9\u3092\u6570\u91cf\u3068\u4fa1\u683c\u3067\u7ba1\u7406\u3002"
                  : "Pokemon & One Piece TCG cards tracked with quantities, prices, and value."}
              </p>
              <div className="section-chip-row">
                <span className="section-chip accent" style={{ opacity: contentOpacity, transition: "opacity 0.25s ease" }}>
                  {lang === "jp" ? "\u30b3\u30ec\u30af\u30b7\u30e7\u30f3" : "Full Collection"}
                </span>
                <span className="section-chip" style={{ opacity: contentOpacity, transition: "opacity 0.25s ease" }}>
                  {lang === "jp" ? "\u958b\u767a\u4e2d" : "Still Under-Construction"}
                </span>
              </div>
            </a>
          </div>
        </article>
      </section>

      <footer style={{ marginTop: "28px", fontSize: "0.78rem", color: "var(--text-soft)", textAlign: "center" }}>
        @ 2025 im.ok. All rights reserved.
      </footer>
    </main>
  );
}
