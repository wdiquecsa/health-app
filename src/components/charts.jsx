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

// Single-series time trend line. Weight and body fat are different units on
// different scales, so they are never overlaid on one axis — each renders as
// its own panel (paired small multiples sharing the timeline).
function TrendChart({ pts, unit, colorVar, band, height, ariaLabel }) {
  const [hover, setHover] = useState(null);
  const W = 580;
  const H = height;
  const pad = { top: 16, right: 44, bottom: 28, left: 8 };

  const model = useMemo(() => {
    if (!pts || pts.length === 0) return null;
    const sorted = pts
      .map((p) => ({ t: new Date(p.date).getTime(), v: p.value, date: p.date }))
      .sort((a, b) => a.t - b.t);
    const t0 = sorted[0].t;
    const t1 = sorted[sorted.length - 1].t;
    const tSpan = Math.max(t1 - t0, 1);
    const vals = sorted.map((p) => p.v);
    const rawLo = Math.min(...vals, band ? band.min : Infinity);
    const rawHi = Math.max(...vals, band ? band.max : -Infinity);
    const margin = Math.max((rawHi - rawLo) * 0.15, 0.5);
    const lo = rawLo - margin;
    const hi = rawHi + margin;
    const x = (t) => pad.left + ((t - t0) / tSpan) * (W - pad.left - pad.right);
    const y = (v) => pad.top + (1 - (v - lo) / (hi - lo)) * (H - pad.top - pad.bottom);
    const range = hi - lo;
    const step = range > 10 ? 2 : range > 4 ? 1 : 0.5;
    return { sorted, x, y, lo, hi, step };
  }, [pts, band, H]);

  if (!model) return null;
  const { sorted, x, y, lo, hi, step } = model;

  const path = sorted.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const last = sorted[sorted.length - 1];
  const gridVals = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) gridVals.push(round1(v));

  function onMove(evt) {
    const svg = evt.currentTarget;
    const rect = svg.getBoundingClientRect();
    const mx = ((evt.clientX - rect.left) / rect.width) * W;
    let best = null;
    for (const p of sorted) {
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
        aria-label={ariaLabel}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        onTouchStart={(e) => e.touches[0] && onMove({ clientX: e.touches[0].clientX, currentTarget: e.currentTarget })}
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
        <path d={path} fill="none" stroke={colorVar} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {sorted.map((p) => (
          <circle key={p.t} cx={x(p.t)} cy={y(p.v)} r={hover && hover.t === p.t ? 5 : 3.5} fill={colorVar} stroke="var(--surface)" strokeWidth="2" />
        ))}
        {/* direct label on the latest point */}
        {!hover && (
          <text x={Math.min(x(last.t), W - pad.right - 4)} y={y(last.v) - 10} fontSize="12" fontWeight="600" fill="var(--ink)" textAnchor="end">
            {last.v} {unit}
          </text>
        )}
        {hover && (
          <g>
            <line x1={x(hover.t)} x2={x(hover.t)} y1={pad.top} y2={H - pad.bottom} stroke="var(--baseline)" strokeWidth="1" strokeDasharray="3 3" />
            <text x={Math.min(Math.max(x(hover.t), 60), W - 80)} y={pad.top + 2} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--ink)">
              {hover.v} {unit} · {hover.date}
            </text>
          </g>
        )}
        <line x1={pad.left} x2={W - pad.right} y1={H - pad.bottom} y2={H - pad.bottom} stroke="var(--baseline)" strokeWidth="1" />
        <text x={pad.left} y={H - 8} fontSize="11" fill="var(--muted)">{sorted[0].date}</text>
        <text x={W - pad.right} y={H - 8} fontSize="11" fill="var(--muted)" textAnchor="end">{last.date}</text>
      </svg>
    </div>
  );
}

// Weight line with the goal range shaded as a band.
export function WeightChart({ entries, band }) {
  const pts = (entries || []).map((e) => ({ date: e.date, value: e.weight_kg }));
  if (pts.length === 0) return <p className="center">No weight entries yet.</p>;
  return (
    <TrendChart pts={pts} unit="kg" colorVar="var(--series)" band={band} height={220} ariaLabel="Weight over time" />
  );
}

// Body fat % — its own panel under the weight chart, different colour,
// rendered only when the log has body-fat readings.
export function BodyFatChart({ entries }) {
  const pts = (entries || [])
    .filter((e) => e.body_fat_pct != null)
    .map((e) => ({ date: e.date, value: e.body_fat_pct }));
  if (pts.length === 0) return null;
  return (
    <TrendChart pts={pts} unit="%" colorVar="var(--series-2)" height={170} ariaLabel="Body fat percentage over time" />
  );
}

export function hasBodyFat(entries) {
  return (entries || []).some((e) => e.body_fat_pct != null);
}
