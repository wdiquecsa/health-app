const KEY = 'health.settings';

export const DEFAULTS = {
  githubToken: '',
  anthropicKey: '',
  owner: 'wdiquecsa',
  repo: 'health',
  branch: 'claude/json-db-conversion-37lxw7',
  logModel: 'claude-haiku-4-5',
  coachModel: 'claude-sonnet-5',
};

export function loadSettings() {
  try {
    const s = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
    // The coach model was never user-editable, so stored copies of the old
    // default can be migrated to the current one safely.
    if (s.coachModel === 'claude-opus-4-8') s.coachModel = DEFAULTS.coachModel;
    return s;
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings) {
  localStorage.setItem(KEY, JSON.stringify(settings));
}

export function isConfigured(s) {
  return Boolean(s.githubToken && s.owner && s.repo && s.branch);
}
