import { useRef, useState } from 'react';
import { parseMeal, parsePlateMeal } from '../lib/claude.js';
import { appendToLog, updateJson } from '../lib/github.js';
import { fileToJpegBase64 } from '../lib/image.js';
import { entryTotals, todayStr, round1, parseDecimal, dayWaterMl } from '../lib/nutrition.js';

// Edit-state items keep every editable field as a STRING so typing works
// naturally (clearing a field, "0.5", "12." are all valid intermediate
// states). Numbers are derived when needed. `base` holds per-single-serving
// values so changing servings always recomputes from the original food data
// instead of compounding rounding (and so 0 is recoverable).
function toEditItem(it) {
  const s = it.servings > 0 ? it.servings : 1;
  // null macros mean the food DB doesn't know that value: show an empty
  // field plus a warning instead of silently pretending it's 0
  const missing = [];
  const str = (v, name) => {
    if (v == null) {
      missing.push(name);
      return '';
    }
    return String(v);
  };
  return {
    food_id: it.food_id ?? null,
    name: it.name,
    quantity: it.quantity || '',
    is_estimate: Boolean(it.is_estimate),
    servingsStr: String(it.servings),
    kcalStr: str(it.kcal, 'kcal'),
    proteinStr: str(it.protein_g, 'protein'),
    fibreStr: str(it.fibre_g, 'fibre'),
    base: { kcal: (it.kcal || 0) / s, protein_g: (it.protein_g || 0) / s, fibre_g: (it.fibre_g || 0) / s },
    missing,
  };
}

