import { useState } from "react";
import { ExternalLink, MonitorPlay, Play } from "lucide-react";
import { youtubeEmbed, youtubeId, youtubeStart, youtubeThumb } from "../../lib/youtube";

/** Click-to-play YouTube review: only the thumbnail loads until someone presses play. */
export default function ReviewVideo({ url, title = "Review video" }) {
  const [playing, setPlaying] = useState(false);
  const id = youtubeId(url);
  if (!id) return null;
  return (
    <section className="review">
      <div className="review-head">
        <span className="card-title" style={{ color: "var(--text-1)" }}>
          <MonitorPlay /> {title}
        </span>
        <a className="card-link" href={url} target="_blank" rel="noreferrer">
          Open on YouTube <ExternalLink />
        </a>
      </div>
      <div className="review-frame">
        {playing ? (
          <iframe
            src={youtubeEmbed(id, youtubeStart(url))}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        ) : (
          <button type="button" className="review-poster" onClick={() => setPlaying(true)} aria-label={`Play ${title}`}>
            <img src={youtubeThumb(id)} alt="" loading="lazy" />
            <span className="review-play">
              <Play />
            </span>
          </button>
        )}
      </div>
    </section>
  );
}
