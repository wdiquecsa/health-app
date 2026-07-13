import { useState } from 'react';
import { appendToLog, updateJson } from '../lib/github.js';
import { todayStr, aggregateWeighIns, parseDecimal } from '../lib/nutrition.js';
import { WeightChart, BodyFatChart, WaistChart, hasBodyFat, hasWaist, RangeToggle } from './charts.jsx';

export default function WeightTracker({ settings, data, onLogged }) {
  const [kg, setKg] = useState('');
  const [bf, setBf] = useState('');
  const [waist, setWaist] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [chartMode, setChartMode] = useState('day');
  const band = data.goals?.long_term?.target_weight_kg || null;
  const chartEntries = aggregateWeighIns(data.weightLog, chartMode);

  async function save() {
    setBusy(true); setError('');
    try {
      const w = parseDecimal(kg);
      const entry = { date: todayStr(), weight_kg: w };
      if (parseDecimal(bf)) entry.body_fat_pct = parseDecimal(bf);
      if (parseDecimal(waist)) entry.waist_cm = parseDecimal(waist);
      const log = await appendToLog(settings, 'data/weight_log.json', entry, `Weigh-in: ${w} kg`);
      onLogged(log);
      setKg(''); setBf(''); setWaist('');
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  const recent = [...data.weightLog].slice(-8).reverse();

  // Old entries have no id, so remove by content: the last entry matching
  // every field of the tapped row (safe — the app writes one entry per
  // weigh-in, and matching all metrics makes collisions near-impossible)
  async function removeEntry(entry) {
    const parts = [
      entry.weight_kg != null ? `${entry.weight_kg} kg` : null,
      entry.body_fat_pct != null ? `${entry.body_fat_pct}%` : null,
      entry.waist_cm != null ? `${entry.waist_cm} cm` : null,
    ].filter(Boolean).join(', ');
    if (!window.confirm(`Remove the ${entry.date} entry (${parts})? You can re-add it afterwards.`)) return;
    setBusy(true); setError('');
    try {
      const same = (a, b) =>
        a.date === b.date && a.weight_kg === b.weight_kg &&
        a.body_fat_pct === b.body_fat_pct && a.waist_cm === b.waist_cm;
      const log = await updateJson(settings, 'data/weight_log.json', (cur) => {
        const list = Array.isArray(cur) ? [...cur] : [];
        for (let i = list.length - 1; i >= 0; i--) {
          if (same(list[i], entry)) { list.splice(i, 1); break; }
        }
        return list;
      }, `Remove weigh-in: ${entry.date}`);
      onLogged(log);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="card">
        <h2>Add measurement</h2>
        <label>Weight (kg)</label>
        <input type="text" inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} placeholder="e.g. 91.4" />
        <label>Body fat % (optional)</label>
        <input type="text" inputMode="decimal" value={bf} onChange={(e) => setBf(e.target.value)} placeholder="e.g. 28.9" />
        <label>Waist (cm, optional)</label>
        <input type="text" inputMode="decimal" value={waist} onChange={(e) => setWaist(e.target.value)} placeholder="e.g. 98" />
        <button className="primary" disabled={busy || !parseDecimal(kg)} onClick={save}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        {error && <p className="error">{error}</p>}
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Progress</h2>
          <RangeToggle mode={chartMode} setMode={setChartMode} />
        </div>
        <WeightChart entries={chartEntries} band={band} />
        {hasBodyFat(chartEntries) && (
          <>
            <h2 style={{ marginTop: 16 }}>Body fat</h2>
            <BodyFatChart entries={chartEntries} />
          </>
        )}
        {hasWaist(chartEntries) && (
          <>
            <h2 style={{ marginTop: 16 }}>Waist</h2>
            <WaistChart entries={chartEntries} />
          </>
        )}
      </div>

      <div className="card">
        <h2>Recent</h2>
        {recent.length === 0 && <p className="center">No entries yet.</p>}
        {recent.map((e, i) => (
          <div className="entry" key={`${e.date}-${i}`}>
            <div>{e.date}</div>
            <div className="macros">
              {[
                e.weight_kg != null ? `${e.weight_kg} kg` : null,
                e.body_fat_pct != null ? `${e.body_fat_pct}%` : null,
                e.waist_cm != null ? `${e.waist_cm} cm` : null,
              ].filter(Boolean).join(' · ')}
            </div>
            <button className="entry-x" aria-label={`Remove ${e.date} entry`} disabled={busy}
              onClick={() => removeEntry(e)}>✕</button>
          </div>
        ))}
        {error && recent.length > 0 && <p className="error">{error}</p>}
      </div>
    </>
  );
}
