import { useState } from 'react';
import { askCoach } from '../lib/claude.js';
import { dayTotals, todayStr } from '../lib/nutrition.js';

// Tapping one of these fills the question box (it doesn't send), so the
// user can still tweak it before asking.
const COMMON_QUESTIONS = [
  'What should I eat for dinner tonight with the calories I have left?',
  'How much protein do I still need today, and what’s the easiest way to get it?',
  'Suggest a high-protein snack under 200 kcal.',
  'Plan tomorrow’s meals for me within my targets.',
  'How am I doing this week overall?',
  'Review today’s meals: what would you have done differently?',
  'What’s a filling breakfast that keeps me full until lunch?',
  'How can I get more fibre in without adding many calories?',
  'Is my weight loss on track for my deadline?',
  'I’m eating out tonight. What should I order and avoid?',
  'I’m hungry but nearly out of calories. What now?',
  'Which foods in my database give the most protein per calorie?',
  'Give me a quick lunch idea from my food database.',
  'Yesterday went badly. How do I get back on track today?',
  'What should I meal-prep this weekend for an easy week?',
];

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
    <>
      <div className="card">
        <h2>Coach</h2>
        <div className="chat">
          {messages.length === 0 && (
            <p className="hint">
              Ask anything, or tap a common question below to fill it in.
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

      <div className="card">
        <h2>Common questions</h2>
        <p className="hint" style={{ marginTop: 0 }}>
          Tap one to put it in the question box above; edit it or just hit Ask.
        </p>
        {COMMON_QUESTIONS.map((q) => (
          <button key={q} className="suggest-q" disabled={busy} onClick={() => setInput(q)}>
            {q}
          </button>
        ))}
      </div>
    </>
  );
}
