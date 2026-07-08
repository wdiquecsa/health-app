import { useState } from 'react';
import { appendToLog } from '../lib/github.js';
import { todayStr } from '../lib/nutrition.js';
import { WeightChart } from './charts.jsx';

export default function WeightTracker({ settings, data, onLogged }) {
  const [kg, setKg] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const band = data.goals?.long_term?.target_weight_kg || null;

  async function save() {
    setBusy(true); setError('');
    try {
      const entry = { date: todayStr(), weight_kg: parseFloat(kg) };
      const log = await appendToLog(settings, 'data/weight_log.json', entry, `Weigh-in: ${kg} kg`);
      onLogged(log);
      setKg('');
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
        <button className="primary" disabled={busy || !parseFloat(kg)} onClick={save}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        {error && <p className="error">{error}</p>}
      </div>

      <div className="card">
        <h2>Progress</h2>
        <WeightChart entries={data.weightLog} band={band} />
      </div>

      <div className="card">
        <h2>Recent</h2>
        {recent.length === 0 && <p className="center">No entries yet.</p>}
        {recent.map((e, i) => (
          <div className="entry" key={`${e.date}-${i}`}>
            <div>{e.date}</div>
            <div className="macros">{e.weight_kg} kg</div>
          </div>
        ))}
      </div>
    </>
  );
}
