# FitMagra site rebuild, member area and billing implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the FitMagra site on Cloudflare Workers under a brand system derived from the existing logo, then add an empty blog, a login-only member area and provider-agnostic monthly billing, one reviewable pull request per milestone.

**Architecture:** A zero-dependency Node build (`scripts/build.mjs`) renders public pages in Spanish and English into `dist/`, which Workers static assets serve. One TypeScript Worker handles `/entrar`, `/app`, `/admin` and `/api` with D1 for data and a private R2 bucket for photos and PDFs. Tests run on `node --test` with `node:sqlite` behind a D1-shaped adapter.

**Tech stack:** Node 26 built-ins (`node:test`, `node:sqlite`, `node:zlib`, WebCrypto, type stripping), HTML and CSS, vanilla JS for two small public scripts, TypeScript (erasable subset) for the Worker, Cloudflare Workers static assets, D1, R2, Wrangler (run by Roberto, not by this session).

Spec: `docs/superpowers/specs/2026-10-27-fitmagra-brand-redesign-design.md`. Section numbers below (S5.2 and so on) point into it.

---

## How this plan runs

- **Process.** Superpowers writing-plans, then subagent-driven-development or executing-plans per milestone, test-driven-development for every unit with logic, verification-before-completion before each PR, requesting-code-review on each milestone diff, finishing-a-development-branch with the PR option only. pstack unslop on all copy and docs before each PR. Ponytail ultra on every diff.
- **Branches.** `plan/brand-redesign` holds the spec and plan commit (M0). Each milestone gets `feat/mN-<slug>`, cut from the previous milestone's branch. Each PR targets `main` and its body says which PR it builds on, so Roberto merges them in order.
- **Gate per milestone.** `node --test` green, `node scripts/build.mjs` clean, `node scripts/check-links.mjs` clean, `node scripts/check-budgets.mjs` within budget, Taste `lint.mjs` and `inspect.mjs` run on public pages (or their unavailability recorded in the PR), unslop pass. The PR body lists what is included, what is not, and each check with its output.
- **Never.** Merge, push `main`, `wrangler deploy`, `wrangler versions upload`, any Cloudflare publish, live payment keys, secrets in the repo, `.taste-skill/` in the repo.
- **Tool limits found while planning.** `npm`, `pnpm`, `gh` and `git -C` need approval in this headless session. Where a step needs one of them, the step says what to do when it is denied: record it in the PR body (or the final report if no PR can open) and continue with the next allowed step.

## File structure (end state)

```text
site/
  assets/brand.css            tokens (S5.2 to S5.5) and public page styles
  assets/equations.js         live "Tus cuatro números" (browser module)
  assets/media.js             video poster and music player, opt-in
  assets/fonts/               Montserrat WOFF2 subsets (when downloaded)
  media/                      every public image, video, audio, renamed
  i18n.mjs                    ES and EN strings for every public page
  layout.mjs                  <head>, navigation, footer, shared by all pages
  pages/home.mjs              home page sections (S6.2, S6.3)
  pages/stories.mjs           Historias
  pages/blog.mjs              listing and post templates
  pages/legal.mjs             Términos and Privacidad placeholders
content/
  stories.json                success stories with consent status
  blog/es/  blog/en/          Markdown posts (empty at launch)
lib/
  equations.mjs               BMR equations, shared by browser and tests
  markdown.mjs                Markdown subset renderer
  frontmatter.mjs             front matter parser and validator
scripts/
  build.mjs                   writes dist/
  check-links.mjs             every local href and src in dist/ resolves
  check-budgets.mjs           page-weight and JS budgets (S15)
  check-cutover.mjs           cutover checklist (S14), fails closed
  sample-logo-colors.mjs      derives the palette from the logo files
  create-admin.mjs            prints SQL and an invite link for the first admin
worker/
  index.ts                    router: static fall-through, route groups, headers
  http.ts                     responses, cookies, Origin check, security headers
  auth/passwords.ts           PBKDF2 hash and verify
  auth/sessions.ts            create, read, renew, delete
  auth/tokens.ts              invite and reset tokens
  auth/routes.ts              /entrar, /entrar/clave, /salir
  app/routes.ts               member screens
  app/views.ts                member HTML
  admin/routes.ts             admin screens and actions
  files.ts                    R2 upload and owner-checked download
  billing/state.ts            subscription state machine, pure
  billing/access.ts           access level by state and date, pure
  billing/provider.ts         BillingProvider interface and the stub
  billing/routes.ts           checkout start, webhook, stub pages
migrations/
  0001_auth.sql  0002_member_data.sql  0003_billing.sql
tests/
  d1-sqlite.mjs               D1-shaped adapter over node:sqlite
  *.test.mjs / *.test.ts      one file per unit
docs/
  superpowers/specs/          spec, plan
  runbooks/cloudflare-cutover.md
wrangler.jsonc
.dev.vars.example
.gitignore
package.json                  scripts only, no dependencies
```

