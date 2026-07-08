const KEY = 'health.settings';

export const DEFAULTS = {
  githubToken: '',
  anthropicKey: '',
  owner: 'wdiquecsa',
  repo: 'health',
  branch: 'claude/json-db-conversion-37lxw7',
  logModel: 'claude-haiku-4-5',
  coachModel: 'claude-opus-4-8',
};

export function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
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
