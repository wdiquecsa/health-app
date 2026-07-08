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

// Photo of a plate (not a label): identify foods and estimate portions.
// The user's typed description takes precedence over what the photo shows.
export async function parsePlateMeal(settings, foods, image, text, coachRules) {
  const system = `You identify foods and estimate portions from a photo of a meal, producing structured nutrition data.

FOOD DATABASE (authoritative, prefer these values when a food clearly matches):
id | name | standard serving | per-serving values
${foodsContext(foods)}

Rules:
- Identify each food on the plate and estimate the portion from visual cues (plate size, utensils, typical servings).
- If the user provided a description, it takes precedence over the photo. Use it for details the photo cannot show (cooking method, hidden ingredients, exact amounts).
- Match to database entries by id when clearly identifiable; scale by estimated servings of the standard serving.
- kcal/protein_g/fibre_g in your output are TOTALS for the estimated amount, not per serving.
- Anything visually estimated gets is_estimate: true (database matches with confident amounts may be false).
- Be conservative rather than optimistic with portion sizes.
- Infer the meal type from context; default to "snack" if unclear.${rulesBlock(coachRules, ['focus', 'logging_rules'])}`;

  const content = [
    { type: 'image', source: { type: 'base64', media_type: image.media_type, data: image.data } },
    {
      type: 'text',
      text: text
        ? `Photo of my meal. Extra details: ${text}`
        : 'Photo of my meal. Identify the foods and estimate portions.',
    },
  ];
  const res = await client(settings).messages.create({
    model: settings.coachModel,
    max_tokens: 2000,
    system,
    messages: [{ role: 'user', content }],
    output_config: { format: { type: 'json_schema', schema: MEAL_SCHEMA } },
  });
  const textBlock = res.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('No response from model');
  return JSON.parse(textBlock.text);
}

const LABEL_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    category: { type: 'string' },
    label_basis: { type: ['string', 'null'] },
    standard_serving: { type: 'string' },
    serving_g_ml: { type: ['number', 'null'] },
    kcal: { type: ['number', 'null'] },
    protein_g: { type: ['number', 'null'] },
    fibre_g: { type: ['number', 'null'] },
    carbs_g: { type: ['number', 'null'] },
    sugars_g: { type: ['number', 'null'] },
    fat_g: { type: ['number', 'null'] },
    sat_fat_g: { type: ['number', 'null'] },
    salt_g: { type: ['number', 'null'] },
  },
  required: [
    'name', 'category', 'label_basis', 'standard_serving', 'serving_g_ml',
    'kcal', 'protein_g', 'fibre_g', 'carbs_g', 'sugars_g', 'fat_g', 'sat_fat_g', 'salt_g',
  ],
  additionalProperties: false,
};

// Read a photographed nutrition label into food-database values. The image is
// sent only to the Claude API and discarded — it is never stored anywhere.
export async function readNutritionLabel(settings, image) {
  const system = `You read nutrition labels from photos and extract values for a food database.

Rules:
- If the label shows a per-portion column, use the portion as the standard serving; otherwise use per 100g/100ml with standard_serving "100g" (or "100ml").
- All nutrition values in your output must be PER the standard serving you chose.
- Energy: use kcal. If only kJ is shown, convert (kcal = kJ / 4.184) and round to the nearest whole number.
- If sodium is listed instead of salt, convert: salt_g = sodium_g × 2.5.
- Labels may be in any language (fibre = vezels/Ballaststoffe/fibres; protein = eiwitten/Eiweiß/protéines).
- Use null for anything not on the label or unreadable — never guess and never use 0 for unknown.
- name: the product name if visible on the packaging, otherwise a sensible short description.
- category: one word like Meat, Dairy, Bread, Cereal, Snack, Drink, Sauce.
- label_basis: what the values were read from, e.g. "100g label" or "per portion (30g) label".`;

  const res = await client(settings).messages.create({
    model: settings.coachModel,
    max_tokens: 1500,
    system,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: image.media_type, data: image.data } },
          { type: 'text', text: 'Read this nutrition label and extract the values.' },
        ],
      },
    ],
    output_config: { format: { type: 'json_schema', schema: LABEL_SCHEMA } },
  });
  const textBlock = res.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('No response from model');
  const food = JSON.parse(textBlock.text);
  food.source_note = 'Label (photo scan)';
  return food;
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
