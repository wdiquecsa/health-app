import { useEffect, useState, useCallback } from 'react';
import { loadSettings, isConfigured } from './lib/settings.js';
import { loadAll } from './lib/github.js';
import Dashboard from './components/Dashboard.jsx';
import LogMeal from './components/LogMeal.jsx';
import WeightTracker from './components/WeightTracker.jsx';
import Coach from './components/Coach.jsx';
import Foods from './components/Foods.jsx';
import Settings from './components/Settings.jsx';

const TABS = [
  { id: 'today', label: 'Today', icon: '📊' },
  { id: 'log', label: 'Log', icon: '🍽️' },
  { id: 'weight', label: 'Weight', icon: '⚖️' },
  { id: 'coach', label: 'Coach', icon: '💬' },
  { id: 'foods', label: 'Foods', icon: '🥗' },
  { id: 'settings', label: 'Setup', icon: '⚙️' },
];

export default function App() {
  const [settings, setSettings] = useState(loadSettings);
  const [tab, setTab] = useState(isConfigured(loadSettings()) ? 'today' : 'settings');
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');

  const refresh = useCallback(async (s = settings) => {
    if (!isConfigured(s)) return;
    setLoadError('');
    try {
      setData(await loadAll(s));
    } catch (e) {
      setLoadError(String(e.message || e));
    }
  }, [settings]);

  useEffect(() => { refresh(); }, []); // eslint-disable-line

  function onSettingsSaved(s) {
    setSettings(s);
    refresh(s);
  }

  const ready = data != null;

  return (
    <div className="app">
      <h1>Health</h1>

      {loadError && <p className="error">Could not load data: {loadError}</p>}

      {tab === 'settings' && (
        <Settings settings={settings} onSaved={onSettingsSaved} data={data}
          onRulesSaved={(coachRules) => setData({ ...data, coachRules })} />
      )}

      {!isConfigured(settings) && tab !== 'settings' && (
        <div className="card center">
          Add your GitHub token in <strong>Setup</strong> to connect your data.
        </div>
      )}

      {isConfigured(settings) && !ready && tab !== 'settings' && !loadError && (
        <div className="card center">Loading your data…</div>
      )}

      {ready && tab === 'today' && <Dashboard data={data} />}
      {ready && tab === 'log' && (
        <LogMeal settings={settings} data={data}
          onLogged={(mealLog) => setData({ ...data, mealLog })} />
      )}
      {ready && tab === 'weight' && (
        <WeightTracker settings={settings} data={data}
          onLogged={(weightLog) => setData({ ...data, weightLog })} />
      )}
      {ready && tab === 'coach' && <Coach settings={settings} data={data} />}
      {ready && tab === 'foods' && (
        <Foods settings={settings} data={data}
          onChanged={(foods) => setData({ ...data, foods })} />
      )}

      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            <span className="icon">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
