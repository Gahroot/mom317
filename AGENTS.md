# AGENTS.md

Static site (plain HTML, CSS and JavaScript in `site/`) plus design research in `research/`. There's no package manifest, so no install, build or test step.

## Commands

- **Preview:** `cd site && python3 -m http.server 8317`, then open http://localhost:8317
- **Type check (the CI gate):**
  `cd site && npx --yes -p typescript@5.9.3 tsc --noEmit --allowJs --checkJs --target es2019 --lib es2019,dom,dom.iterable globals.d.ts config.js app.js thanks.js`
- **Lint / tests:** none configured.
- **Rebuild the research PDF:** print `research/317/deck.html` to PDF with headless Chrome (`--print-to-pdf`).

## Rules

- CI lives in `.github/workflows/ci.yml` and must stay green.
- Never commit with `--no-verify`.
- Go-live settings live in `site/config.js` only. Never show invented signup counts, positions or testimonials.
- Design tokens and contrast measurements are in `site/DESIGN.md`. Re-measure contrast when you change a colour.
