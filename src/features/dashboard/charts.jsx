import { useState } from "react";

function niceMax(max) {
  if (max <= 4) return Math.max(2, Math.ceil(max / 2) * 2);
  const pow = 10 ** Math.floor(Math.log10(max));
  const steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  for (const s of steps) if (s * pow >= max) return s * pow;
  return 10 * pow;
}

/**
 * Single-series column chart. Hover/focus a column for its value; the peak is
 * labelled directly. `active` highlights one column (e.g. the current month).
 */
export function ColumnChart({
  data,
  height = 180,
  unit = "",
  active = -1,
  ariaLabel,
  emptyText,
  formatValue = (v) => v.toLocaleString(),
}) {
  const [hover, setHover] = useState(-1);
  const max = Math.max(0, ...data.map((d) => d.value));
  const top = niceMax(max || 1);
  const ticks = [0, top / 2, top];
  const peak = max > 0 ? data.findIndex((d) => d.value === max) : -1;
  const shown = hover >= 0 ? data[hover] : null;

  return (
    <figure className="colchart" style={{ "--chart-h": `${height}px` }} aria-label={ariaLabel}>
      <div className="colchart-plot">
        {max === 0 && emptyText && <div className="colchart-empty">{emptyText}</div>}
        <div className="colchart-ticks" aria-hidden="true">
          {ticks.map((t) => (
            <div key={t} className="colchart-tick" style={{ bottom: `${(t / top) * 100}%` }}>
              <span>{Number.isInteger(t) ? t.toLocaleString() : t.toFixed(1)}</span>
            </div>
          ))}
        </div>
        <div className="colchart-cols" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}>
          {data.map((d, i) => (
            <button
              type="button"
              key={d.label}
              className={`colchart-col ${i === active ? "is-active" : ""} ${i === hover ? "is-hover" : ""}`}
              aria-label={`${d.label}: ${formatValue(d.value)}${unit ? ` ${unit}` : ""}`}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(-1)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(-1)}
              onClick={d.onClick}
            >
              <span className="colchart-bar" style={{ height: d.value ? `max(4px, ${(d.value / top) * 100}%)` : 0 }}>
                {i === peak && hover < 0 && <span className="colchart-peak">{formatValue(d.value)}</span>}
              </span>
              {i === hover && shown && (
                <span className="chart-tip" role="tooltip">
                  <strong>
                    {formatValue(shown.value)}
                    {unit ? ` ${unit}` : ""}
                  </strong>
                  <span>{shown.tip || shown.label}</span>
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
      <div
        className="colchart-x"
        style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}
        aria-hidden="true"
      >
        {data.map((d, i) => (
          <span key={d.label} className={i === active ? "is-active" : ""}>
            {d.label}
          </span>
        ))}
      </div>
    </figure>
  );
}

/** Horizontal ranked bars with the value at the tip. */
export function BarList({ items, max, formatValue = (v) => v.toLocaleString(), onSelect, empty = "No data yet" }) {
  if (!items.length) return <p className="subtle chart-empty">{empty}</p>;
  const top = max ?? Math.max(...items.map((i) => i.value), 1);
  return (
    <ol className="barlist list-reset">
      {items.map((it) => {
        const Row = onSelect ? "button" : "div";
        return (
          <li key={it.label}>
            <Row
              type={onSelect ? "button" : undefined}
              className="barlist-row"
              onClick={onSelect ? () => onSelect(it) : undefined}
            >
              <span className="barlist-label clamp-1">{it.label}</span>
              <span className="barlist-track">
                <span className="barlist-fill" style={{ width: `${Math.max(2, (it.value / top) * 100)}%` }} />
              </span>
              <span className="barlist-value tabular">{formatValue(it.value)}</span>
            </Row>
          </li>
        );
      })}
    </ol>
  );
}

/** Thin meter (0–1) for read progress etc. */
export function Meter({ value, label }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="meter" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}
