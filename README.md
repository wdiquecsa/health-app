# Health App

Personal nutrition & fat-loss tracker PWA. Static frontend hosted on GitHub
Pages; all personal data lives as JSON flatfiles in a **private** GitHub repo,
read and written through the GitHub Contents API. AI features call the Claude
API directly from the browser.

**No personal data is stored in this repository** — it contains only app code
and, under [`private-repo-db/`](private-repo-db/), *sample* database files
with fake example data for people setting up their own copy.

## Architecture

```
GitHub Pages (this repo, public)
        │  fine-grained PAT (contents r/w, one repo)
        ▼
private data repo: data/*.json  (foods, targets, goals, meal_log, weight_log)
        │
        ▼
Claude API (browser-direct)
  · claude-haiku-4-5  → parse meal descriptions into structured log entries
  · claude-opus-4-8   → macro-aware coaching
```

Every meal log and weigh-in is a git commit in the private repo, so the full
data history is versioned, auditable, and recoverable.

## Run your own copy

### 1. Fork/copy this repo and deploy it

1. Fork (or copy) this repository — it can stay public; it holds no data.
2. In your fork: **Settings → Pages → Build and deployment → Source →
   GitHub Actions**.
3. Push to `main` (or re-run the *Deploy to GitHub Pages* workflow). The app
   goes live at `https://<your-username>.github.io/health-app/`.
4. If you rename the repo, update `base` in `vite.config.js` to match
   (`/your-repo-name/`).

### 2. Create your private data repo

1. Create a **private** repository (e.g. `health`).
2. Create a `data/` folder in it and copy in the sample files from
   [`private-repo-db/`](private-repo-db/) — same filenames:

   | File | What it is |
   |---|---|
   | `foods.json` | Your food database — the single source of truth the AI matches against. Replace the samples with foods you actually eat (label values preferred). |
   | `targets.json` | Daily targets: calories, protein, fibre, water. |
   | `goals.json` | Long-term goal, target weight range, milestones (drives the dashboard's goal band). |
   | `profile.json` | Who you are + activity routine (context for the AI coach). |
   | `settings.json` | Logging/data rules. |
   | `coach_rules.json` | **Your AI's rulebook** — persona, priorities, logging and coaching rules injected into every AI call. Editable inside the app (Setup tab → Coach rules). |
   | `memory.json` | **The coach's long-term memory** — durable facts it learns from your chats (preferences, routines, decisions) and reads back on every question. Maintained automatically after each exchange; view/edit in the app (Setup tab → Coach memory). Start it as `{"memories": []}`. |
   | `meal_templates.json` | Reusable meal structures (optional). |
   | `recipes.json` | Recipes as ingredient lists referencing food ids (optional). |
   | `meal_log.json` | Your meal log — start it as `[]`; the sample shows the entry shape the app writes. |
   | `weight_log.json` | Your weigh-ins — start it as `[]` or with a baseline entry. |
   | `water_log.json` | Water intake log (the Log tab's +250/+500 ml buttons write here) — start it as `[]`. |

3. Edit `foods.json`, `targets.json`, `goals.json` and `profile.json` to be
   about *you*. Conventions: kebab-case `id`s, snake_case nutrient keys with
   units in the name (`protein_g`), nutrition values are **per standard
   serving**, and `null` means unknown (never treat as 0).

### 3. Get your two keys

- **GitHub token** — GitHub → Settings → Developer settings → **Fine-grained
  personal access tokens** → scope it to *only* your private data repo, with
  **Contents: Read and write**. Nothing else.
- **Anthropic API key** — [console.claude.com](https://console.claude.com).
  Typical usage (a few AI meal logs + coach questions per day) costs a couple
  of dollars per month.

### 4. Configure the app

Open your deployed app → **Setup** tab → enter both keys plus your data repo's
owner, name, and branch. Everything is stored in that device's localStorage
only, and sent only to `api.github.com` and `api.anthropic.com` — there is no
backend.

On a phone, use **Add to Home Screen** to install it as an app.

## Development

```
npm install
npm run dev
```

Deploys automatically to GitHub Pages on push to `main`.
