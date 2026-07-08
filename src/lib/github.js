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

export async function loadAll(settings) {
  const [foods, targets, goals, mealLog, weightLog] = await Promise.all([
    getJson(settings, 'data/foods.json'),
    getJson(settings, 'data/targets.json'),
    getJson(settings, 'data/goals.json'),
    getJson(settings, 'data/meal_log.json'),
    getJson(settings, 'data/weight_log.json'),
  ]);
  return {
    foods: foods.data || [],
    targets: targets.data || null,
    goals: goals.data || null,
    mealLog: mealLog.data || [],
    weightLog: weightLog.data || [],
  };
}
