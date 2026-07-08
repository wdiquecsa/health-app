import { useState } from 'react';
import { round1 } from '../lib/nutrition.js';

export default function Foods({ data }) {
  const [q, setQ] = useState('');
  const foods = data.foods.filter(
    (f) =>
      !q ||
      f.name.toLowerCase().includes(q.toLowerCase()) ||
      (f.category || '').toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="card">
      <h2>Food database ({data.foods.length})</h2>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search foods…" />
      <div style={{ marginTop: 8 }}>
        {foods.map((f) => (
          <div className="food-row" key={f.id}>
            <div className="name">{f.name} <span className="meta" style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '0.8rem' }}>{f.category}</span></div>
            <div className="detail">
              {f.standard_serving} · {f.kcal} kcal · {round1(f.protein_g)}g protein · {round1(f.fibre_g)}g fibre
            </div>
          </div>
        ))}
        {foods.length === 0 && <p className="center">No matches.</p>}
      </div>
    </div>
  );
}
