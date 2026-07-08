import { useState } from 'react';
import { parseMeal } from '../lib/claude.js';
import { appendToLog } from '../lib/github.js';
import { entryTotals, todayStr, round1 } from '../lib/nutrition.js';

export default function LogMeal({ settings, data, onLogged }) {
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [savedMsg, setSavedMsg] = useState('');

  async function handleParse() {
    setBusy(true); setError(''); setSavedMsg('');
    try {
      setParsed(await parseMeal(settings, data.foods, text, data.coachRules));
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function handleSave() {
    setBusy(true); setError('');
    try {
      const now = new Date();
      const totals = entryTotals(parsed.items);
      const entry = {
        id: `${now.getTime()}`,
        date: todayStr(now),
        time: now.toTimeString().slice(0, 5),
        meal: parsed.meal,
        text,
        items: parsed.items,
        totals,
        source: 'ai',
      };
      const log = await appendToLog(
        settings, 'data/meal_log.json', entry,
        `Log ${parsed.meal}: ${Math.round(totals.kcal)} kcal, ${round1(totals.protein_g)}g protein`,
      );
      onLogged(log);
      setParsed(null); setText('');
      setSavedMsg(`Saved — ${Math.round(totals.kcal)} kcal, ${round1(totals.protein_g)}g protein, ${round1(totals.fibre_g)}g fibre.`);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  function updateServings(idx, servings) {
    const items = parsed.items.map((it, i) => {
      if (i !== idx) return it;
      const factor = it.servings > 0 ? servings / it.servings : 0;
      return {
        ...it,
        servings,
        kcal: round1(it.kcal * factor),
        protein_g: round1(it.protein_g * factor),
        fibre_g: round1(it.fibre_g * factor),
      };
    });
    setParsed({ ...parsed, items });
  }

  const totals = parsed ? entryTotals(parsed.items) : null;

  return (
    <div className="card">
      <h2>Log a meal</h2>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder='e.g. "2 drumsticks, a brown roll and a handful of grapes"'
      />
      <button className="primary" disabled={busy || !text.trim()} onClick={handleParse}>
        {busy && !parsed ? 'Analysing…' : 'Analyse with AI'}
      </button>

      {parsed && (
        <>
          <label style={{ marginTop: 18 }}>Meal</label>
          <select value={parsed.meal} onChange={(e) => setParsed({ ...parsed, meal: e.target.value })}>
            <option value="breakfast">breakfast</option>
            <option value="lunch">lunch</option>
            <option value="dinner">dinner</option>
            <option value="snack">snack</option>
          </select>

          {parsed.items.map((it, i) => (
            <div className="item-edit" key={i}>
              <div>
                <div>
                  {it.name}
                  {it.is_estimate && <span className="estimate-badge">estimate</span>}
                </div>
                <div className="detail">
                  {it.quantity} · {Math.round(it.kcal)} kcal · {round1(it.protein_g)}g protein · {round1(it.fibre_g)}g fibre
                </div>
              </div>
              <input
                type="number"
                step="0.25"
                min="0"
                value={it.servings}
                onChange={(e) => updateServings(i, parseFloat(e.target.value) || 0)}
                aria-label={`Servings of ${it.name}`}
              />
            </div>
          ))}

          <p className="hint">
            Total: <strong>{Math.round(totals.kcal)} kcal · {round1(totals.protein_g)}g protein · {round1(totals.fibre_g)}g fibre</strong>
          </p>
          <button className="primary" disabled={busy} onClick={handleSave}>
            {busy ? 'Saving…' : 'Save to log'}
          </button>
        </>
      )}

      {savedMsg && <p className="hint delta-good">{savedMsg}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
