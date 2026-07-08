import { useState } from 'react';
import { saveSettings } from '../lib/settings.js';

export default function Settings({ settings, onSaved }) {
  const [form, setForm] = useState(settings);
  const [saved, setSaved] = useState(false);

  const set = (k) => (e) => { setForm({ ...form, [k]: e.target.value }); setSaved(false); };

  function save() {
    saveSettings(form);
    setSaved(true);
    onSaved(form);
  }

  return (
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
  );
}
