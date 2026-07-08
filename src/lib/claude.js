// AI layer: Haiku parses meal descriptions into structured log entries,
// Opus answers coaching questions with full nutrition context.
// Direct browser access is intended here — this is a single-user app and the
// key lives only in this device's localStorage.

import Anthropic from '@anthropic-ai/sdk';

function client(settings) {
  return new Anthropic({
    apiKey: settings.anthropicKey,
    dangerouslyAllowBrowser: true,
  });
}

// Compact food list so the model matches against real database entries.
function foodsContext(foods) {
  return foods
    .map(
      (f) =>
        `${f.id} | ${f.name} | serving: ${f.standard_serving} | kcal ${f.kcal} | protein ${f.protein_g}g | fibre ${f.fibre_g}g`,
    )
    .join('\n');
}

// User-editable rules from data/coach_rules.json (edited in the Settings tab).
// Sections are picked per call site so logging and coaching each get what's relevant.
function rulesBlock(coachRules, sections) {
  if (!coachRules) return '';
  const lines = [];
  if (sections.includes('persona') && coachRules.persona) {
    lines.push(`Persona: ${coachRules.persona}`);
  }
  const labels = { focus: 'Focus', logging_rules: 'Logging rules', coaching_rules: 'Coaching rules' };
  for (const key of sections) {
    const arr = coachRules[key];
    if (Array.isArray(arr) && arr.length) {
      lines.push(`${labels[key] || key}:`);
      for (const r of arr) lines.push(`- ${r}`);
    }
  }
  if (!lines.length) return '';
  return `\n\nUSER'S COACH RULES (defined by the user — follow them):\n${lines.join('\n')}`;
}

const MEAL_SCHEMA = {
  type: 'object',
  properties: {
    meal: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'] },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          food_id: { type: ['string', 'null'] },
          name: { type: 'string' },
          quantity: { type: 'string' },
          servings: { type: 'number' },
          kcal: { type: 'number' },
          protein_g: { type: 'number' },
          fibre_g: { type: 'number' },
          is_estimate: { type: 'boolean' },
        },
        required: ['food_id', 'name', 'quantity', 'servings', 'kcal', 'protein_g', 'fibre_g', 'is_estimate'],
        additionalProperties: false,
      },
    },
  },
  required: ['meal', 'items'],
  additionalProperties: false,
};

export async function parseMeal(settings, foods, text, coachRules) {
  const system = `You convert meal descriptions into structured nutrition data.

FOOD DATABASE (authoritative — prefer these values):
id | name | standard serving | per-serving values
${foodsContext(foods)}

Rules:
- Match foods to database entries by id whenever possible; nutrition values are PER STANDARD SERVING — scale by the number of servings eaten.
- "servings" is the number of standard servings (e.g. 300g Skyr with a 200g serving = 1.5 servings).
- kcal/protein_g/fibre_g in your output are the TOTALS for the quantity eaten, not per serving.
- If a food is not in the database, estimate using typical label/reference values, set food_id to null and is_estimate to true.
- Infer the meal type from context or time words; default to "snack" if unclear.${rulesBlock(coachRules, ['focus', 'logging_rules'])}`;

  const res = await client(settings).messages.create({
    model: settings.logModel,
    max_tokens: 2000,
    system,
    messages: [{ role: 'user', content: text }],
    output_config: { format: { type: 'json_schema', schema: MEAL_SCHEMA } },
  });
  const textBlock = res.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('No response from model');
  return JSON.parse(textBlock.text);
}

export async function askCoach(settings, ctx, question) {
  const { targets, goals, todayTotals, recentMeals, recentWeights, foods, coachRules } = ctx;
  const persona =
    coachRules?.persona ||
    'You are a supportive, practical nutrition coach. Be concise and concrete — give actual food suggestions with amounts, not generic advice.';
  const system = `${persona}

DAILY TARGETS: ${JSON.stringify(targets)}
GOALS: ${JSON.stringify(goals)}

TODAY SO FAR: ${JSON.stringify(todayTotals)}
RECENT MEALS: ${JSON.stringify(recentMeals)}
RECENT WEIGHT: ${JSON.stringify(recentWeights)}

AVAILABLE FOODS (the user's database, per standard serving):
${foodsContext(foods)}

Always report calories, protein and fibre when suggesting meals. Prefer foods from the database.${rulesBlock(coachRules, ['focus', 'coaching_rules'])}`;

  const res = await client(settings).messages.create({
    model: settings.coachModel,
    max_tokens: 1500,
    system,
    messages: [{ role: 'user', content: question }],
  });
  return res.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}