Removed: `index.html` (replaced by the build), `image-slot.js`, `img/placeholder.txt`. Media moves from `img/` and the root into `site/media/` with clean names.

---

## Milestone M0. Spec and plan

### Task M0.1: Commit the docs

**Files:** `docs/superpowers/specs/2026-10-27-fitmagra-brand-redesign-design.md`, `docs/superpowers/specs/2026-10-27-fitmagra-brand-redesign-plan.md`

- [ ] Run unslop over both files (no em dashes, no mid-sentence colons, sentence-case headings, plain words). Check with `rg -n '—' docs/superpowers/specs/2026-10-27-fitmagra-brand-redesign-*.md`. Expected: no matches.
- [ ] Commit on `plan/brand-redesign`: `git add docs/superpowers/specs/2026-10-27-fitmagra-brand-redesign-design.md docs/superpowers/specs/2026-10-27-fitmagra-brand-redesign-plan.md && git commit -m "docs: brand redesign spec and plan"`.
- [ ] Push `plan/brand-redesign` and open the M0 PR (`gh pr create --base main --head plan/brand-redesign`). If `git push` or `gh` is denied, record it and continue.

---

## Milestone M1. Brand, static build and the new home page

Branch `feat/m1-brand-home` from `plan/brand-redesign`.

### Task M1.1: Move media and delete dead files

**Files:** create `site/media/*`; delete `img/*`, `image-slot.js`, `testimonial-video.mp4`, `fitmagra-vibes.mp3`, `index.html` (in M1.8, after the new home exists).

- [ ] `git mv` each file to its new name: `logo oficial1.png` to `site/media/logo-oficial.png`, `logo metal.png` to `logo-metal.png`, `logo neon.jpeg` to `neon.jpg`, `logo-*.png.png` to `pay-*.png`, `logo-rosario.png.png` to `rosario.png`, `t-*.{jpg,png}` keep names, `coach-*.jpg` keep names, `testimonial-video.mp4` and `fitmagra-vibes.mp3` into `site/media/`.
- [ ] Delete `image-slot.js` and `img/placeholder.txt`.
- [ ] Update `scripts/sample-logo-colors.mjs` to read from `site/media/`. Run it. Expected: the values in S5.2.
- [ ] Commit `chore: move media under site/media and drop unused files`.

### Task M1.2: Brand tokens and fonts

**Files:** create `site/assets/brand.css`; optionally `site/assets/fonts/*.woff2`.

- [ ] Write `brand.css` with the tokens from S5.2 to S5.5 as custom properties (`--black`, `--white`, `--fit`, `--signal`, `--teal`, `--lime`, `--grey`, the five type steps, the spacing scale, `--radius: 0`), a reset, focus styles (3 px `--signal` outline on black, black on light fields) and `prefers-reduced-motion` handling.
- [ ] Try `curl -L -o` for the Montserrat WOFF2 files from the Google Fonts GitHub repository (OFL). If denied, link Google Fonts in `layout.mjs` with `family=Montserrat:wght@500;800&display=swap` and record the swap in the PR.
- [ ] Commit `feat: brand tokens derived from the logo`.

### Task M1.3: BMR equations (TDD)

**Files:** create `lib/equations.mjs`, `tests/equations.test.mjs`.

- [ ] Write failing tests first. Worked examples, computed by hand from the published coefficients:
  - Mifflin-St Jeor, male, 80 kg, 180 cm, 30 y: `10*80 + 6.25*180 - 5*30 + 5 = 1780`.
  - Mifflin-St Jeor, female, 60 kg, 165 cm, 30 y: `600 + 1031.25 - 150 - 161 = 1320.25`.
  - Harris-Benedict revised (Roza and Shizgal 1984), male, 80 kg, 180 cm, 30 y: `88.362 + 13.397*80 + 4.799*180 - 5.677*30 = 1853.632`.
  - Cunningham 1980, 80 kg at 20 % fat: `500 + 22*64 = 1908`.
  - Oxford (Henry 2005), male 30 to 60, 80 kg: `(0.0592*80 + 2.48) MJ * 239.006 = 1724.67`.
  - Cunningham without body fat returns `null`; ages under 18 return `null` for every equation; non-numeric input throws.
