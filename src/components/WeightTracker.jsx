import { useState } from 'react';
import { appendToLog } from '../lib/github.js';
import { todayStr, aggregateWeighIns } from '../lib/nutrition.js';
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
      const entry = { date: todayStr(), weight_kg: parseFloat(kg) };
      if (parseFloat(bf)) entry.body_fat_pct = parseFloat(bf);
      if (parseFloat(waist)) entry.waist_cm = parseFloat(waist);
      const log = await appendToLog(settings, 'data/weight_log.json', entry, `Weigh-in: ${kg} kg`);
      onLogged(log);
      setKg(''); setBf(''); setWaist('');
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  const recent = [...data.weightLog].slice(-8).reverse();

  return (
    <>
      <div className="card">
        <h2>Add measurement</h2>
        <label>Weight (kg)</label>
        <input type="number" step="0.1" inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} placeholder="e.g. 91.4" />
        <label>Body fat % (optional)</label>
        <input type="number" step="0.1" inputMode="decimal" value={bf} onChange={(e) => setBf(e.target.value)} placeholder="e.g. 28.9" />
        <label>Waist (cm, optional)</label>
        <input type="number" step="0.5" inputMode="decimal" value={waist} onChange={(e) => setWaist(e.target.value)} placeholder="e.g. 98" />
        <button className="primary" disabled={busy || !parseFloat(kg)} onClick={save}>
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
              {e.weight_kg} kg
              {e.body_fat_pct != null ? ` · ${e.body_fat_pct}%` : ''}
              {e.waist_cm != null ? ` · ${e.waist_cm} cm` : ''}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
