import { useState } from 'react';
import { appendToLog } from '../lib/github.js';
import { todayStr } from '../lib/nutrition.js';
import { WeightChart, BodyFatChart, hasBodyFat } from './charts.jsx';

export default function WeightTracker({ settings, data, onLogged }) {
  const [kg, setKg] = useState('');
  const [bf, setBf] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const band = data.goals?.long_term?.target_weight_kg || null;

  async function save() {
    setBusy(true); setError('');
    try {
      const entry = { date: todayStr(), weight_kg: parseFloat(kg) };
      if (parseFloat(bf)) entry.body_fat_pct = parseFloat(bf);
      const log = await appendToLog(settings, 'data/weight_log.json', entry, `Weigh-in: ${kg} kg`);
      onLogged(log);
      setKg(''); setBf('');
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
        <h2>Add weigh-in</h2>
        <label>Weight (kg)</label>
        <input type="number" step="0.1" inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} placeholder="e.g. 91.4" />
        <label>Body fat % (optional)</label>
        <input type="number" step="0.1" inputMode="decimal" value={bf} onChange={(e) => setBf(e.target.value)} placeholder="e.g. 28.9" />
        <button className="primary" disabled={busy || !parseFloat(kg)} onClick={save}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        {error && <p className="error">{error}</p>}
      </div>

      <div className="card">
        <h2>Progress</h2>
        <WeightChart entries={data.weightLog} band={band} />
        {hasBodyFat(data.weightLog) && (
          <>
            <h2 style={{ marginTop: 16 }}>Body fat</h2>
            <BodyFatChart entries={data.weightLog} />
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
              {e.weight_kg} kg{e.body_fat_pct != null ? ` · ${e.body_fat_pct}%` : ''}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
