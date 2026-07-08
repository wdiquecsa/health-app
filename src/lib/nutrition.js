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
