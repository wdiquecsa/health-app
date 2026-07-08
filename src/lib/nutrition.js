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
