import { useMemo, useState } from 'react';
import { round1 } from '../lib/nutrition.js';

// Progress bar for one macro vs a target value or min–max range.
// Identity is carried by the label; color only signals state:
// blue = in progress, green = within range, red = over the ceiling.
export function MacroBar({ label, value, unit, target }) {
  const max = target.max ?? target.value;
  const min = target.min ?? null;
  const scale = max * 1.15; // headroom so "over" is visible
  const pct = Math.min(100, (value / scale) * 100);

  let cls = 'bar-fill';
  if (value > max * 1.02) cls += ' over';
  else if (min != null && value >= min) cls += ' met';
  else if (min == null && value >= max * 0.98) cls += ' met';

  const targetText = min != null ? `${min}–${max}` : `${max}`;

  return (
    <div className="macro-row">
      <div className="macro-head">
        <span>{label}</span>
        <span className="value">
          {round1(value)} <span className="target">/ {targetText} {unit}</span>
        </span>
      </div>
      <div className="bar-track">
        <div className={cls} style={{ width: `${pct}%` }} />
        {min != null && (
          <div className="range-mark" style={{ left: `${(min / scale) * 100}%` }} />
        )}
        <div className="range-mark" style={{ left: `${(max / scale) * 100}%` }} />
      </div>
    </div>
  );
}

// Single-series weight line with the goal range shaded as a band.
export function WeightChart({ entries, band }) {
  const [hover, setHover] = useState(null);
  const W = 580, H = 220;
  const pad = { top: 16, right: 44, bottom: 28, left: 8 };

  const model = useMemo(() => {
    if (!entries || entries.length === 0) return null;
    const pts = entries
      .map((e) => ({ t: new Date(e.date).getTime(), kg: e.weight_kg, date: e.date }))
      .sort((a, b) => a.t - b.t);
    const t0 = pts[0].t;
    const t1 = pts[pts.length - 1].t;
    const tSpan = Math.max(t1 - t0, 1);
    const kgs = pts.map((p) => p.kg);
    let lo = Math.min(...kgs, band ? band.min : Infinity) - 1;
    let hi = Math.max(...kgs, band ? band.max : -Infinity) + 1;
    const x = (t) => pad.left + ((t - t0) / tSpan) * (W - pad.left - pad.right);
    const y = (kg) => pad.top + (1 - (kg - lo) / (hi - lo)) * (H - pad.top - pad.bottom);
    return { pts, x, y, lo, hi };
  }, [entries, band]);

  if (!model) return <p className="center">No weight entries yet.</p>;
  const { pts, x, y, lo, hi } = model;

  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.kg).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  const gridVals = [];
  for (let v = Math.ceil(lo / 2) * 2; v <= hi; v += 2) gridVals.push(v);

  function onMove(evt) {
    const svg = evt.currentTarget;
    const rect = svg.getBoundingClientRect();
    const mx = ((evt.clientX - rect.left) / rect.width) * W;
    let best = null;
    for (const p of pts) {
      const d = Math.abs(x(p.t) - mx);
      if (!best || d < best.d) best = { p, d };
    }
    setHover(best ? best.p : null);
  }

  return (
    <div className="chart-wrap">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label="Weight over time"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        onTouchStart={(e) => onMove(e.touches[0] ? { ...e, clientX: e.touches[0].clientX, currentTarget: e.currentTarget } : e)}
      >
        {band && (
          <rect
            x={pad.left}
            width={W - pad.left - pad.right}
            y={y(band.max)}
            height={Math.max(0, y(band.min) - y(band.max))}
            fill="var(--series-soft)"
            opacity="0.35"
          />
        )}
        {gridVals.map((v) => (
          <g key={v}>
            <line x1={pad.left} x2={W - pad.right} y1={y(v)} y2={y(v)} stroke="var(--grid)" strokeWidth="1" />
            <text x={W - pad.right + 6} y={y(v) + 4} fontSize="11" fill="var(--muted)">{v}</text>
          </g>
        ))}
        <path d={path} fill="none" stroke="var(--series)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p) => (
          <circle key={p.t} cx={x(p.t)} cy={y(p.kg)} r={hover && hover.t === p.t ? 5 : 3.5} fill="var(--series)" stroke="var(--surface)" strokeWidth="2" />
        ))}
        {/* direct label on the latest point */}
        {!hover && (
          <text x={Math.min(x(last.t), W - pad.right - 4)} y={y(last.kg) - 10} fontSize="12" fontWeight="600" fill="var(--ink)" textAnchor="end">
            {last.kg} kg
          </text>
        )}
        {hover && (
          <g>
            <line x1={x(hover.t)} x2={x(hover.t)} y1={pad.top} y2={H - pad.bottom} stroke="var(--baseline)" strokeWidth="1" strokeDasharray="3 3" />
            <text className="chart-tooltip" x={Math.min(Math.max(x(hover.t), 60), W - 80)} y={pad.top + 2} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--ink)">
              {hover.kg} kg · {hover.date}
            </text>
          </g>
        )}
        <line x1={pad.left} x2={W - pad.right} y1={H - pad.bottom} y2={H - pad.bottom} stroke="var(--baseline)" strokeWidth="1" />
        <text x={pad.left} y={H - 8} fontSize="11" fill="var(--muted)">{pts[0].date}</text>
        <text x={W - pad.right} y={H - 8} fontSize="11" fill="var(--muted)" textAnchor="end">{last.date}</text>
      </svg>
    </div>
  );
}
