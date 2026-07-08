import { MacroBar, WeightChart, BodyFatChart, hasBodyFat } from './charts.jsx';
import { dayTotals, todayStr, round1 } from '../lib/nutrition.js';

export default function Dashboard({ data }) {
  const { targets, goals, mealLog, weightLog } = data;
  const today = todayStr();
  const totals = dayTotals(mealLog, today);
  const todayEntries = mealLog.filter((e) => e.date === today);

  const t = targets?.daily || {};

  const latestWeight = weightLog.length ? weightLog[weightLog.length - 1] : null;
  const startWeight = weightLog.length ? weightLog[0] : null;
  const lost = latestWeight && startWeight ? round1(startWeight.weight_kg - latestWeight.weight_kg) : null;
  const band = goals?.long_term?.target_weight_kg || null;

  return (
    <>
      <div className="card">
        <h2>Today</h2>
        {t.kcal && <MacroBar label="Calories" value={totals.kcal} unit="kcal" target={t.kcal} />}
        {t.protein_g && <MacroBar label="Protein" value={totals.protein_g} unit="g" target={t.protein_g} />}
        {t.fibre_g && <MacroBar label="Fibre" value={totals.fibre_g} unit="g" target={t.fibre_g} />}
      </div>

      <div className="stat-tiles">
        <div className="stat-tile">
          <div className="label">Current weight</div>
          <div className="big">{latestWeight ? `${latestWeight.weight_kg} kg` : '—'}</div>
          {lost != null && lost !== 0 && (
            <div className={`sub ${lost > 0 ? 'delta-good' : ''}`}>
              {lost > 0 ? `↓ ${lost} kg since start` : `↑ ${-lost} kg since start`}
            </div>
          )}
        </div>
        <div className="stat-tile">
          <div className="label">Goal</div>
          <div className="big">{band ? `${band.min}–${band.max} kg` : '—'}</div>
          {latestWeight && band && (
            <div className="sub">{round1(latestWeight.weight_kg - band.max)} kg to go</div>
          )}
        </div>
      </div>

      <div className="card">
        <h2>Weight</h2>
        <WeightChart entries={weightLog} band={band} />
        {hasBodyFat(weightLog) && (
          <>
            <h2 style={{ marginTop: 16 }}>Body fat</h2>
            <BodyFatChart entries={weightLog} />
          </>
        )}
      </div>

      <div className="card">
        <h2>Today's meals</h2>
        {todayEntries.length === 0 && <p className="center">Nothing logged yet today.</p>}
        {todayEntries.map((e) => (
          <div className="entry" key={e.id}>
            <div>
              <div>{e.meal} <span className="meta">{e.time}</span></div>
              <div className="meta">{(e.items || []).map((i) => i.name).join(', ')}</div>
            </div>
            <div className="macros">
              {Math.round(e.totals.kcal)} kcal · {round1(e.totals.protein_g)}p · {round1(e.totals.fibre_g)}f
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