const num = (str) => {
  const v = parseDecimal(str);
  return v != null && v >= 0 ? v : 0;
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

// Recent unique meals (by their set of item names) for one-tap re-logging —
// the "same as yesterday" path for meals eaten on rotation.
function recentUniqueMeals(mealLog, max = 4) {
  const seen = new Set();
  const out = [];
  for (let i = mealLog.length - 1; i >= 0 && out.length < max; i--) {
    const e = mealLog[i];
    if (!e.items?.length) continue;
    const sig = e.items.map((it) => it.name).sort().join('|');
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(e);
  }
  return out;
}

export default function LogMeal({ settings, data, onLogged, onWaterLogged }) {
  const [text, setText] = useState('');
  const [draft, setDraft] = useState(null); // { meal, items: editItems[], usedAi }
  const [manualPick, setManualPick] = useState(''); // 'f:<food id>' | 'r:<recipe id>'
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState('');
  const [savedMsg, setSavedMsg] = useState('');
  const [waterBusy, setWaterBusy] = useState(false);
  const [waterError, setWaterError] = useState('');
  const photoRef = useRef(null);

  async function handlePlatePhoto(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setPhotoBusy(true); setError(''); setSavedMsg('');
    try {
      const image = await fileToJpegBase64(file);
      const parsed = await parsePlateMeal(settings, data.foods, image, text.trim(), data.coachRules);
      setDraft({ meal: parsed.meal, items: parsed.items.map(toEditItem), usedAi: true });
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setPhotoBusy(false);
    }
  }

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

  const foodToItem = (food, servings = 1) =>
    toEditItem({
      food_id: food.id,
      name: food.name,
      quantity: servings === 1 ? food.standard_serving : `${servings} × ${food.standard_serving}`,
      servings,
      kcal: food.kcal != null ? food.kcal * servings : null,
      protein_g: food.protein_g != null ? food.protein_g * servings : null,
      fibre_g: food.fibre_g != null ? food.fibre_g * servings : null,
      is_estimate: false,
    });

  const appendToDraft = (items, meal) =>
    setDraft((d) =>
      d ? { ...d, items: [...d.items, ...items] } : { meal: meal || guessMealByTime(), items, usedAi: false },
    );

  function handleManualAdd() {
    setSavedMsg('');
    const [kind, id] = [manualPick.slice(0, 1), manualPick.slice(2)];
    if (kind === 'f') {
      const food = data.foods.find((f) => f.id === id);
      if (food) appendToDraft([foodToItem(food)]);
    } else if (kind === 'r') {
      const recipe = (data.recipes || []).find((r) => r.id === id);
      if (recipe) {
        const items = (recipe.ingredients || [])
          .map((ing) => {
            const food = data.foods.find((f) => f.id === ing.food_id);
            return food ? foodToItem(food, ing.servings || 1) : null;
          })
          .filter(Boolean);
        if (items.length) appendToDraft(items, recipe.meal);
      }
    }
    setManualPick('');
  }

  // Re-log a past entry: copy its items (values were snapshotted at log time)
  function handleRepeat(entry) {
    setSavedMsg('');
    appendToDraft(entry.items.map(toEditItem), guessMealByTime());
  }

  async function addWater(ml) {
    setWaterBusy(true); setWaterError('');
    try {
      const now = new Date();
      const entry = { id: `${now.getTime()}`, date: todayStr(now), time: now.toTimeString().slice(0, 5), ml };
      const log = await appendToLog(settings, 'data/water_log.json', entry, `Log water: ${ml} ml`);
      onWaterLogged(log);
    } catch (e) {
      setWaterError(String(e.message || e));
    } finally {
      setWaterBusy(false);
    }
  }

  async function undoWater() {
    setWaterBusy(true); setWaterError('');
    try {
      const today = todayStr();
      const log = await updateJson(settings, 'data/water_log.json', (cur) => {
        const list = Array.isArray(cur) ? [...cur] : [];
        for (let i = list.length - 1; i >= 0; i--) {
          if (list[i].date === today) { list.splice(i, 1); break; }
        }
        return list;
      }, 'Undo last water entry');
      onWaterLogged(log);
    } catch (e) {
      setWaterError(String(e.message || e));
    } finally {
      setWaterBusy(false);
    }
  }

  function updateItem(idx, patch) {
    setDraft((d) => ({
      ...d,
      items: d.items.map((it, i) => {
        if (i !== idx) return it;
        const next = { ...it, ...patch };
        if (patch.servingsStr !== undefined) {
          // Servings changed: recompute macros from per-serving base values
          const v = parseDecimal(patch.servingsStr);
          if (v != null && v >= 0) {
            next.kcalStr = String(round1(it.base.kcal * v));
            next.proteinStr = String(round1(it.base.protein_g * v));
            next.fibreStr = String(round1(it.base.fibre_g * v));
          }
        } else {
          // A macro was edited directly: update its base so future servings
          // changes scale from the corrected value, and clear its
          // missing-value warning
          const s = num(next.servingsStr) || 1;
          next.base = {
            kcal: num(next.kcalStr) / s,
            protein_g: num(next.proteinStr) / s,
            fibre_g: num(next.fibreStr) / s,
          };
          const editedField = { kcalStr: 'kcal', proteinStr: 'protein', fibreStr: 'fibre' }[Object.keys(patch)[0]];
          if (editedField && next.missing?.includes(editedField) && Object.values(patch)[0] !== '') {
            next.missing = next.missing.filter((m) => m !== editedField);
          }
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
  const waterToday = dayWaterMl(data.waterLog, todayStr());
  const waterMin = data.targets?.daily?.water_l?.min ?? null;

  return (
    <>
    <div className="card">
      <h2>Log a meal</h2>

      <label>Describe it, or photograph the plate (the text adds detail to the photo)</label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder='e.g. "2 drumsticks, a brown roll and a handful of grapes"'
      />
      <input
        ref={photoRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={handlePlatePhoto}
      />
      <button className="ghost scan-btn" disabled={busy || photoBusy}
        onClick={() => photoRef.current && photoRef.current.click()}>
        {photoBusy ? 'Looking at your plate…' : '📷 Photo of your plate'}
      </button>
      <p className="hint">
        Portions from a photo are estimates. Add anything the photo can't show
        (sauces, cooking oil, what's underneath) in the text box above; the photo
        is sent only to the Claude API, then discarded.
      </p>
      <button className="primary" disabled={busy || photoBusy || !text.trim()} onClick={handleParse}>
        {busy && !draft ? 'Analysing…' : 'AI Analysis'}
      </button>

      <label style={{ marginTop: 20 }}>Or add a recipe or food</label>
      <div className="manual-add">
        <select value={manualPick} onChange={(e) => setManualPick(e.target.value)}>
          <option value="">Choose…</option>
          {(data.recipes || []).length > 0 && (
            <optgroup label="Recipes">
              {[...data.recipes]
                .filter((r) => (r.ingredients || []).length > 0)
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((r) => (
                  <option key={r.id} value={`r:${r.id}`}>{r.name}</option>
                ))}
            </optgroup>
          )}
          <optgroup label="Foods">
            {foodsSorted.map((f) => (
              <option key={f.id} value={`f:${f.id}`}>{f.name} ({f.standard_serving})</option>
            ))}
          </optgroup>
        </select>
        <button className="ghost" disabled={!manualPick || busy} onClick={handleManualAdd}>Add</button>
      </div>

      {!draft && recentUniqueMeals(data.mealLog).length > 0 && (
        <>
          <label style={{ marginTop: 16 }}>Or repeat a recent meal</label>
          {recentUniqueMeals(data.mealLog).map((e) => (
            <button className="repeat-row" key={e.id} disabled={busy} onClick={() => handleRepeat(e)}>
              <span>
                {(e.items || []).map((i) => i.name).join(', ')}
                <span className="meta"> · {e.meal} on {e.date}</span>
              </span>
              <span className="macros">{Math.round(e.totals?.kcal || 0)} kcal</span>
            </button>
          ))}
        </>
      )}

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
                  {it.missing?.length > 0 && (
                    <span className="missing-badge">⚠ {it.missing.join(', ')} unknown</span>
                  )}
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

          {draft.items.some((it) => it.missing?.length > 0) && (
            <p className="hint">
              ⚠ Some values are unknown in your food database (empty fields count as 0
              in the totals). Fill them in here, or edit the food in the Foods tab to
              fix it permanently.
            </p>
          )}

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

    <div className="card">
      <h2>Water</h2>
      <p className="hint" style={{ marginTop: 0 }}>
        Today: <strong>{(waterToday / 1000).toFixed(2).replace(/\.?0+$/, '')} L</strong>
        {waterMin != null && <> of {waterMin} L</>}
        {waterMin != null && waterToday >= waterMin * 1000 && ' ✅'}
      </p>
      <div className="water-row">
        <button className="ghost" disabled={waterBusy} onClick={() => addWater(250)}>+ 250 ml</button>
        <button className="ghost" disabled={waterBusy} onClick={() => addWater(500)}>+ 500 ml</button>
        <button className="ghost" disabled={waterBusy || dayWaterMl(data.waterLog, todayStr()) === 0}
          onClick={undoWater}>Undo</button>
      </div>
      {waterError && <p className="error">{waterError}</p>}
    </div>
    </>
  );
}
