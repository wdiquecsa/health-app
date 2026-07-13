import { useEffect, useRef, useState } from 'react';
import { saveSettings } from '../lib/settings.js';
import { saveCoachRules, saveMemory, updateJson } from '../lib/github.js';
import { parseDecimal } from '../lib/nutrition.js';

// Textarea that keeps its normal height as a minimum and grows with the
// content, so long rule lists never need inner scrolling.
function AutoTextarea({ value, onChange }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return (
    <textarea ref={ref} value={value} onChange={onChange} style={{ overflow: 'hidden', resize: 'none' }} />
  );
}

const DEFAULT_RULES = {
  persona: 'Supportive, practical nutrition coach. Concise and concrete: real foods with amounts, not generic advice.',
  focus: ['Protein first, calories second, fibre third', 'Always report calories, protein and fibre'],
  logging_rules: ['Prefer foods from the database; use measured servings', 'Label values over generic references; flag estimates'],
  coaching_rules: ['Suggest concrete foods with amounts from the database'],
};

const toText = (arr) => (arr || []).join('\n');
const toList = (text) => text.split('\n').map((s) => s.trim()).filter(Boolean);

const numOrNull = (v) => parseDecimal(v);

export default function Settings({ settings, onSaved, data, onRulesSaved, onDataPatch }) {
  const [form, setForm] = useState(settings);
  const [saved, setSaved] = useState(false);

  const [rules, setRules] = useState(null);
  const [rulesBusy, setRulesBusy] = useState(false);
  const [rulesSaved, setRulesSaved] = useState(false);
  const [rulesError, setRulesError] = useState('');

  const [tg, setTg] = useState(null);
  const [tgBusy, setTgBusy] = useState(false);
  const [tgSaved, setTgSaved] = useState(false);
  const [tgError, setTgError] = useState('');

  const [mem, setMem] = useState(null);
  const [memBusy, setMemBusy] = useState(false);
  const [memSaved, setMemSaved] = useState(false);
  const [memError, setMemError] = useState('');

  useEffect(() => {
    if (!data) return;
    const d = data.targets?.daily || {};
    const gw = data.goals?.long_term?.target_weight_kg || {};
    setTg({
      kcal: d.kcal?.value ?? '',
      proteinMin: d.protein_g?.min ?? '',
      proteinMax: d.protein_g?.max ?? '',
      fibreMin: d.fibre_g?.min ?? '',
      fibreMax: d.fibre_g?.max ?? '',
      waterMin: d.water_l?.min ?? '',
      weightMin: gw.min ?? '',
      weightMax: gw.max ?? '',
      deadline: data.goals?.short_term?.deadline ?? '',
      primary: data.goals?.primary ?? '',
    });
  }, [data?.targets, data?.goals]);

  const setT = (k) => (e) => { setTg({ ...tg, [k]: e.target.value }); setTgSaved(false); };

  async function saveTargetsGoals() {
    setTgBusy(true); setTgError('');
    try {
      const targets = await updateJson(settings, 'data/targets.json', (cur) => {
        const t = cur || {};
        return {
          ...t,
          daily: {
            ...(t.daily || {}),
            kcal: { ...(t.daily?.kcal || {}), value: numOrNull(tg.kcal), unit: 'kcal' },
            protein_g: { ...(t.daily?.protein_g || {}), min: numOrNull(tg.proteinMin), max: numOrNull(tg.proteinMax), unit: 'g' },
            fibre_g: { ...(t.daily?.fibre_g || {}), min: numOrNull(tg.fibreMin), max: numOrNull(tg.fibreMax), unit: 'g' },
            water_l: { ...(t.daily?.water_l || {}), min: numOrNull(tg.waterMin), unit: 'L' },
          },
        };
      }, 'Update daily targets');
      const goals = await updateJson(settings, 'data/goals.json', (cur) => {
        const g = cur || {};
        return {
          ...g,
          primary: tg.primary.trim(),
          short_term: { ...(g.short_term || {}), deadline: tg.deadline || null },
          long_term: {
            ...(g.long_term || {}),
            target_weight_kg: { min: numOrNull(tg.weightMin), max: numOrNull(tg.weightMax) },
          },
        };
      }, 'Update goals');
      onDataPatch({ targets, goals });
      setTgSaved(true);
    } catch (e) {
      setTgError(String(e.message || e));
    } finally {
      setTgBusy(false);
    }
  }

  useEffect(() => {
    const src = data?.coachRules || DEFAULT_RULES;
    setRules({
      persona: src.persona || '',
      focus: toText(src.focus),
      logging_rules: toText(src.logging_rules),
      coaching_rules: toText(src.coaching_rules),
    });
  }, [data?.coachRules]);

  useEffect(() => {
    setMem((data?.memory || []).map((m) => m.text).join('\n'));
  }, [data?.memory]);

  async function saveMem() {
    setMemBusy(true); setMemError('');
    try {
      const existing = data?.memory || [];
      const today = new Date().toISOString().slice(0, 10);
      let maxN = existing.reduce((m, e) => Math.max(m, parseInt(String(e.id).slice(1), 10) || 0), 0);
      // Keep ids (and dates) of lines that already exist; new lines get new ids
      const next = toList(mem).map((text) => {
        const found = existing.find((e) => e.text === text);
        return found || { id: `m${++maxN}`, text, updated: today };
      });
      await saveMemory(settings, next);
      onDataPatch({ memory: next });
      setMemSaved(true);
    } catch (e) {
      setMemError(String(e.message || e));
    } finally {
      setMemBusy(false);
    }
  }

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

      {data && tg && (
        <div className="card">
          <h2>Targets & goals</h2>
          <p className="hint" style={{ marginTop: 0 }}>
            What the dashboard measures against and the AI coaches toward. Saved to
            <code> data/targets.json</code> and <code>data/goals.json</code>.
          </p>

          <label>Calories per day (kcal)</label>
          <input type="number" inputMode="numeric" value={tg.kcal} onChange={setT('kcal')} />

          <div className="num-grid">
            <div>
              <label>Protein min (g/day)</label>
              <input type="number" inputMode="numeric" value={tg.proteinMin} onChange={setT('proteinMin')} />
            </div>
            <div>
              <label>Protein max (g/day)</label>
              <input type="number" inputMode="numeric" value={tg.proteinMax} onChange={setT('proteinMax')} />
            </div>
            <div>
              <label>Fibre min (g/day)</label>
              <input type="number" inputMode="numeric" value={tg.fibreMin} onChange={setT('fibreMin')} />
            </div>
            <div>
              <label>Fibre max (g/day)</label>
              <input type="number" inputMode="numeric" value={tg.fibreMax} onChange={setT('fibreMax')} />
            </div>
          </div>

          <label>Water minimum (L/day)</label>
          <input type="text" inputMode="decimal" value={tg.waterMin} onChange={setT('waterMin')} />

          <label>Primary goal</label>
          <input value={tg.primary} onChange={setT('primary')} placeholder="e.g. Lose body fat while maintaining muscle" />

          <div className="num-grid">
            <div>
              <label>Target weight min (kg)</label>
              <input type="text" inputMode="decimal" value={tg.weightMin} onChange={setT('weightMin')} />
            </div>
            <div>
              <label>Target weight max (kg)</label>
              <input type="text" inputMode="decimal" value={tg.weightMax} onChange={setT('weightMax')} />
            </div>
          </div>

          <label>Short-term deadline</label>
          <input type="date" value={tg.deadline || ''} onChange={setT('deadline')} />

          <button className="primary" disabled={tgBusy} onClick={saveTargetsGoals}>
            {tgBusy ? 'Saving…' : 'Save targets & goals'}
          </button>
          {tgSaved && <p className="hint delta-good">Saved. Dashboard and coach now use the new numbers.</p>}
          {tgError && <p className="error">{tgError}</p>}
        </div>
      )}

      {data && rules && (
        <div className="card">
          <h2>Coach rules</h2>
          <p className="hint" style={{ marginTop: 0 }}>
            These rules steer the AI every time it logs a meal, analyses your day, or
            answers a question. Saved to <code>data/coach_rules.json</code> in your data
            repo, so they version like everything else. One rule per line.
          </p>

          <label>Persona: who your coach is and how it talks</label>
          <AutoTextarea value={rules.persona} onChange={setRule('persona')} />

          <label>Focus: priorities applied to everything (logging and coaching)</label>
          <AutoTextarea value={rules.focus} onChange={setRule('focus')} />

          <label>Logging rules: how meals get analysed and recorded</label>
          <AutoTextarea value={rules.logging_rules} onChange={setRule('logging_rules')} />

          <label>Coaching rules: how advice and answers are given</label>
          <AutoTextarea value={rules.coaching_rules} onChange={setRule('coaching_rules')} />

          <button className="primary" disabled={rulesBusy} onClick={saveRules}>
            {rulesBusy ? 'Saving…' : 'Save coach rules'}
          </button>
          {rulesSaved && <p className="hint delta-good">Coach rules saved to your data repo.</p>}
          {rulesError && <p className="error">{rulesError}</p>}
        </div>
      )}

      {data && mem != null && (
        <div className="card">
          <h2>Coach memory</h2>
          <p className="hint" style={{ marginTop: 0 }}>
            Durable facts the coach has learned from your conversations (preferences,
            routines, decisions). It updates this itself after chats and reads it on
            every question. Saved to <code>data/memory.json</code>. One memory per
            line; delete a line to make it forget.
          </p>
          <AutoTextarea value={mem} onChange={(e) => { setMem(e.target.value); setMemSaved(false); }} />
          <button className="primary" disabled={memBusy} onClick={saveMem}>
            {memBusy ? 'Saving…' : 'Save memory'}
          </button>
          {memSaved && <p className="hint delta-good">Memory saved to your data repo.</p>}
          {memError && <p className="error">{memError}</p>}
        </div>
      )}
    </>
  );
}
