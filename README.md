# eCIR Diploma — ITGate Academy

Practical SOC/DFIR course website (Enterprise Cyber Incident Response). Built as static HTML — no build step, no dependencies.

**Live site:** enable GitHub Pages (see below), then it serves `index.html`.

## What's here
- `index.html` — course dashboard (10 sessions)
- `session-01/`, `session-02/` … — full lecture pages (paged, with break timer, quizzes, homework)
- `lab/` — SOC lab overview, setup guide, investigation challenges (+ datasets)
- `cheatsheets/`, `resources/` — reference hubs
- `assets/` — CSS, JS, images, SVGs

## Publish on GitHub Pages
1. Create a repo (e.g. `ecir-diploma`), push the **contents of this `docs/` folder** to the repo root.
2. Repo → **Settings → Pages** → Source: **Deploy from a branch** → Branch: `main` / `/ (root)` → Save.
3. Site goes live at `https://<user>.github.io/ecir-diploma/` in ~1 minute.

`.nojekyll` is included so files serve as-is.

## Do NOT commit
The private lab build log with real credentials (`Session02_SOC_Lab_Build_Documentation.md`) is **not** in this folder — keep it out of any public repo.

Primary reference: INE eCIR v2. TryHackMe content is linked, not republished.
