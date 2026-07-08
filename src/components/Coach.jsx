import { useState } from 'react';
import { askCoach } from '../lib/claude.js';
import { dayTotals, todayStr } from '../lib/nutrition.js';

export default function Coach({ settings, data }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function send() {
    const question = input.trim();
    if (!question) return;
    setMessages((m) => [...m, { role: 'user', text: question }]);
    setInput(''); setBusy(true); setError('');
    try {
      const today = todayStr();
      const ctx = {
        targets: data.targets,
        goals: data.goals,
        todayTotals: dayTotals(data.mealLog, today),
        recentMeals: data.mealLog.slice(-10),
        recentWeights: data.weightLog.slice(-10),
        foods: data.foods,
        coachRules: data.coachRules,
      };
      const answer = await askCoach(settings, ctx, question);
      setMessages((m) => [...m, { role: 'assistant', text: answer }]);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>Coach</h2>
      <div className="chat">
        {messages.length === 0 && (
          <p className="hint">
            Ask anything: "What should I eat for dinner?", "How am I doing on protein this week?",
            "Plan tomorrow's meals around chicken thighs."
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>{m.text}</div>
        ))}
        {busy && <div className="msg assistant">Thinking…</div>}
      </div>
      <label>Your question</label>
      <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="What should I eat tonight with what I have left?" />
      <button className="primary" disabled={busy || !input.trim()} onClick={send}>Ask</button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
