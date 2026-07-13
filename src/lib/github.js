// Data layer: the private GitHub repo's data/*.json files are the database.
// Reads and writes go through the GitHub Contents API with a fine-grained PAT.

const API = 'https://api.github.com';

function b64encodeUtf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function b64decodeUtf8(b64) {
  const bin = atob(b64.replace(/\n/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function gh(settings, path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    // Browsers cache GitHub API GETs for 60s; a stale read means a stale sha
    // and a rejected write right after another write. Always fetch fresh.
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${settings.githubToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...options.headers,
    },
  });
  if (res.status === 404) return { notFound: true };
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

// Returns { data, sha } — sha is needed to write the file back.
export async function getJson(settings, filePath) {
  const { owner, repo, branch } = settings;
  const res = await gh(
    settings,
    `/repos/${owner}/${repo}/contents/${filePath}?ref=${encodeURIComponent(branch)}`,
  );
  if (res.notFound) return { data: null, sha: null };
  return { data: JSON.parse(b64decodeUtf8(res.content)), sha: res.sha };
}

export async function putJson(settings, filePath, data, sha, message) {
  const { owner, repo, branch } = settings;
  const body = {
    message,
    content: b64encodeUtf8(JSON.stringify(data, null, 2) + '\n'),
    branch,
  };
  if (sha) body.sha = sha;
  return gh(settings, `/repos/${owner}/${repo}/contents/${filePath}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

// Append an entry to a JSON-array log file, re-fetching the latest sha so
// concurrent edits from other devices aren't clobbered.
export async function appendToLog(settings, filePath, entry, message) {
  const { data, sha } = await getJson(settings, filePath);
  const log = Array.isArray(data) ? data : [];
  log.push(entry);
  await putJson(settings, filePath, log, sha, message);
  return log;
}

// Apply a mutation to the foods database against its freshest version, so
// concurrent edits from other devices aren't clobbered.
export async function mutateFoods(settings, fn, message) {
  const { data, sha } = await getJson(settings, 'data/foods.json');
  const foods = fn(Array.isArray(data) ? data : []);
  await putJson(settings, 'data/foods.json', foods, sha, message);
  return foods;
}

// Overwrite the coach rules file, re-fetching the latest sha first.
export async function saveCoachRules(settings, rules) {
  const { sha } = await getJson(settings, 'data/coach_rules.json');
  await putJson(settings, 'data/coach_rules.json', rules, sha, 'Update coach rules');
}

// Overwrite the coach's long-term memory, re-fetching the latest sha first.
export async function saveMemory(settings, memories) {
  const { sha } = await getJson(settings, 'data/memory.json');
  await putJson(settings, 'data/memory.json', { memories }, sha, 'Update coach memory');
}

// Update any JSON data file through a merge function applied to its freshest
// version, so fields the app doesn't edit are preserved.
export async function updateJson(settings, filePath, updater, message) {
  const { data, sha } = await getJson(settings, filePath);
  const next = updater(data);
  await putJson(settings, filePath, next, sha, message);
  return next;
}

export async function loadAll(settings) {
  const [foods, targets, goals, mealLog, weightLog, coachRules, memory] = await Promise.all([
    getJson(settings, 'data/foods.json'),
    getJson(settings, 'data/targets.json'),
    getJson(settings, 'data/goals.json'),
    getJson(settings, 'data/meal_log.json'),
    getJson(settings, 'data/weight_log.json'),
    getJson(settings, 'data/coach_rules.json'),
    getJson(settings, 'data/memory.json'),
  ]);
  return {
    foods: foods.data || [],
    targets: targets.data || null,
    goals: goals.data || null,
    mealLog: mealLog.data || [],
    weightLog: weightLog.data || [],
    coachRules: coachRules.data || null,
    // Missing file just means the coach hasn't remembered anything yet
    memory: memory.data?.memories || [],
  };
}
