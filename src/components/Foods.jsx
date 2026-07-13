import { useRef, useState } from 'react';
import { round1, parseDecimal, recipeTotals } from '../lib/nutrition.js';
import { mutateFoods, mutateRecipes } from '../lib/github.js';
import { readNutritionLabel } from '../lib/claude.js';
import { fileToJpegBase64 } from '../lib/image.js';

const NUM_FIELDS = [
  ['serving_g_ml', 'Serving g/ml'],
  ['kcal', 'kcal'],
  ['protein_g', 'Protein (g)'],
  ['fibre_g', 'Fibre (g)'],
  ['carbs_g', 'Carbs (g)'],
  ['sugars_g', 'Sugars (g)'],
  ['fat_g', 'Fat (g)'],
  ['sat_fat_g', 'Sat fat (g)'],
  ['salt_g', 'Salt (g)'],
];

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function uniqueId(name, foods) {
  const base = slugify(name) || 'food';
  let id = base;
  for (let n = 2; foods.some((f) => f.id === id); n++) id = `${base}-${n}`;
  return id;
}

function FoodForm({ initial, busy, onSave, onCancel }) {
  const [f, setF] = useState(() => {
    const src = initial || {};
    const form = {
      name: src.name || '',
      category: src.category || '',
      label_basis: src.label_basis || '',
      standard_serving: src.standard_serving || '',
      source_note: src.source_note || '',
    };
    for (const [key] of NUM_FIELDS) form[key] = src[key] ?? '';
    return form;
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  function submit() {
    const food = {
      name: f.name.trim(),
      category: f.category.trim(),
      label_basis: f.label_basis.trim() || null,
      standard_serving: f.standard_serving.trim(),
      source_note: f.source_note.trim() || null,
    };
    // Empty numeric input means unknown → null (never 0); parseDecimal also
    // accepts a comma as the decimal separator (iOS keypad in NL locale)
    for (const [key] of NUM_FIELDS) {
      food[key] = parseDecimal(f[key]);
    }
    onSave(food);
  }

  return (
    <div style={{ marginTop: 10 }}>
      <label>Name</label>
      <input value={f.name} onChange={set('name')} placeholder="e.g. Chicken breast" />
      <label>Category</label>
      <input value={f.category} onChange={set('category')} placeholder="e.g. Meat, Dairy, Fruit" />
      <label>Standard serving</label>
      <input value={f.standard_serving} onChange={set('standard_serving')} placeholder='e.g. "1 fillet (~150g)"' />
      <label>Label basis</label>
      <input value={f.label_basis} onChange={set('label_basis')} placeholder='e.g. "100g label"' />
      <div className="num-grid">
        {NUM_FIELDS.map(([key, label]) => (
          <div key={key}>
            <label>{label}</label>
            <input type="text" inputMode="decimal" value={f[key]} onChange={set(key)} />
          </div>
        ))}
      </div>
      <label>Source / note</label>
      <input value={f.source_note} onChange={set('source_note')} placeholder='e.g. "Label" or "Reference estimate"' />
      <p className="hint">
        Nutrition values are per standard serving. Leave a field empty if it's not on
        the label. Empty means unknown, not zero.
      </p>
      <button className="primary" disabled={busy || !f.name.trim() || !f.standard_serving.trim()} onClick={submit}>
        {busy ? 'Saving…' : 'Save food'}
      </button>
      <button className="ghost" style={{ width: '100%', marginTop: 8 }} onClick={onCancel} disabled={busy}>
        Cancel
      </button>
    </div>
  );
}

// Recipes store ingredient refs + servings only; totals are computed live
// from foods.json (single source of truth for nutrition).
function RecipeForm({ initial, foods, busy, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name || '');
  const [meal, setMeal] = useState(initial?.meal || 'dinner');
  const [rows, setRows] = useState(() =>
    (initial?.ingredients || []).map((ing) => ({ food_id: ing.food_id, servingsStr: String(ing.servings ?? 1) })),
  );
  const foodsSorted = [...foods].sort((a, b) => a.name.localeCompare(b.name));

  const setRow = (i, patch) => setRows(rows.map((r, x) => (x === i ? { ...r, ...patch } : r)));
  const ingredients = rows
    .filter((r) => r.food_id)
    .map((r) => ({ food_id: r.food_id, servings: parseDecimal(r.servingsStr) ?? 1 }));
  const totals = recipeTotals({ ingredients }, foods);

  return (
    <div style={{ marginTop: 10 }}>
      <label>Recipe name</label>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Drumsticks, lentils & veg" />
      <label>Usual meal</label>
      <select value={meal} onChange={(e) => setMeal(e.target.value)}>
        <option value="breakfast">breakfast</option>
        <option value="lunch">lunch</option>
        <option value="dinner">dinner</option>
        <option value="snack">snack</option>
      </select>

      <label>Ingredients (servings of each food's standard serving)</label>
      {rows.map((r, i) => (
        <div className="ing-row" key={i}>
          <select value={r.food_id || ''} onChange={(e) => setRow(i, { food_id: e.target.value })}>
            <option value="">Choose a food…</option>
            {foodsSorted.map((f) => (
              <option key={f.id} value={f.id}>{f.name} ({f.standard_serving})</option>
            ))}
          </select>
          <input type="text" inputMode="decimal" value={r.servingsStr} aria-label="Servings"
            onChange={(e) => setRow(i, { servingsStr: e.target.value })} />
          <button className="entry-x" aria-label="Remove ingredient"
            onClick={() => setRows(rows.filter((_, x) => x !== i))}>✕</button>
        </div>
      ))}
      <button className="ghost" style={{ marginTop: 8 }}
        onClick={() => setRows([...rows, { food_id: '', servingsStr: '1' }])}>
        + Add ingredient
      </button>

      {ingredients.length > 0 && (
        <p className="hint">
          Per portion: <strong>{Math.round(totals.kcal)} kcal, {round1(totals.protein_g)}g protein, {round1(totals.fibre_g)}g fibre</strong>
          {totals.hasUnknown && ' (some ingredient values unknown — not counted)'}
        </p>
      )}

      <button className="primary" disabled={busy || !name.trim() || ingredients.length === 0}
        onClick={() => onSave({ name: name.trim(), meal, ingredients })}>
        {busy ? 'Saving…' : 'Save recipe'}
      </button>
      <button className="ghost" style={{ width: '100%', marginTop: 8 }} onClick={onCancel} disabled={busy}>
        Cancel
      </button>
    </div>
  );
}

export default function Foods({ settings, data, onChanged, onRecipesChanged }) {
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null); // 'new' | food id
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanned, setScanned] = useState(null);
  const [scanKey, setScanKey] = useState(0);
  const [editingRecipe, setEditingRecipe] = useState(null); // 'new' | recipe id
  const [recipeError, setRecipeError] = useState('');

  async function commitRecipes(fn, message) {
    setBusy(true); setRecipeError('');
    try {
      const recipes = await mutateRecipes(settings, fn, message);
      onRecipesChanged(recipes);
      setEditingRecipe(null);
    } catch (e) {
      setRecipeError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  const handleRecipeCreate = (r) =>
    commitRecipes((recipes) => [...recipes, { id: uniqueId(r.name, recipes), ...r }], `Add recipe: ${r.name}`);

  const handleRecipeUpdate = (id) => (r) =>
    commitRecipes(
      (recipes) => recipes.map((x) => (x.id === id ? { ...x, ...r } : x)),
      `Update recipe: ${r.name}`,
    );

  function handleRecipeDelete(r) {
    if (!window.confirm(`Delete recipe "${r.name}"?\n\nPast meal logs keep their values.`)) return;
    commitRecipes((recipes) => recipes.filter((x) => x.id !== r.id), `Remove recipe: ${r.name}`);
  }

  async function commit(fn, message) {
    setBusy(true); setError('');
    try {
      const foods = await mutateFoods(settings, fn, message);
      onChanged(foods);
      setEditing(null);
      setScanned(null);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function handleScan(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    setScanBusy(true); setError('');
    try {
      const image = await fileToJpegBase64(file);
      const food = await readNutritionLabel(settings, image);
      setScanned(food);
      setScanKey((k) => k + 1); // remount the form with the scanned values
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setScanBusy(false);
    }
  }

  const handleCreate = (food) =>
    commit((foods) => [...foods, { id: uniqueId(food.name, foods), ...food }], `Add food: ${food.name}`);

  const handleUpdate = (id) => (food) =>
    commit((foods) => foods.map((x) => (x.id === id ? { id, ...food } : x)), `Update food: ${food.name}`);

  function handleDelete(f) {
    if (!window.confirm(`Delete "${f.name}" from the food database?\n\nPast meal logs keep their values. Only future logging is affected.`)) return;
    commit((foods) => foods.filter((x) => x.id !== f.id), `Remove food: ${f.name}`);
  }

  const foods = data.foods.filter(
    (f) =>
      !q ||
      f.name.toLowerCase().includes(q.toLowerCase()) ||
      (f.category || '').toLowerCase().includes(q.toLowerCase()),
  );

  const recipes = data.recipes || [];

  return (
    <>
      <div className="card">
        <div className="food-head">
          <h2>Recipes ({recipes.length})</h2>
          {editingRecipe == null && (
            <button className="ghost" onClick={() => setEditingRecipe('new')}>+ Add recipe</button>
          )}
        </div>
        <p className="hint" style={{ marginTop: 0 }}>
          Your regular meals as reusable ingredient lists. Nutrition is always
          calculated from the food database below, so updating a food updates every
          recipe. Log one from the Log tab in two taps.
        </p>

        {editingRecipe === 'new' && (
          <RecipeForm foods={data.foods} busy={busy} onSave={handleRecipeCreate}
            onCancel={() => setEditingRecipe(null)} />
        )}
        {editingRecipe != null && editingRecipe !== 'new' && (
          <RecipeForm key={editingRecipe} foods={data.foods} busy={busy}
            initial={recipes.find((r) => r.id === editingRecipe)}
            onSave={handleRecipeUpdate(editingRecipe)}
            onCancel={() => setEditingRecipe(null)} />
        )}

        {editingRecipe == null &&
          recipes.map((r) => {
            const t = recipeTotals(r, data.foods);
            const names = (r.ingredients || [])
              .map((ing) => data.foods.find((f) => f.id === ing.food_id)?.name || ing.food_id)
              .join(', ');
            return (
              <div className="food-row" key={r.id}>
                <div className="name">
                  {r.name}{' '}
                  <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '0.8rem' }}>{r.meal}</span>
                </div>
                <div className="detail">
                  {(r.ingredients || []).length
                    ? `${Math.round(t.kcal)} kcal · ${round1(t.protein_g)}g protein · ${round1(t.fibre_g)}g fibre`
                    : 'No ingredients yet — tap Edit to configure'}
                  {t.missingFoods.length > 0 && ' · ⚠ has deleted foods'}
                  {t.hasUnknown && ' · some values unknown'}
                </div>
                {names && <div className="detail">{names}</div>}
                <div className="row-actions">
                  <button className="ghost" onClick={() => setEditingRecipe(r.id)}>Edit</button>
                  <button className="ghost danger" onClick={() => handleRecipeDelete(r)} disabled={busy}>Delete</button>
                </div>
              </div>
            );
          })}
        {editingRecipe == null && recipes.length === 0 && (
          <p className="center">No recipes yet. Add your regular dinners here.</p>
        )}
        {recipeError && <p className="error">{recipeError}</p>}
      </div>

      <div className="card">
      <div className="food-head">
        <h2>Food database ({data.foods.length})</h2>
        {editing == null && (
          <button className="ghost" onClick={() => setEditing('new')}>+ Add food</button>
        )}
      </div>

      {editing === 'new' && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={handleScan}
          />
          <button
            className="ghost scan-btn"
            onClick={() => fileRef.current && fileRef.current.click()}
            disabled={scanBusy || busy}
          >
            {scanBusy ? 'Reading label…' : '📷 Scan a nutrition label'}
          </button>
          <p className="hint">
            Snap the label and the AI fills the form for you. Review, then save. The
            photo is sent only to the Claude API to be read, then discarded; it is
            never stored.
          </p>
          <FoodForm key={scanKey} initial={scanned} busy={busy} onSave={handleCreate}
            onCancel={() => { setEditing(null); setScanned(null); }} />
        </>
      )}

      {editing == null && (
        <div className="search-wrap">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search foods…" />
          {q && (
            <button className="search-clear" aria-label="Clear search" onClick={() => setQ('')}>✕</button>
          )}
        </div>
      )}

      <div style={{ marginTop: 8 }}>
        {editing == null &&
          foods.map((f) => (
            <div className="food-row" key={f.id}>
              <div className="name">
                {f.name}{' '}
                <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '0.8rem' }}>{f.category}</span>
              </div>
              <div className="detail">
                {f.standard_serving} · {f.kcal} kcal · {round1(f.protein_g)}g protein · {round1(f.fibre_g)}g fibre
              </div>
              <div className="row-actions">
                <button className="ghost" onClick={() => setEditing(f.id)}>Edit</button>
                <button className="ghost danger" onClick={() => handleDelete(f)} disabled={busy}>Delete</button>
              </div>
            </div>
          ))}

        {editing != null && editing !== 'new' && (
          <FoodForm
            key={editing}
            initial={data.foods.find((f) => f.id === editing)}
            busy={busy}
            onSave={handleUpdate(editing)}
            onCancel={() => setEditing(null)}
          />
        )}

        {editing == null && foods.length === 0 && <p className="center">No matches.</p>}
      </div>
      {error && <p className="error">{error}</p>}
      </div>
    </>
  );
}
