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
// null means unknown/not-on-label; shown as ? so the model estimates it
// instead of reading a misleading 0.
function foodsContext(foods) {
  const v = (x) => (x == null ? '?' : x);
  return foods
    .map(
      (f) =>
        `${f.id} | ${f.name} | serving: ${f.standard_serving} | kcal ${v(f.kcal)} | protein ${v(f.protein_g)}g | fibre ${v(f.fibre_g)}g`,
    )
    .join('\n');
}

const UNKNOWN_VALUE_RULE =
  "- A '?' in the database means that value is unknown there. Estimate it from typical label/reference values, use your estimate in the totals, and set is_estimate to true for that item.";

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
${UNKNOWN_VALUE_RULE}
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
${UNKNOWN_VALUE_RULE}
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

// history: the chat so far as [{role: 'user'|'assistant', text}] ending with
// the new question — the API is stateless, so follow-ups only have context if
// we resend the conversation. Bounded to the last 20 turns to keep token cost
// flat in long chats.
export async function askCoach(settings, ctx, history) {
  const { targets, goals, todayTotals, recentMeals, recentWeights, foods, coachRules, memory, profile, last7Days } = ctx;
  const memoryBlock = memory?.length
    ? `\nLONG-TERM MEMORY (durable facts you saved from earlier conversations — use them, don't re-ask):\n${memory.map((m) => `- ${m.text}`).join('\n')}\n`
    : '';
  const persona =
    coachRules?.persona ||
    'You are a supportive, practical nutrition coach. Be concise and concrete — give actual food suggestions with amounts, not generic advice.';
  const system = `${persona}

USER PROFILE: ${JSON.stringify(profile)}
DAILY TARGETS: ${JSON.stringify(targets)}
GOALS: ${JSON.stringify(goals)}

TODAY SO FAR: ${JSON.stringify(todayTotals)}
LAST 7 DAYS (daily kcal/protein/fibre totals; 0s = nothing logged): ${JSON.stringify(last7Days)}
RECENT MEALS: ${JSON.stringify(recentMeals)}
RECENT WEIGHT: ${JSON.stringify(recentWeights)}
${memoryBlock}
AVAILABLE FOODS (the user's database, per standard serving):
${foodsContext(foods)}

Always report calories, protein and fibre when suggesting meals. Prefer foods from the database.${rulesBlock(coachRules, ['focus', 'coaching_rules'])}`;

  const res = await client(settings).messages.create({
    model: settings.coachModel,
    max_tokens: 1500,
    system,
    messages: history.slice(-20).map((m) => ({ role: m.role, content: m.text })),
  });
  return res.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

// ---- Long-term coach memory ------------------------------------------------
// After each coach exchange a cheap model decides whether data/memory.json
// needs changing. It returns edit operations (usually none), which the app
// applies and commits — so the coach accumulates durable knowledge the way
// Claude's own memory works, and the user can inspect/edit it in Setup.

const MEMORY_OPS_SCHEMA = {
  type: 'object',
  properties: {
    ops: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['add', 'replace', 'remove'] },
          id: { type: ['string', 'null'] },
          text: { type: ['string', 'null'] },
        },
        required: ['action', 'id', 'text'],
        additionalProperties: false,
      },
    },
  },
  required: ['ops'],
  additionalProperties: false,
};

export async function maintainMemory(settings, memories, question, answer) {
  const current = memories.length
    ? memories.map((m) => `${m.id} | ${m.text}`).join('\n')
    : '(empty)';
  const system = `You maintain the long-term memory file of an AI nutrition coach. After each exchange you decide what, if anything, should be remembered permanently.

Worth remembering (durable facts, still useful weeks from now):
- Food preferences, dislikes, allergies, intolerances
- Routines and constraints: work schedule, training days, family meals, travel, budget, cooking skill/equipment
- Health facts the user mentions: injuries, conditions, medication
- Decisions or strategies agreed with the coach ("cap snacks at 200 kcal", "step calories up gradually after the cut")

NOT memory (transient, or the app already tracks it):
- Individual meals, daily totals, current weight, targets, goals — the app injects those live
- One-off questions with no lasting signal

Rules:
- One short sentence per memory.
- Use "replace" (with the entry's id) when new information refines or updates an existing memory; "remove" when the exchange contradicts one. Never store duplicates.
- Keep the file under 30 entries; when near the cap, remove the least useful before adding.
- Most exchanges change nothing: then return an empty ops list. Be picky.`;

  const user = `CURRENT MEMORY:\n${current}\n\nLATEST EXCHANGE:\nUser: ${question}\nCoach: ${answer}`;

  const res = await client(settings).messages.create({
    model: settings.logModel, // cheap model — this runs after every exchange
    max_tokens: 700,
    system,
    messages: [{ role: 'user', content: user }],
    output_config: { format: { type: 'json_schema', schema: MEMORY_OPS_SCHEMA } },
  });
  const textBlock = res.content.find((b) => b.type === 'text');
  if (!textBlock) return [];
  return JSON.parse(textBlock.text).ops || [];
}

export function applyMemoryOps(memories, ops) {
  const today = new Date().toISOString().slice(0, 10);
  let next = [...memories];
  let maxN = next.reduce((m, e) => Math.max(m, parseInt(String(e.id).slice(1), 10) || 0), 0);
  for (const op of ops) {
    if (op.action === 'add' && op.text) {
      next.push({ id: `m${++maxN}`, text: op.text, updated: today });
    } else if (op.action === 'replace' && op.id && op.text) {
      next = next.map((e) => (e.id === op.id ? { ...e, text: op.text, updated: today } : e));
    } else if (op.action === 'remove' && op.id) {
      next = next.filter((e) => e.id !== op.id);
    }
  }
  // Hard backstop over the model's soft 30-entry cap: oldest entries drop first
  return next.slice(-40);
}
