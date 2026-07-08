export function todayStr(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function entryTotals(items) {
  return items.reduce(
    (acc, it) => ({
      kcal: acc.kcal + (it.kcal || 0),
      protein_g: acc.protein_g + (it.protein_g || 0),
      fibre_g: acc.fibre_g + (it.fibre_g || 0),
    }),
    { kcal: 0, protein_g: 0, fibre_g: 0 },
  );
}

export function dayTotals(mealLog, date) {
  const entries = mealLog.filter((e) => e.date === date);
  return entryTotals(entries.flatMap((e) => e.items || []));
}

export function round1(n) {
  return Math.round(n * 10) / 10;
}

const DAY_MS = 86400000;

// Consolidate weigh-ins into weekly (Monday-start) or monthly averages.
// 'day' returns entries untouched. Body fat averages only the entries that
// have a reading; a bucket with none keeps it null.
export function aggregateWeighIns(entries, mode) {
  if (mode === 'day' || !entries || entries.length === 0) return entries || [];
  const bucketKey = (dateStr) => {
    const d = new Date(dateStr);
    if (mode === 'month') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return todayStr(monday);
  };
  const buckets = new Map();
  for (const e of entries) {
    const key = bucketKey(e.date);
    if (!buckets.has(key)) buckets.set(key, { weights: [], fats: [], waists: [] });
    const b = buckets.get(key);
    if (e.weight_kg != null) b.weights.push(e.weight_kg);
    if (e.body_fat_pct != null) b.fats.push(e.body_fat_pct);
    if (e.waist_cm != null) b.waists.push(e.waist_cm);
  }
  const avg = (arr) => arr.reduce((a, v) => a + v, 0) / arr.length;
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, b]) => ({
      date,
      weight_kg: b.weights.length ? Math.round(avg(b.weights) * 100) / 100 : null,
      body_fat_pct: b.fats.length ? Math.round(avg(b.fats) * 10) / 10 : null,
      waist_cm: b.waists.length ? Math.round(avg(b.waists) * 10) / 10 : null,
    }))
    .filter((e) => e.weight_kg != null || e.waist_cm != null);
}

// Consistency over the last N completed days (today is excluded because it
// is still in progress). Protein/kcal adherence only judges days that were
// actually logged; unlogged days would score as unfair misses or free hits.
export function adherenceStats(mealLog, targets, n = 7) {
  const t = targets?.daily || {};
  let logged = 0;
  let proteinHit = 0;
  let kcalHit = 0;
  let fibreHit = 0;
  for (let i = 1; i <= n; i++) {
    const d = todayStr(new Date(Date.now() - i * 86400000));
    if (!mealLog.some((e) => e.date === d)) continue;
    logged++;
    const tot = dayTotals(mealLog, d);
    if (t.protein_g?.min != null && tot.protein_g >= t.protein_g.min) proteinHit++;
    if (t.kcal?.value != null && tot.kcal <= t.kcal.value) kcalHit++;
    if (t.fibre_g?.min != null && tot.fibre_g >= t.fibre_g.min) fibreHit++;
  }
  // Streak of consecutive logged days; an empty today doesn't break it yet
  let streak = 0;
  for (let i = 0; ; i++) {
    const d = todayStr(new Date(Date.now() - i * 86400000));
    const has = mealLog.some((e) => e.date === d);
    if (has) streak++;
    else if (i === 0) continue;
    else break;
  }
  return { n, logged, proteinHit, kcalHit, fibreHit, streak };
}

// Daily kcal/protein totals for the last N days, oldest first (for the
// macro history bars). Days with no log carry zeroes.
export function macroHistory(mealLog, n = 14) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const date = todayStr(new Date(Date.now() - i * 86400000));
    const tot = dayTotals(mealLog, date);
    out.push({ date, kcal: tot.kcal, protein_g: tot.protein_g, fibre_g: tot.fibre_g });
  }
  return out;
}

// Compare the recent weight trend against the rate needed to reach the goal
// range by the deadline. Trend uses up to a 14-day window ending at the
// latest weigh-in — single weigh-ins are too noisy to judge pace by.
export function paceStats(weightLog, goals) {
  const entries = [...(weightLog || [])]
    .filter((e) => e.weight_kg != null)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (entries.length < 2) return null;

  const last = entries[entries.length - 1];
  const lastT = new Date(last.date).getTime();
  const windowed = entries.filter((e) => new Date(e.date).getTime() >= lastT - 14 * DAY_MS);
  const first = windowed[0];
  const spanDays = (lastT - new Date(first.date).getTime()) / DAY_MS;
  const lossPerWeek = spanDays >= 3 ? ((first.weight_kg - last.weight_kg) / spanDays) * 7 : null;

  const band = goals?.long_term?.target_weight_kg;
  const deadline = goals?.short_term?.deadline;
  if (!band?.max || !deadline) return null;

  const daysLeft = Math.round((new Date(deadline).getTime() - Date.now()) / DAY_MS);
  const remaining = round1(last.weight_kg - band.max);
  const inRange = last.weight_kg <= band.max && (band.min == null || last.weight_kg >= band.min);
  const requiredPerWeek = daysLeft > 0 && remaining > 0 ? remaining / (daysLeft / 7) : null;

  return {
    lossPerWeek: lossPerWeek != null ? Math.round(lossPerWeek * 100) / 100 : null,
    requiredPerWeek: requiredPerWeek != null ? Math.round(requiredPerWeek * 100) / 100 : null,
    daysLeft,
    remaining,
    inRange,
    deadlinePassed: daysLeft < 0,
    deadline,
  };
}
