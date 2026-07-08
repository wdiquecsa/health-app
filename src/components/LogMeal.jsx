import { useState } from 'react';
import { parseMeal } from '../lib/claude.js';
import { appendToLog } from '../lib/github.js';
import { entryTotals, todayStr, round1 } from '../lib/nutrition.js';

// Edit-state items keep every editable field as a STRING so typing works
// naturally (clearing a field, "0.5", "12." are all valid intermediate
// states). Numbers are derived when needed. `base` holds per-single-serving
// values so changing servings always recomputes from the original food data
// instead of compounding rounding (and so 0 is recoverable).
function toEditItem(it) {
  const s = it.servings > 0 ? it.servings : 1;
  return {
    food_id: it.food_id ?? null,
    name: it.name,
    quantity: it.quantity || '',
    is_estimate: Boolean(it.is_estimate),
    servingsStr: String(it.servings),
    kcalStr: String(it.kcal),
    proteinStr: String(it.protein_g),
    fibreStr: String(it.fibre_g),
    base: { kcal: it.kcal / s, protein_g: it.protein_g / s, fibre_g: it.fibre_g / s },
  };
}

const num = (str) => {
  const v = parseFloat(str);
  return Number.isFinite(v) && v >= 0 ? v : 0;
};

function draftTotals(items) {
  return entryTotals(
    items.map((it) => ({ kcal: num(it.kcalStr), protein_g: num(it.proteinStr), fibre_g: num(it.fibreStr) })),
  );
}

function guessMealByTime() {
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 21) return 'dinner';
  return 'snack';
}

