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
  { id: 'today', label: 'Dash', icon: '📊' },
  { id: 'log', label: 'Log', icon: '🍽️' },
  { id: 'weight', label: 'Body', icon: '⚖️' },
  { id: 'coach', label: 'Coach', icon: '💬' },
  { id: 'foods', label: 'Foods', icon: '🥗' },
  { id: 'settings', label: 'Setup', icon: '⚙️' },
];

// iOS home-screen web apps have no address bar and cache the shell hard, so
// detect new deployments ourselves: fetch the live index.html (bypassing the
// cache) and compare its hashed bundle name to the one currently running.
// Checked on launch, whenever the app returns to the foreground, and hourly.
function useUpdateAvailable() {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const res = await fetch(import.meta.env.BASE_URL, { cache: 'no-store' });
        const html = await res.text();
        const m = html.match(/assets\/index-[\w-]+\.js/);
        if (!m) return;
        const running = Array.from(document.scripts).some((s) => s.src.includes(m[0]));
        if (!cancelled && !running) setAvailable(true);
      } catch {
        // offline or transient error — try again next trigger
      }
    }
    check();
    const onVisible = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(check, 60 * 60 * 1000);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, []);
  return available;
}

function reloadToLatest() {
  // Query param busts the cached index.html that a plain reload might re-serve
  window.location.replace(`${import.meta.env.BASE_URL}?v=${Date.now()}`);
}

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
  const updateAvailable = useUpdateAvailable();

  return (
    <div className="app">
      {updateAvailable && (
        <button className="update-banner" onClick={reloadToLatest}>
          ⬆️ New version available. Tap to update.
        </button>
      )}
      <h1>Health</h1>

      {loadError && <p className="error">Could not load data: {loadError}</p>}

      {tab === 'settings' && (
        <Settings settings={settings} onSaved={onSettingsSaved} data={data}
          onRulesSaved={(coachRules) => setData((d) => ({ ...d, coachRules }))}
          onDataPatch={(patch) => setData((d) => ({ ...d, ...patch }))} />
      )}

      {!isConfigured(settings) && tab !== 'settings' && (
        <div className="card center">
          Add your GitHub token in <strong>Setup</strong> to connect your data.
        </div>
      )}

      {isConfigured(settings) && !ready && tab !== 'settings' && !loadError && (
        <div className="card center">Loading your data…</div>
      )}

      {ready && tab === 'today' && (
        <Dashboard settings={settings} data={data}
          onMealLogChanged={(mealLog) => setData((d) => ({ ...d, mealLog }))}
          onGoToSettings={() => setTab('settings')} />
      )}
      {ready && tab === 'log' && (
        <LogMeal settings={settings} data={data}
          onLogged={(mealLog) => setData({ ...data, mealLog })}
          onWaterLogged={(waterLog) => setData((d) => ({ ...d, waterLog }))} />
      )}
      {ready && tab === 'weight' && (
        <WeightTracker settings={settings} data={data}
          onLogged={(weightLog) => setData({ ...data, weightLog })} />
      )}
      {ready && tab === 'coach' && (
        <Coach settings={settings} data={data}
          onMemorySaved={(memory) => setData((d) => ({ ...d, memory }))} />
      )}
      {ready && tab === 'foods' && (
        <Foods settings={settings} data={data}
          onChanged={(foods) => setData({ ...data, foods })}
          onRecipesChanged={(recipes) => setData((d) => ({ ...d, recipes }))} />
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
