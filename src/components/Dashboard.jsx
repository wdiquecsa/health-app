import { useState } from 'react';
import {
  MacroBar, WeightChart, BodyFatChart, WaistChart, MacroBarsChart,
  hasBodyFat, hasWaist, RangeToggle,
} from './charts.jsx';
import {
  dayTotals, todayStr, round1, paceStats, aggregateWeighIns,
  adherenceStats, macroHistory, dayWaterMl, waterHistory,
} from '../lib/nutrition.js';
import { updateJson } from '../lib/github.js';

function DayNav({ dayOffset, setDayOffset }) {
  return (
    <div className="day-nav">
      <button aria-label="Previous day" onClick={() => setDayOffset(dayOffset + 1)}>‹</button>
      <button aria-label="Next day" disabled={dayOffset === 0} onClick={() => setDayOffset(dayOffset - 1)}>›</button>
    </div>
  );
}

export default function Dashboard({ settings, data, onMealLogChanged, onGoToSettings }) {
  const { targets, goals, mealLog, weightLog } = data;
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [dayOffset, setDayOffset] = useState(0); // 0 = today, 1 = yesterday, …
  const [chartMode, setChartMode] = useState('day');
  const chartEntries = aggregateWeighIns(weightLog, chartMode);

  const selectedDate = todayStr(new Date(Date.now() - dayOffset * 86400000));
  const dayLabel =
    dayOffset === 0
      ? 'Today'
      : dayOffset === 1
        ? 'Yesterday'
        : new Date(selectedDate).toLocaleDateString('en-GB', {
            weekday: 'short', day: 'numeric', month: 'short',
          });
  const totals = dayTotals(mealLog, selectedDate);
  const dayEntries = mealLog.filter((e) => e.date === selectedDate);

  const t = targets?.daily || {};

  // Entries can be waist-only; the weight tiles want actual weigh-ins
  const weighed = weightLog.filter((e) => e.weight_kg != null);
  const latestWeight = weighed.length ? weighed[weighed.length - 1] : null;
  const startWeight = weighed.length ? weighed[0] : null;
  const lost = latestWeight && startWeight ? round1(startWeight.weight_kg - latestWeight.weight_kg) : null;
  const band = goals?.long_term?.target_weight_kg || null;
  const pace = paceStats(weightLog, goals);
  const adherence = adherenceStats(mealLog, targets);
  const history = macroHistory(mealLog, 14);

  async function removeMeal(e) {
    const kcal = Math.round(e.totals?.kcal || 0);
    if (!window.confirm(`Remove this ${e.meal} (${kcal} kcal) from today's log?`)) return;
    setBusyId(e.id); setError('');
    try {
      const log = await updateJson(
        settings, 'data/meal_log.json',
        (cur) => (Array.isArray(cur) ? cur.filter((x) => x.id !== e.id) : []),
        `Remove ${e.meal} entry: ${kcal} kcal`,
      );
      onMealLogChanged(log);
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setBusyId(null);
    }
  }

  let paceTile = null;
  if (pace && !pace.deadlinePassed) {
    const weeksLeft = Math.round((pace.daysLeft / 7) * 10) / 10;
    if (pace.remaining <= 0) {
      paceTile = { big: 'In goal range 🎉', cls: 'delta-good', sub: `${weeksLeft} weeks to the deadline` };
    } else if (pace.requiredPerWeek != null && pace.lossPerWeek != null) {
      const onPace = pace.lossPerWeek >= pace.requiredPerWeek * 0.9;
      paceTile = {
        big: onPace ? 'On pace ✅' : 'Behind pace',
        cls: onPace ? 'delta-good' : 'behind',
        sub: `losing ${pace.lossPerWeek} kg/wk · need ${pace.requiredPerWeek} kg/wk · ${weeksLeft} wks left`,
      };
    } else if (pace.requiredPerWeek != null) {
      paceTile = {
        big: `${pace.requiredPerWeek} kg/wk needed`, cls: '',
        sub: `${pace.remaining} kg in ${weeksLeft} weeks. Log a few more weigh-ins to see your trend.`,
      };
    }
  }

  return (
    <>
      {pace && pace.deadlinePassed && !pace.inRange && (
        <button className="notice-banner" onClick={onGoToSettings}>
          ⏰ Your goal deadline ({pace.deadline}) has passed and you're outside the target
          range. Tap to review your targets and goals.
        </button>
      )}

      {/* One shared day selection: the arrows on either card move both */}
      <div className="card">
        <div className="card-head">
          <h2>{dayLabel}</h2>
          <DayNav dayOffset={dayOffset} setDayOffset={setDayOffset} />
        </div>
        {t.kcal && <MacroBar label="Calories" value={totals.kcal} unit="kcal" target={t.kcal} />}
        {t.protein_g && <MacroBar label="Protein" value={totals.protein_g} unit="g" target={t.protein_g} overOk />}
        {t.fibre_g && <MacroBar label="Fibre" value={totals.fibre_g} unit="g" target={t.fibre_g} overOk />}
        {t.water_l?.min != null && (
          <MacroBar label="Water" value={dayWaterMl(data.waterLog, selectedDate) / 1000} unit="L"
            target={{ value: t.water_l.min }} overOk />
        )}
      </div>

      <div className="stat-tiles">
        <div className="stat-tile">
          <div className="label">Current weight</div>
          <div className="big">{latestWeight ? `${latestWeight.weight_kg} kg` : '-'}</div>
          {lost != null && lost !== 0 && (
            <div className={`sub ${lost > 0 ? 'delta-good' : ''}`}>
              {lost > 0 ? `↓ ${lost} kg since start` : `↑ ${-lost} kg since start`}
            </div>
          )}
        </div>
        <div className="stat-tile">
          <div className="label">Goal</div>
          <div className="big">{band ? `${band.min}-${band.max} kg` : '-'}</div>
          {latestWeight && band && (
            // Distance to the nearer (upper) edge of the goal range
            <div className="sub">{round1(latestWeight.weight_kg - band.max)} kg to go</div>
          )}
        </div>
        {paceTile && (
          <div className="stat-tile wide">
            <div className="label">Pace to deadline</div>
            <div className={`big ${paceTile.cls}`}>{paceTile.big}</div>
            <div className="sub">{paceTile.sub}</div>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Consistency</h2>
        <div className="adherence-row">
          <div>
            <div className="big-num">{adherence.streak}</div>
            <div className="sub-label">day logging streak</div>
          </div>
          <div>
            <div className="big-num">{adherence.proteinHit}/{adherence.logged}</div>
            <div className="sub-label">protein target hit</div>
          </div>
          <div>
            <div className="big-num">{adherence.kcalHit}/{adherence.logged}</div>
            <div className="sub-label">calories on target</div>
          </div>
          <div>
            <div className="big-num">{adherence.fibreHit}/{adherence.logged}</div>
            <div className="sub-label">fibre target hit</div>
          </div>
        </div>
        <p className="hint" style={{ marginTop: 10 }}>
          Targets judged over logged days in the last {adherence.n} (today excluded).
        </p>
      </div>

      <div className="card">
        <h2>Last 14 days</h2>
        {t.kcal?.value != null && (
          <>
            <div className="sub-label" style={{ marginBottom: 4 }}>Calories per day</div>
            <MacroBarsChart data={history} field="kcal" unit="kcal"
              target={{ value: t.kcal.value }} ariaLabel="Daily calories, last 14 days" />
          </>
        )}
        {t.protein_g?.min != null && (
          <>
            <div className="sub-label" style={{ margin: '12px 0 4px' }}>Protein per day (g)</div>
            <MacroBarsChart data={history} field="protein_g" unit="g protein"
              target={{ min: t.protein_g.min, max: t.protein_g.max }} successMin={t.protein_g.min}
              ariaLabel="Daily protein, last 14 days" />
          </>
        )}
        {t.fibre_g?.min != null && (
          <>
            <div className="sub-label" style={{ margin: '12px 0 4px' }}>Fibre per day (g)</div>
            <MacroBarsChart data={history} field="fibre_g" unit="g fibre"
              target={{ min: t.fibre_g.min, max: t.fibre_g.max }} successMin={t.fibre_g.min}
              ariaLabel="Daily fibre, last 14 days" />
          </>
        )}
        {t.water_l?.min != null && (
          <>
            <div className="sub-label" style={{ margin: '12px 0 4px' }}>Water per day (L)</div>
            <MacroBarsChart data={waterHistory(data.waterLog, 14)} field="water_l" unit="L"
              target={{ value: t.water_l.min }} successMin={t.water_l.min}
              ariaLabel="Daily water, last 14 days" />
          </>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Weight</h2>
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
        <div className="card-head">
          <h2>
            {dayOffset === 0 ? "Today's meals" : dayOffset === 1 ? "Yesterday's meals" : `Meals on ${dayLabel}`}
          </h2>
          <DayNav dayOffset={dayOffset} setDayOffset={setDayOffset} />
        </div>
        {dayEntries.length === 0 && (
          <p className="center">{dayOffset === 0 ? 'Nothing logged yet today.' : 'Nothing logged on this day.'}</p>
        )}
        {dayEntries.map((e) => (
          <div className="entry" key={e.id}>
            <div>
              <div>{e.meal} <span className="meta">{e.time}</span></div>
              <div className="meta">{(e.items || []).map((i) => i.name).join(', ')}</div>
            </div>
            <div className="macros">
              {Math.round(e.totals.kcal)} kcal · {round1(e.totals.protein_g)}p · {round1(e.totals.fibre_g)}f
            </div>
            <button
              className="entry-x"
              aria-label={`Remove ${e.meal}`}
              disabled={busyId === e.id}
              onClick={() => removeMeal(e)}
            >
              ✕
            </button>
          </div>
        ))}
        {error && <p className="error">{error}</p>}
      </div>
    </>
  );
}