export default function LogMeal({ settings, data, onLogged }) {
  const [text, setText] = useState('');
  const [draft, setDraft] = useState(null); // { meal, items: editItems[], usedAi }
  const [manualFoodId, setManualFoodId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [savedMsg, setSavedMsg] = useState('');

  const foodsSorted = [...data.foods].sort((a, b) => a.name.localeCompare(b.name));

  async function handleParse() {
    setBusy(true); setError(''); setSavedMsg('');
    try {
      const parsed = await parseMeal(settings, data.foods, text, data.coachRules);
      setDraft({ meal: parsed.meal, items: parsed.items.map(toEditItem), usedAi: true });
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  function handleManualAdd() {
    const food = data.foods.find((f) => f.id === manualFoodId);
    if (!food) return;
    setSavedMsg('');
    const item = toEditItem({
      food_id: food.id,
      name: food.name,
      quantity: food.standard_serving,
      servings: 1,
      kcal: food.kcal || 0,
      protein_g: food.protein_g || 0,
      fibre_g: food.fibre_g || 0,
      is_estimate: false,
    });
    setDraft((d) =>
      d
        ? { ...d, items: [...d.items, item] }
        : { meal: guessMealByTime(), items: [item], usedAi: false },
    );
    setManualFoodId('');
  }

  function updateItem(idx, patch) {
    setDraft((d) => ({
      ...d,
      items: d.items.map((it, i) => {
        if (i !== idx) return it;
        const next = { ...it, ...patch };
        if (patch.servingsStr !== undefined) {
          // Servings changed: recompute macros from per-serving base values
          const v = parseFloat(patch.servingsStr);
          if (Number.isFinite(v) && v >= 0) {
            next.kcalStr = String(round1(it.base.kcal * v));
            next.proteinStr = String(round1(it.base.protein_g * v));
            next.fibreStr = String(round1(it.base.fibre_g * v));
          }
        } else {
          // A macro was edited directly: update its base so future servings
          // changes scale from the corrected value
          const s = num(next.servingsStr) || 1;
          next.base = {
            kcal: num(next.kcalStr) / s,
            protein_g: num(next.proteinStr) / s,
            fibre_g: num(next.fibreStr) / s,
          };
        }
        return next;
      }),
    }));
  }

  function removeItem(idx) {
    setDraft((d) => {
      const items = d.items.filter((_, i) => i !== idx);
      return items.length ? { ...d, items } : null;
    });
  }

  function handleCancel() {
    setDraft(null);
    setError('');
  }

  async function handleSave() {
    setBusy(true); setError('');
    try {
      const now = new Date();
      const items = draft.items.map((it) => ({
        food_id: it.food_id,
        name: it.name,
        quantity: it.quantity,
        servings: num(it.servingsStr),
        kcal: round1(num(it.kcalStr)),
        protein_g: round1(num(it.proteinStr)),
        fibre_g: round1(num(it.fibreStr)),
        is_estimate: it.is_estimate,
      }));
      const totals = entryTotals(items);
      const entry = {
        id: `${now.getTime()}`,
        date: todayStr(now),
        time: now.toTimeString().slice(0, 5),
        meal: draft.meal,
        text: draft.usedAi ? text : '',
        items,
        totals,
        source: draft.usedAi ? 'ai' : 'manual',
      };
      await appendToLog(
        settings, 'data/meal_log.json', entry,
        `Log ${draft.meal}: ${Math.round(totals.kcal)} kcal, ${round1(totals.protein_g)}g protein`,
      ).then(onLogged);
      setDraft(null); setText('');
      setSavedMsg(`Saved: ${Math.round(totals.kcal)} kcal, ${round1(totals.protein_g)}g protein, ${round1(totals.fibre_g)}g fibre.`);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  const totals = draft ? draftTotals(draft.items) : null;

  return (
    <div className="card">
      <h2>Log a meal</h2>

      <label>Describe it and let the AI work it out</label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder='e.g. "2 drumsticks, a brown roll and a handful of grapes"'
      />
      <button className="primary" disabled={busy || !text.trim()} onClick={handleParse}>
        {busy && !draft ? 'Analysing…' : 'Analyse with AI'}
      </button>

      <label style={{ marginTop: 18 }}>Or add from your food database</label>
      <div className="manual-add">
        <select value={manualFoodId} onChange={(e) => setManualFoodId(e.target.value)}>
          <option value="">Choose a food…</option>
          {foodsSorted.map((f) => (
            <option key={f.id} value={f.id}>{f.name} ({f.standard_serving})</option>
          ))}
        </select>
        <button className="ghost" disabled={!manualFoodId || busy} onClick={handleManualAdd}>Add</button>
      </div>

      {draft && (
        <>
          <label style={{ marginTop: 18 }}>Meal</label>
          <select value={draft.meal} onChange={(e) => setDraft({ ...draft, meal: e.target.value })}>
            <option value="breakfast">breakfast</option>
            <option value="lunch">lunch</option>
            <option value="dinner">dinner</option>
            <option value="snack">snack</option>
          </select>

          {draft.items.map((it, i) => (
            <div className="draft-item" key={i}>
              <div className="draft-item-head">
                <div>
                  {it.name}
                  {it.is_estimate && <span className="estimate-badge">estimate</span>}
                  <span className="meta"> {it.quantity}</span>
                </div>
                <button className="entry-x" aria-label={`Remove ${it.name}`} onClick={() => removeItem(i)}>✕</button>
              </div>
              <div className="macro-edit-grid">
                <div>
                  <span>Serv.</span>
                  <input type="text" inputMode="decimal" value={it.servingsStr}
                    onChange={(e) => updateItem(i, { servingsStr: e.target.value })} />
                </div>
                <div>
                  <span>kcal</span>
                  <input type="text" inputMode="decimal" value={it.kcalStr}
                    onChange={(e) => updateItem(i, { kcalStr: e.target.value })} />
                </div>
                <div>
                  <span>Prot. g</span>
                  <input type="text" inputMode="decimal" value={it.proteinStr}
                    onChange={(e) => updateItem(i, { proteinStr: e.target.value })} />
                </div>
                <div>
                  <span>Fibre g</span>
                  <input type="text" inputMode="decimal" value={it.fibreStr}
                    onChange={(e) => updateItem(i, { fibreStr: e.target.value })} />
                </div>
              </div>
            </div>
          ))}

          <p className="hint">
            Total: <strong>{Math.round(totals.kcal)} kcal, {round1(totals.protein_g)}g protein, {round1(totals.fibre_g)}g fibre</strong>
          </p>
          <button className="primary" disabled={busy || draft.items.length === 0} onClick={handleSave}>
            {busy ? 'Saving…' : 'Save to log'}
          </button>
          <button className="ghost block" disabled={busy} onClick={handleCancel}>Cancel</button>
        </>
      )}

      {savedMsg && <p className="hint delta-good">{savedMsg}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
