import { useEffect, useState } from 'react';
import { saveSettings } from '../lib/settings.js';
import { saveCoachRules } from '../lib/github.js';

const DEFAULT_RULES = {
  persona: 'Supportive, practical nutrition coach. Concise and concrete — real foods with amounts, not generic advice.',
  focus: ['Protein first, calories second, fibre third', 'Always report calories, protein and fibre'],
  logging_rules: ['Prefer foods from the database; use measured servings', 'Label values over generic references; flag estimates'],
  coaching_rules: ['Suggest concrete foods with amounts from the database'],
};

const toText = (arr) => (arr || []).join('\n');
const toList = (text) => text.split('\n').map((s) => s.trim()).filter(Boolean);

export default function Settings({ settings, onSaved, data, onRulesSaved }) {
  const [form, setForm] = useState(settings);
  const [saved, setSaved] = useState(false);

  const [rules, setRules] = useState(null);
  const [rulesBusy, setRulesBusy] = useState(false);
  const [rulesSaved, setRulesSaved] = useState(false);
  const [rulesError, setRulesError] = useState('');

  useEffect(() => {
    const src = data?.coachRules || DEFAULT_RULES;
    setRules({
      persona: src.persona || '',
      focus: toText(src.focus),
      logging_rules: toText(src.logging_rules),
      coaching_rules: toText(src.coaching_rules),
    });
  }, [data?.coachRules]);

  const set = (k) => (e) => { setForm({ ...form, [k]: e.target.value }); setSaved(false); };
  const setRule = (k) => (e) => { setRules({ ...rules, [k]: e.target.value }); setRulesSaved(false); };

  function save() {
    saveSettings(form);
    setSaved(true);
    onSaved(form);
  }

  async function saveRules() {
    setRulesBusy(true); setRulesError('');
    try {
      const payload = {
        persona: rules.persona.trim(),
        focus: toList(rules.focus),
        logging_rules: toList(rules.logging_rules),
        coaching_rules: toList(rules.coaching_rules),
      };
      await saveCoachRules(settings, payload);
      onRulesSaved(payload);
      setRulesSaved(true);
    } catch (e) {
      setRulesError(String(e.message || e));
    } finally {
      setRulesBusy(false);
    }
  }

  return (
    <>
      <div className="card">
        <h2>Settings</h2>

        <label>GitHub token (fine-grained PAT, contents read/write on the data repo)</label>
        <input type="password" value={form.githubToken} onChange={set('githubToken')} placeholder="github_pat_…" />

        <label>Anthropic API key</label>
        <input type="password" value={form.anthropicKey} onChange={set('anthropicKey')} placeholder="sk-ant-…" />

        <label>Data repo owner</label>
        <input value={form.owner} onChange={set('owner')} />

        <label>Data repo name</label>
        <input value={form.repo} onChange={set('repo')} />

        <label>Data branch</label>
        <input value={form.branch} onChange={set('branch')} />

        <button className="primary" onClick={save}>Save</button>
        {saved && <p className="hint delta-good">Saved. Data will reload.</p>}
        <p className="hint">
          Both keys are stored only in this browser (localStorage) and sent only to
          api.github.com and api.anthropic.com. Meal logging uses {settings.logModel};
          the coach uses {settings.coachModel}.
        </p>
      </div>

      {data && rules && (
        <div className="card">
          <h2>Coach rules</h2>
          <p className="hint" style={{ marginTop: 0 }}>
            These rules steer the AI every time it logs a meal, analyses your day, or
            answers a question. Saved to <code>data/coach_rules.json</code> in your data
            repo, so they version like everything else. One rule per line.
          </p>

          <label>Persona — who your coach is and how it talks</label>
          <textarea value={rules.persona} onChange={setRule('persona')} />

          <label>Focus — priorities applied to everything (logging + coaching)</label>
          <textarea value={rules.focus} onChange={setRule('focus')} />

          <label>Logging rules — how meals get analysed and recorded</label>
          <textarea value={rules.logging_rules} onChange={setRule('logging_rules')} />

          <label>Coaching rules — how advice and answers are given</label>
          <textarea value={rules.coaching_rules} onChange={setRule('coaching_rules')} />

          <button className="primary" disabled={rulesBusy} onClick={saveRules}>
            {rulesBusy ? 'Saving…' : 'Save coach rules'}
          </button>
          {rulesSaved && <p className="hint delta-good">Coach rules saved to your data repo.</p>}
          {rulesError && <p className="error">{rulesError}</p>}
        </div>
      )}
    </>
  );
}