- [ ] Run `node --test tests/equations.test.mjs`. Expected: FAIL, module not found.
- [ ] Implement `bmr({ sex, ageYears, weightKg, heightCm, bodyFatPct })` returning `{ harrisBenedict, mifflinStJeor, cunningham, oxford }` rounded to whole kcal for display, exact in a `raw` field for tests. One table of coefficients, not branches per equation.
- [ ] Run the tests. Expected: PASS.
- [ ] Commit `feat: four BMR equations with worked-example tests`.

Before launch, Mauricio confirms the Oxford coefficients against Henry 2005 (open item in the PR).

### Task M1.4: Layout, i18n and the build

**Files:** create `site/i18n.mjs`, `site/layout.mjs`, `site/pages/home.mjs`, `scripts/build.mjs`, `tests/build.test.mjs`, `package.json`, `.gitignore`.

- [ ] Failing test: running `build({ outDir })` into a temp folder writes `index.html` and `en/index.html`; each has `lang`, a `<title>`, a meta description, a canonical link and `hreflang` pairs; the ES page contains "Tu plan," and the EN page "Your plan,"; neither contains `—` or the word "MagraMind AI 24/7".
- [ ] Implement `build.mjs`: clean `dist/`, copy `site/assets` and `site/media`, render pages per language with `layout.mjs`, write `robots.txt` and `404.html`.
- [ ] `package.json` holds only `"type": "module"` and scripts (`build`, `test`, `check`). No dependencies.
- [ ] `.gitignore`: `dist/`, `.dev.vars`, `.wrangler/`, `node_modules/`, `.taste-skill/`.
- [ ] Run `node --test`. Expected: PASS.
- [ ] Commit `feat: zero-dependency static build with ES and EN`.

### Task M1.5: Home page sections

**Files:** modify `site/pages/home.mjs`, `site/assets/brand.css`, `site/i18n.mjs`; create `site/assets/equations.js`.

Build each section from the Taste sheet (S6.1, S6.2) with the copy deck (S6.3). Neighbouring sections never share a layout.

