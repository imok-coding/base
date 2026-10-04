import { useEffect } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Disc3, Gamepad2, Monitor } from "lucide-react";
import "./games.css";

export default function Games() {
  useEffect(() => {
    document.title = "Games · Tyler's Collection";
  }, []);

  return (
    <div className="page">
      <div className="games-soon card">
        <div className="games-soon-icon">
          <Gamepad2 />
        </div>
        <div className="page-eyebrow">Coming soon</div>
        <h1 className="page-title">Game library</h1>
        <p className="page-sub" style={{ marginInline: "auto" }}>
          Every physical game on the shelf — and eventually the digital ones too — will live here, with the same search,
          filters and stats as the manga library.
        </p>
        <ul className="games-soon-list list-reset">
          <li>
            <Disc3 /> Physical collection by platform
          </li>
          <li>
            <Monitor /> Digital libraries later
          </li>
        </ul>
        <Link to="/manga" className="btn btn--soft">
          <BookOpen /> Browse the manga for now
        </Link>
      </div>
    </div>
  );
}
