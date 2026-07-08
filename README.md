# Health App

Personal nutrition & fat-loss tracker PWA. Static frontend hosted on GitHub
Pages; all data lives as JSON flatfiles in a **private** GitHub repo, read and
written through the GitHub Contents API. AI features call the Claude API
directly from the browser.

**No data is stored in this repository** — it is only app code.

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

## Setup (one time, per device)

1. Open the deployed app → **Setup** tab.
2. **GitHub token**: create a fine-grained personal access token at
   github.com → Settings → Developer settings → Fine-grained tokens, scoped to
   *only* the private data repo, with **Contents: Read and write**.
3. **Anthropic API key**: create at console.anthropic.com.
4. Both are stored in the browser's localStorage only, and sent only to
   `api.github.com` and `api.anthropic.com`.

On a phone, use "Add to Home Screen" to install it as an app.

## Development

```
npm install
npm run dev
```

Deploys automatically to GitHub Pages on push to `main`.