- [ ] Hero: black field, giant `--fit` plate shape (a rounded rectangle taken from the logo's plates) cropped by the right edge, headline on two lines, one sentence, one `--signal` button to WhatsApp.
- [ ] Intro tiles: slogan tile, 450+ tile, `coach-green.jpg` tile, method text tile.
- [ ] Live equations: green field, inputs, the four results on plate shapes, the note, a `<noscript>`-free fallback table that the script replaces.
- [ ] Proof band: teal field, country names moving left, paused under reduced motion, sentence and link below.
- [ ] About: inset black panel, heading, `coach-pilates.jpg` masked to the plate shape, two text blocks with the Rosario logo, button.
- [ ] How it works: white field, three growing `--fit` tiles with `coach-black.jpg`, `coach-pilates.jpg` crop, `t-mes.jpg` (consent-gated, see M2).
- [ ] Pricing: lime field, three tickets with notches and perforation, `<details>` for the full feature list kept verbatim from the old page.
- [ ] FAQ: six bands alternating black and green, all answers visible.
- [ ] Closing: inverted field, button.
- [ ] Footer: `neon.jpg` full width, links, contact lines, music player with `preload="none"`.
- [ ] Motion: shutter reveal on the about portrait only, staggered entrances, button feedback, all `transform` and `opacity`, with reduced-motion fallbacks.
- [ ] Commit per two or three sections: `feat(home): hero and intro`, and so on.

### Task M1.6: Link and budget checks

**Files:** create `scripts/check-links.mjs`, `scripts/check-budgets.mjs`, `tests/checks.test.mjs`.

- [ ] Failing test: `site/assets/brand.css` contains no `gradient`, no `box-shadow`, no `monospace`, and names at most two font families.
- [ ] Failing tests: `checkLinks` reports a missing file for a fixture page that references `media/nope.jpg`, and reports nothing for a fixture where every reference exists; `pageWeight` counts a referenced image once and skips `preload="none"` audio and video.
- [ ] Implement both. `check-budgets.mjs` prints the bytes per page and fails above S15's targets.
- [ ] Run on `dist/`. Expected: zero missing references; home page under 600 KB. Record the printed numbers in the PR.
- [ ] Commit `feat: link and page-weight checks`.

### Task M1.7: Workers static assets config

**Files:** create `wrangler.jsonc`, `.dev.vars.example`.

- [ ] `wrangler.jsonc`: `name: "fitmagra"`, `compatibility_date` set to the day of the commit, `assets: { directory: "./dist", not_found_handling: "404-page" }`, no `main` yet (assets-only Worker), `env.staging` with its own name. No account id, no route, no secret.
- [ ] Validate it parses as JSONC with a test that strips comments and `JSON.parse`s it.
- [ ] Record in the PR that `wrangler dev` was not run if `npx wrangler` is denied.
- [ ] Commit `feat: Workers static assets config`.

### Task M1.8: Retire the old page and verify

- [ ] Delete `index.html` (the build writes `dist/index.html`).
- [ ] Run Taste `lint.mjs site` and `inspect.mjs dist/index.html` with working files kept out of the repo. Fix every FAIL. Read the screenshots at 1440, 768 and 390 and critique per the Taste `critique.md`. Fix the top three problems.
- [ ] Run unslop on `site/i18n.mjs` copy.
- [ ] Full gate (see "Gate per milestone"). Push the branch. Open the PR with the evidence. Print `M1 | feat/m1-brand-home | <PR URL or "not opened: <reason>"> | <checks>`.

---

## Milestone M2. Historias

Branch `feat/m2-stories` from `feat/m1-brand-home`.

### Task M2.1: Stories data with consent

**Files:** create `content/stories.json`, `tests/stories.test.mjs`.

- [ ] Failing test: every entry has `id`, `image` (an existing file under `site/media/`) or `quote`, `label`, `alt` in both languages and `consent` in `"unverified" | "written"`; ids are unique.
- [ ] Fill it from S4: the 12 transformation images, `t-cm.png`, the seven quotes verbatim, the video. Every `consent` starts as `"unverified"`.
- [ ] Commit `feat: stories data with consent status`.

### Task M2.2: Stories pages

**Files:** create `site/pages/stories.mjs`; modify `scripts/build.mjs`, `site/i18n.mjs`, `site/pages/home.mjs` (link from the proof band).

- [ ] Failing test: build writes `historias/index.html` and `en/stories/index.html`; every image and quote in `stories.json` appears; the build output lists each unverified item.
- [ ] Implement with photographs at uneven sizes, quotes at statement size, the video with a poster and `preload="none"`.
- [ ] Gate, push, PR, status line.

---

## Milestone M3. Blog pipeline, empty

Branch `feat/m3-blog` from `feat/m2-stories`.

### Task M3.1: Front matter (TDD)

**Files:** create `lib/frontmatter.mjs`, `tests/frontmatter.test.mjs`.

- [ ] Failing tests: parses the fields in S9; rejects a missing title with `"<file>: title is required"`; rejects a `lang` that does not match the folder; rejects a title over 70 characters; `draft` defaults to false; `tags: [a, b]` parses to an array.
- [ ] Implement, run, commit `feat: blog front matter parser`.

### Task M3.2: Markdown subset (TDD)

**Files:** create `lib/markdown.mjs`, `tests/markdown.test.mjs`.

- [ ] Failing tests: headings h2 to h4, paragraphs, `-` and `1.` lists, `**bold**`, `*em*`, links, images with alt, blockquotes; `<script>` in the source comes out escaped; a `javascript:` link is dropped.
- [ ] Implement with a `ponytail:` comment naming the subset and the upgrade path. Commit `feat: markdown subset renderer`.

### Task M3.3: Listing, post, RSS, sitemap, SEO

**Files:** create `site/pages/blog.mjs`, `tests/blog.test.mjs`, `tests/fixtures/blog/es/hola.md`; modify `scripts/build.mjs`.

- [ ] Failing tests with the fixture folder: listing shows the post; post page has canonical, `hreflang`, Open Graph and `BlogPosting` JSON-LD; RSS is well-formed XML with one `<item>`; with an empty folder the listing shows the empty state and RSS has zero items; `sitemap.xml` lists every public page; a draft is skipped.
- [ ] Implement. The real `content/blog/es/` and `content/blog/en/` hold only `.gitkeep`.
- [ ] Gate, push, PR, status line.

---

## Milestone M4. Worker and login-only access

Branch `feat/m4-auth` from `feat/m3-blog`.

### Task M4.0: Type checking (only if installs are allowed)

- [ ] If `npm` is allowed, add `typescript` and `@cloudflare/workers-types` as dev dependencies and a `typecheck` script. If not, record it and rely on tests.

### Task M4.1: D1 adapter for tests

**Files:** create `tests/d1-sqlite.mjs`, `tests/d1-sqlite.test.mjs`.

- [ ] Failing test: `prepare(sql).bind(...).first()`, `.all()` returning `{ results }`, `.run()` returning `{ meta: { changes } }`, and `batch([...])` running in one transaction that rolls back on error.
- [ ] Implement over `node:sqlite` `DatabaseSync`, applying every file in `migrations/` in order. Commit.

### Task M4.2: Schema

**Files:** create `migrations/0001_auth.sql`.

- [ ] `users`, `sessions`, `auth_tokens`, `login_failures`, `audit_log` as in S11.1 with `CHECK` constraints and foreign keys.
- [ ] Test: inserting a user with role `owner` fails; deleting a user cascades sessions. Commit.

### Task M4.3: Passwords, tokens, sessions (TDD)

**Files:** create `worker/auth/passwords.ts`, `worker/auth/tokens.ts`, `worker/auth/sessions.ts` and their tests.

- [ ] Tests: hash then verify true; wrong password false; stored format `pbkdf2$100000$…`; a token is stored only as its SHA-256; an invite token works once and not after 72 hours; a reset token works once and not after 1 hour; a session expires after 30 days; renewal happens only after 24 hours.
- [ ] Implement with WebCrypto. Commit per module.

### Task M4.4: Routes

**Files:** create `worker/index.ts`, `worker/http.ts`, `worker/auth/routes.ts`, `worker/admin/routes.ts` (members list, create, reset link, deactivate, reactivate, role), tests.

- [ ] Tests through `worker.fetch(request, env)` with the adapter: login sets a `__Host-` cookie; five failures lock the email for 15 minutes with the same message; a POST without a matching `Origin` gets 403; a member gets 403 on `/admin/`; deactivation deletes sessions; `GET /registro` and `POST /api/signup` are 404; every response carries the security headers in S12; non-Worker paths fall through to `env.ASSETS.fetch`.
- [ ] Add `main: "worker/index.ts"`, `run_worker_first`, `d1_databases` (placeholder id) to `wrangler.jsonc`.
- [ ] `scripts/create-admin.mjs` prints SQL and a link; test that the SQL contains a hash and never the token.
- [ ] Gate, push, PR, status line.

---

## Milestone M5. Member area

Branch `feat/m5-member-area` from `feat/m4-auth`.

- [ ] **M5.1 Schema.** `migrations/0002_member_data.sql` with `weights`, `workouts`, `photos`, `documents`, `nutrition_targets`, `nutrition_logs`, and the consent columns on `users` (`consent_version`, `consent_at`). Test the `CHECK` constraints.
- [ ] **M5.2 Ownership tests first.** For every member route, a test where member A requests member B's row or file id and gets 404 (not 403, so ids leak nothing).
- [ ] **M5.3 Screens.** `worker/app/routes.ts` and `views.ts` for Inicio, Peso, Entrenos, Fotos, Plan, Nutrición, Coach IA, Cuenta (S11). First login shows the consent screen and blocks the rest until accepted.
- [ ] **M5.4 Files.** `worker/files.ts`: upload checks size and magic bytes, key under `u/<user_id>/`, download checks owner or admin and sends `private, no-store`. Tests with an in-memory R2 stand-in (`put`, `get`, `delete`). Browser resize and re-encode in the upload page script.
- [ ] **M5.5 Admin.** Upload plan PDFs, set nutrition targets, change plan, view a member's data read-only, delete a member's data (logged).
- [ ] **M5.6 Coach IA.** Static demo conversation labelled "Demostración"; test that the page makes no `fetch` and the input is disabled.
- [ ] Add the `r2_buckets` binding to `wrangler.jsonc`. Gate, push, PR, status line.

---

## Milestone M6. Billing domain with the stub provider

Branch `feat/m6-billing` from `feat/m5-member-area`.

- [ ] **M6.1 State machine (TDD).** `worker/billing/state.ts`. Test every state and event pair from S13.1: legal pairs produce the right next state and dates; illegal pairs return an error and no change. One transition table.
- [ ] **M6.2 Access (TDD).** `worker/billing/access.ts`. Test the matrix in S13.2 including the day grace ends.
- [ ] **M6.3 Schema.** `migrations/0003_billing.sql` with `subscriptions`, `payments`, `billing_events`. Provisioning creates a `pending` subscription with the chosen plan.
- [ ] **M6.4 Provider boundary and stub.** `worker/billing/provider.ts` with the interface from S13.4 and the stub. Tests: a repeated `providerEventId` is a no-op; the stub is refused when `ENVIRONMENT=production`.
- [ ] **M6.5 Gating.** Member routes call `access()`; tests for each state.
- [ ] **M6.6 Admin billing view and dunning list.** Counts, past-due list with days left and the WhatsApp reminder link, overrides with a required reason.
- [ ] Gate, push, PR, status line.

## Milestone M7. Real payment adapter (gated)

Starts only after Roberto names the provider (spec Q2) and the research doc `docs/superpowers/specs/2026-10-27-fitmagra-payments-colombia-research.md` is merged or shared. Sandbox credentials only, from Wrangler secrets. Implements `BillingProvider` for that provider, its webhook signature check and its sandbox tests. DIAN invoicing follows Q4. Not started in this run.

## Milestone M8. Cutover runbook and checklist

Branch `feat/m8-cutover` from `feat/m6-billing`.

- [ ] **M8.1 Checklist script (TDD).** `scripts/check-cutover.mjs` fails closed on each item in S14. Tests: fails on the real repo today (consent unverified, legal placeholders, stub provider); passes on a fixture that meets every item.
- [ ] **M8.2 Runbook.** `docs/runbooks/cloudflare-cutover.md`: environments, secrets list by name, D1 and R2 creation, first admin, preview upload, domain attach, verification, rollback with `wrangler rollback`, DNS fallback. Every command marked "Roberto runs".
- [ ] **M8.3 Staging config.** Complete `env.staging` in `wrangler.jsonc` with placeholder ids and `ENVIRONMENT=staging`.
- [ ] Gate, push, PR, status line.

---

## Appendix A. Stack arena synthesis

**Rubric.** Can it be built and verified now with Node built-ins? How secure are the login and the photos? How few moving parts does it have? Does it leave a path to a blog CMS? Does it fit Workers static assets, D1, R2, environments and rollback? Is the upgrade clear once installs are allowed?

**Runners.** Three ran on the parent model (`arena runners: inherit-parent`), read-only, with an identical brief. Runner 1 and runner 3 finished. Runner 2 stopped when the session was interrupted for an effort change. It is recorded as a dropout and was not re-run.

**Result.** Both finished runners and the draft spec chose the same option independently. That option is a zero-dependency static build, one TypeScript Worker in erasable syntax, D1, a private R2 bucket and in-house PBKDF2 login. Each runner rejected each alternative for the same reason. Astro needs npm, so no milestone could start. Hono rendering every page costs Worker CPU on every visit. Supabase or Firebase adds a second vendor holding the photos. Cloudflare Access costs about USD 7 per seat after 50 seats; both runners labelled that figure a guess. Clerk or Auth0 adds a third party for health data. The arena skill treats convergence as strong agreement. The cross-judge was skipped because no divergence was left to judge.

**Grafts.** These went into the spec, with the source runner in parentheses:
- the `manual` billing adapter for today's Nequi and bank payments, so billing ships before any provider is chosen (R1, R3)
- `interval_months` for the 2- and 3-month prepaid terms (R3)
- access computed from dates on every request instead of a cron job (R3)
- the guess that PBKDF2 exceeds the Free plan's CPU limit, which becomes a measurement in M4 and question Q22 (R1, R3)
- staging behind Cloudflare Access, D1 Time Travel, and leaving MX records alone (R1, R3)
- reset links valid for 24 hours, because a person relays them over WhatsApp (R1)
- CSS rule tests: no gradient, no shadow at rest, no monospace, two families at most (R1, R3), added to M1.6

**Rejected from runners.** Admin under `/app/admin` or `/cuenta/admin` (R1, R3), because a separate `/admin` keeps one guard per route group. A `node:http` preview server, because the Taste inspector serves files itself.
