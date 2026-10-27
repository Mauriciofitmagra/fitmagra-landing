# FitMagra brand system, site rebuild and member area

Design spec, 2026-10-27 (America/Bogota). Repo `Mauriciofitmagra/fitmagra-landing`, branch `plan/brand-redesign`.

Companion plan: `docs/superpowers/specs/2026-10-27-fitmagra-brand-redesign-plan.md`.
Payments research (separate session, branch `research/payments-colombia`): `docs/superpowers/specs/2026-10-27-fitmagra-payments-colombia-research.md`. This spec does not repeat that research. It references it wherever a provider fact is needed.

## 1. Approval and scope

Roberto approved planning on a voice call at 15:07 and execution at 15:11 on 2026-10-27, both relayed by the orchestrator. Execution covers milestone branches, scoped commits, pushes of feature branches and one pull request per milestone against `main`. It excludes merging, pushing to `main`, deploying, any Cloudflare publish, production changes, spending, live payment credentials and changes to Claude settings. Payment code stays in stub mode until Roberto picks a provider from the research doc.

Roberto's later message changed three things from the first brief. The official logo stays as it is, so this spec writes usage rules instead of a new logo. The palette, type and components derive from that logo. All useful content and media from the current site get reused, and section 4 maps each item to its new home.

## 2. How this spec was made

Skills loaded from their installed text this session: pstack poteto-mode with the Claude Code adapter, sharpen, figure-it-out, arena, unslop, benchmark-checklist, principle-explain-the-number, typescript-best-practices; Superpowers brainstorming and writing-plans; Ponytail at ultra; the Taste skill (design-taste-frontend, "tasteskill v2").

Tool limits observed in this headless session, recorded so nobody mistakes a skipped step for a passed one:

- `npm`, `pnpm`, `deno`, `gh` and `git -C` returned "requires approval" and were not run. The stack in section 8 must therefore build and test with Node 26 built-ins alone.
- The Write tool could not write to `/tmp`. The Taste draw ran with `--out /tmp/fitmagra-taste` and `TASTE_SKILL_HISTORY=/tmp/fitmagra-taste/history.json`, so no `.taste-skill/` folder exists in the repo.
- The brain files (agents.md revision 2026-10-27.3, coding.md, registry.md) were read after Roberto allowed it. `Mauriciofitmagra/fitmagra-landing` is not in registry.md. Adding it is a brain write and stays with the orchestrator.

Sharpen, applied to the brief before design. A senior brand and product designer would also do four things here. They would audit the claims the current page makes before restyling them. They would start from the raw logo files and Mauricio's own photographs, not from a template. They would measure the colours instead of eyeballing them, and they would budget page weight against a mid-range Android phone on a Colombian mobile network. The outside judges of whether the result is right are Mauricio's clients (do they find the plan and book a call), a lawyer reading the health-data handling under Colombian law, and the browser itself (the Taste inspector, page weight, contrast). Choices that stay Roberto's are listed in section 18.

## 3. What exists today

The site is one static page, `index.html`, 2,383 lines with all CSS and JS inline. Nothing is deployed.

Page order today: navigation with two logo images, a theme toggle and an ES/EN switch; hero ("Tu cuerpo cambia cuando tu mente entiende el porqué") with three stat chips; a country marquee; a CSS 3D globe with 14 country pins; four stat counters; about Mauricio with credentials and a 2017 to 2026 timeline; six method cards; a grid of 12 transformation photos; seven testimonials including one video; three pricing cards (Standard, Elite, Platino) with COP/USD and 1, 2 or 3 month toggles; payment methods in three tabs; contact; two marquees; a footer with the neon-sign photo.

Defects found by reading the files (each is a fact from the source, not a guess):

| Defect | Evidence |
| --- | --- |
| Both navigation logos are broken links | `src="img/logo-metal.png"` and `img/logo-oficial.png`; the files are `img/logo metal.png` and `img/logo oficial1.png` |
| Video testimonial is a broken link | `src="img/testimonial-video.mp4"`; the file sits at the repo root |
| Facebook row links to Instagram | `href="https://instagram.com"` with text `facebook.com/FitmagraOficial` |
| 4.7 MB of music requested on load | `<audio preload="auto">` with `fitmagra-vibes.mp3` (4,728,368 bytes) |
| Seven web-font families requested | one Google Fonts URL for DM Serif Display, DM Sans, Space Grotesk, JetBrains Mono, Newsreader, IBM Plex Sans, Playfair Display |
| `image-slot.js` (31 KB) loads but nothing uses it | `rg -c '<image-slot' index.html` returns no matches; it is a design-tool placeholder component |
| An AI assistant is advertised as available | "24/7 MagraMind AI" in the hero and method; Roberto states the assistant does not exist yet |
| A 4.8 star rating has no source | hero chip "4.8★ Calificación promedio" |
| A national ID number and bank accounts are public | payments panel shows `CC 1.016.013.376` and two account numbers |
| Two WhatsApp numbers | contact uses +57 315 361 4260, payments use +57 316 575 4416 |
| Taste house-rule breaks throughout | gradients, shadows at rest, monospace labels, `01 · Bioquímica` index numbers, small tracked caps, emoji badges, a styled accent word in every heading |

The transformation photos are client screenshots from Instagram stories, several in underwear, some with captions burned in. They are sensitive personal data. Section 12 sets a consent gate before any of them reach production.

## 4. Content and media inventory, and where each item goes

Everything useful is reused. "Gated" means the item ships in the build but the production cutover checklist (section 14) blocks launch until Mauricio confirms written consent.

| Item | Today | New home |
| --- | --- | --- |
| `img/logo oficial1.png` | nav (broken path) | navigation and member area header, renamed `logo-oficial.png` on copy into `site/assets/` |
| `img/logo metal.png` | nav (broken path) | favicon and app icon source (the M mark), social share image |
| `img/logo neon.jpeg` | footer | footer photograph, full width (section 6) |
| `img/coach-black.jpg` | hero | how-it-works tile "Valoración"; Open Graph image for the home page |
| `img/coach-pilates.jpg` | about | about panel portrait, masked to the plate shape |
| `img/coach-green.jpg` | unused | intro tile C photograph |
| `img/t-01.jpg` to `t-09.jpg`, `t-angela.png`, `t-hernan.png`, `t-mes.jpg` | transformations grid | success-stories page (gated); `t-mes.jpg` also in how-it-works tile "Ajuste semanal" (gated) |
| `img/t-cm.png` | unused | success-stories page beside Carlos M.'s quote (gated) |
| `testimonial-video.mp4` | testimonials (broken path) | success-stories page, poster frame, plays on tap (gated) |
| `fitmagra-vibes.mp3` | music pill | footer "FitMagra Vibes" player, `preload="none"` |
| Payment logos (`logo-nequi`, `-visa`, `-baloto`, `-avvillas`, `-bancolombia`, `-exito`, `-remitly`, `-western`, `-moneygram`) | payment tabs | "Cómo pagar" FAQ band and the plan detail; renamed without the doubled `.png.png` |
| `img/logo-rosario.png.png` | credentials | about panel, first text block |
| Hero copy, method copy, six pillars | hero, method | intro statement and the copy deck in section 6 |
| Credentials and timeline 2017 to 2026 | about | about panel text blocks |
| 14 countries with coordinates | marquee, globe | proof band (names running off the edges); the 3D globe is dropped (section 6) |
| Stats (450+, 14 countries, 8+ years, 4 equations) | stat counters | intro tile B and the live equations section |
| Seven testimonials | testimonials | success-stories page, quoted verbatim (gated) |
| Three plans, prices, feature lists | pricing | pricing tickets; full feature lists kept verbatim in an expandable list |
| Payment methods and "how it works" steps | payments | FAQ "¿Cómo pago?" until online billing exists |
| Contact details | contact | footer and the closing call to action |
| Slogans "Renueva tu mente", "Cambia tu destino" | marquees | intro tile A, footer |
| `image-slot.js` | loaded, unused | deleted |
| `placeholder.txt` | empty | deleted |

## 5. Brand system

### 5.1 Logo usage rules

The logo is not redrawn, recoloured, rebuilt or re-typeset. Three files exist and each has one job.

- **Official lockup** (`logo oficial1.png`, 1623 by 439, black ground). It is the primary mark, used in the navigation and the member area header. It sits only on black (`--black`), because its PNG has an opaque black ground. Minimum width 140 px on screen. Clear space on every side equals the height of the "SYSTEMS" line.
- **Metal M** (`logo metal.png`, 850 by 540). It is the symbol on its own, used as favicon, app icon and social avatar. Never placed beside the official lockup on the same screen.
- **Neon sign** (`logo neon.jpeg`). It is a photograph of the physical sign, used as a picture, never as a logo.

Do not stretch, rotate, outline, add effects to, or place either logo on green or white fields. Do not set "FitMagra" in a typeface to imitate the logo. When a light-ground version is needed (invoices, email), Roberto supplies an approved file (question Q11).

A vector original would remove the black-box constraint. Requesting it is question Q11, not a redesign.

### 5.2 Colour, sampled from the logo

`scripts/sample-logo-colors.mjs` decodes the logo PNGs with Node built-ins and prints these values. Anyone can rerun it.

| Token | Hex | Source in the logo | Text on it | Contrast (WCAG) |
| --- | --- | --- | --- | --- |
| `--black` | `#000000` | official lockup ground | `--white` | 21:1 |
| `--white` | `#FFFFFF` | MAGRA letters | `--black` | 21:1 |
| `--fit` | `#209858` | FIT panel, most frequent green | `--black` | 5.7:1 |
| `--signal` | `#44C174` | SYSTEMS rules | `--black` | 9.1:1 |
| `--teal` | `#34AF9C` | FIT panel, left end | `--black` | 7.8:1 |
| `--lime` | `#98C840` | metal M, lit face | `--black` | 10.7:1 |
| `--grey` | `#9A9A9A` | anti-aliased letter edge | on `--black` only | 7.5:1 |

The contrast figures are computed from the hex values with the WCAG relative-luminance formula, not measured on screen. White on `--fit` is 3.7:1, which fails body text, so green fields always carry black text. That matches the logo, where FIT is black on green.

Proportions follow the logo. Black is the ground of most public screens. Green appears as whole fields (the FIT panel, enlarged). `--signal` is the accent and appears on the primary action and at most one other element per screen. White is the reading ground for the blog, legal pages and the member area. No gradients, even though the logo's FIT panel has one. Its two ends become two flat fields (`--teal`, `--fit`).

### 5.3 Type

The logo's "AGRA" and "SYSTEMS" are a geometric sans with round bowls and a flat-legged R. Montserrat (SIL Open Font License) is the closest free family and replaces all seven families loaded today. One family, two weights on public pages: 800 for display, 500 for text. The member area adds 400 for dense tables. Fonts are self-hosted as WOFF2 subsets (Latin plus Spanish accents) once the files are downloaded (plan task M1.2). Until then the build links Google Fonts with `display=swap` and the plan records the swap.

Sizes, five steps on any page:

| Step | Size | Use |
| --- | --- | --- |
| Display | `clamp(64px, 9vw, 132px)`, weight 800, tracking -0.03em, leading 0.9 | hero headline, chapter headings, the equation result |
| Heading | `clamp(28px, 3vw, 44px)`, weight 800, leading 1.05 | section headings inside chapters, question text |
| Statement | 22 to 24 px desktop, 18 px phone, weight 500, leading 1.35 | intro text tile, quotes |
| Body | 18 px, weight 500, leading 1.5, measure 45 to 75 characters | running text |
| Small | 15 px, weight 500 | captions, footer links, legal |

No italics, no monospace, no all-caps beyond the three-word slogan tiles, no letter-spaced labels, no text under 13 px.

### 5.4 Space and grid

One 12-column grid. Page margins 20 px on phones, 32 px on desktop. Section gap is the field edge itself on public pages, because chapters butt together (section 6). Inside a field, 56 px padding at desktop and 32 px on phones. Spacing scale 4, 8, 16, 24, 32, 56, 96, 160 px. One corner radius for the whole site, 0 (square), except shapes taken from the logo (the plate shape in section 6).

### 5.5 Components

- **Button.** Flat, square corners, 56 px tall, weight 800, text 18 px. Primary is `--signal` with black text on black fields, black with white text on green or white fields. One primary per screen. No arrows except on the WhatsApp action.
- **Text link.** Underlined, same colour as surrounding text.
- **Navigation.** Official lockup at left, up to five plain links, one action. No blur, no pill, no shadow. It takes the colour of the first chapter (black).
- **Form field** (member area and login). 56 px tall, 2 px black border on white, label above in body size. Form fields may have borders; the Taste skill exempts them.
- **Table** (member area and admin). Rules between rows allowed. Tabular figures.
- **Notice band.** Full-width field in `--lime` with black text for billing warnings and the "coming soon" notice.

### 5.6 Imagery

The project's own photographs first. Square corners, no shadows, no rounded frames. One photograph per chapter at most on the home page. Client photographs appear only on the success-stories page and carry the consent gate. Every image ships with width, height, alt text in Spanish and English, `loading="lazy"` below the first screen and a WebP derivative when the build can produce one (plan task M1.5).

### 5.7 Voice

Mauricio speaks to one person, in Spanish first, with "tú". Short declarative sentences. The specific number beats the adjective ("en 1 a 3 días hábiles", not "rápido"). Science words stay when they are true and explained once ("cuatro ecuaciones de metabolismo basal"). No promises of results, since results vary and the page says so. Words to avoid in either language: "transforma tu vida", "desbloquea", "potencia", "revolucionario", "de élite" as filler, "no es X, es Y". All copy passes pstack unslop and the Taste copy rules before merge.

## 6. Art direction (Taste skill)

### 6.1 Direction

`draw.mjs --sector health --keep palette,type --have photography,video --options 3` dealt three directions: colour chapters, dressed as something else, and the place carries it. Chosen: **colour chapters** (seed 1347413156). The logo is literally two flat fields, a green FIT panel and white MAGRA on black. Chapters in those fields carry a FitMagra-only idea, and the other two directions do not. The place direction needs one dominant landscape, and Mauricio's world is a studio, not a view.

Idea sentence: on this page, **the logo's two fields (the green FIT panel and the black MAGRA ground)** become **the colour chapters**. Green chapters hold what the client does (the equations, the stages, the plans). Black chapters hold the proof and the person. Competitor test: another Bogotá coach's logo is not these two fields, so the sentence fails for them.

The one live thing: **"Tus cuatro números"**. The visitor types sex, age, weight, height and optional body-fat percentage and sees their basal metabolic rate from the four equations the current site already names (Harris-Benedict revised 1984, Mifflin-St Jeor 1990, Cunningham 1980, Oxford/Henry 2005), each on the barbell-plate shape from the logo. It works with a thumb on a phone. Without JavaScript the section shows the four formulas as a table. It says plainly that the result is an estimate, not a prescription.

Redraws and substitutions, each with its reason:

- Dealt photographs (the "Forest" set) are not used. FitMagra has its own photographs, which the sheet ranks first.
- Footer blueprint "the mark, built large" rebuilds the wordmark from blocks. Roberto requires the logo unchanged, so the footer uses the neon-sign photograph at full width instead.
- The pricing blueprint shows one ticket. FitMagra has three plans, so the page prints three tickets, stacked, with the same geometry.

### 6.2 The argument of the home page

Each section exists because it proves one claim.

| Claim | Proof | Section and field |
| --- | --- | --- |
| A coach builds your plan with your name on it | Mauricio's name, the free assessment button | Hero, black field, giant green plate shape |
| The method joins training, nutrition and biochemistry | 450+ clients, the method text, a photo of Mauricio training | Intro tiles, black and green |
| The calories come from four equations, not a guess | the visitor's own four numbers | Live equations, green field |
| People in 14 countries use it | the country names | Proof band, teal |
| Mauricio is qualified | Universidad del Rosario master's degree, timeline | About, inset black panel |
| Starting is three steps | assessment, plan in 1 to 3 days, weekly adjustment | How it works, white field with green tiles |
| It costs a known monthly price | three tickets in COP with USD reference | Pricing, lime field |
| The usual doubts have answers | six questions | FAQ bands, alternating black and green |
| Start this week | one button | Closing call to action, inverted |

The 3D globe, stat counters, both marquees, the theme toggle and the language-swapping script are dropped. Countries become the proof band. The stats move into the intro tiles and the copy. ES and EN become two real URL trees (section 7).

### 6.3 Copy deck (Spanish; English follows the same structure in the plan)

Navigation: Método, Historias, Planes, Blog, Entrar. Action: Agenda tu valoración.

Hero headline (22 characters, two lines): **Tu plan, / con tu nombre**. The wording comes from a client's testimonial ("un plan con mi nombre, mis exámenes y mis objetivos").
Supporting sentence: Mauricio Sánchez, magíster en Actividad Física y Salud, diseña tu entrenamiento y tu alimentación y los ajusta contigo cada semana.
Primary button: Agenda tu valoración (WhatsApp, prefilled message). Text link: Ver planes.

Intro tile A: RENUEVA / TU MENTE. Tile B: 450+. Tile C: `coach-green.jpg`.
Intro text: FitMagra empezó en 2017 con clientes presenciales en Bogotá. Hoy Mauricio asesora a distancia a personas en 14 países, desde pacientes que se recuperan de una cirugía hasta un médico que se prepara para OceanMan. El método junta tres oficios en un plan: entrenamiento periodizado, nutrición clínica y bioquímica aplicada. Tu gasto calórico sale de cruzar cuatro ecuaciones. La suplementación se elige por su nivel de evidencia. Y cada semana revisas con Mauricio tus datos reales para decidir qué cambia.

Live equations heading: Tus cuatro números. Note under the result: Es una estimación de tu metabolismo basal en reposo, no una prescripción. Tu plan usa además tu actividad, tus exámenes y tu historia.

Proof band: Colombia, México, Estados Unidos, España, Argentina, Chile, Ecuador, Perú, Venezuela, Brasil, Uruguay, Costa Rica, Panamá, Guatemala. Sentence below: Personas en estos 14 países han entrenado con un plan FitMagra. Link: Ver historias.

About heading: Mauricio Sánchez, / tu coach desde 2017.
Block "Formación": Magíster en Actividad Física y Salud, Universidad del Rosario, 2021. Certificación en entrenamiento personal y nutrición deportiva. Especialización en bioquímica aplicada al ejercicio.
Block "Trayectoria": En 2017 entrenaba clientes en Bogotá. En 2019 llegaron los primeros casos clínicos, posoperatorios y atletas. En 2021 terminó la maestría. Desde 2023 asesora a distancia en 14 países.
Button: Agenda tu valoración.

How it works heading: Cómo empezamos.
Valoración: 30 minutos por WhatsApp o video para conocer tu punto de partida. No cuesta nada.
Tu plan: Entrenamiento, alimentación y suplementación con tu nombre, listos en 1 a 3 días hábiles.
Ajuste semanal: Revisamos tu peso, tus entrenos y tus fotos, y el plan cambia según tu respuesta.

Pricing heading: Planes. Three tickets, monthly price in COP, USD reference at the configured rate, three key lines, then "Todo lo que incluye" expanding to the full current feature list unchanged. Actions: Empezar con Standard, Empezar con Elite, Empezar con Platino (WhatsApp until online billing is live). Line under the tickets: Pago mensual. Pagando 2 o 3 meses por adelantado ahorras 10 % o 15 % (pending question Q14).

FAQ heading: Preguntas.
- ¿Cómo es la valoración? Son 30 minutos por WhatsApp o video, sin costo ni compromiso. Sales sabiendo tu punto de partida y qué puedes lograr.
- ¿Qué recibo y cuándo? Tu plan de entrenamiento, alimentación y suplementación, en 1 a 3 días hábiles después del pago.
- ¿Cómo pago? Hoy por Nequi, Daviplata, tarjeta con SumUp, Bancolombia, AV Villas, Efecty o Baloto. Desde el exterior, por Remitly, Western Union o MoneyGram. Envías el comprobante por WhatsApp.
- ¿Funciona fuera de Colombia? Sí. Todo es a distancia y hay clientes en 14 países. Los precios están en pesos con referencia en dólares.
- ¿Qué pasa si me estanco? El plan trae un árbol de decisión que dice qué ajustar, y tienes soporte por WhatsApp.
- ¿Qué es MagraMind? Un asistente con inteligencia artificial que aprenderá el método de Mauricio. Está en preparación y todavía no responde consultas.

Closing (inverted field): Tu plan / empieza esta semana. Sentence: Agenda 30 minutos con Mauricio, sin costo. Button: Agenda tu valoración.

Footer: neon-sign photograph, links, contact lines, FitMagra Vibes player, © 2026 FitMagra Systems, Términos, Privacidad.

### 6.4 Other pages

- **Historias** (`/historias/`, `/en/stories/`). Black field. Headline "Historias reales" over the disclaimer "Los resultados varían según adherencia y condición inicial." Then photographs at uneven sizes (Taste direction "photographs at uneven sizes" for this page only, because the home page owns colour chapters), each with its label (Recomposición, 90 días). The seven quotes interleave at statement size, verbatim. The video testimonial sits at 16:9 with a poster frame. Closes with the same call to action.
- **Blog** (`/blog/`, `/en/blog/`). White reading field, black text, one green chapter header. Empty state: "Mauricio está escribiendo. Los primeros artículos llegan pronto." plus the RSS link.
- **Legal** (`/terminos/`, `/privacidad/`). White field, body text. Content comes from Roberto's lawyer (Q9). Placeholder pages say so in one line and block cutover.
- **Member area and admin.** The Taste skill is not for app screens. They use the brand tokens on white with black text, `--fit` for actions, form and table components from section 5.5, and the official lockup on a black header bar.

## 7. Information architecture and routes

| Path | Served by | Notes |
| --- | --- | --- |
| `/`, `/en/` | static | home |
| `/historias/`, `/en/stories/` | static | success stories |
| `/blog/`, `/blog/<slug>/`, `/en/blog/…` | static | blog |
| `/blog/rss.xml`, `/en/blog/rss.xml`, `/sitemap.xml`, `/robots.txt` | static | generated |
| `/terminos/`, `/privacidad/` | static | legal |
| `/entrar/`, `/entrar/clave/` | Worker | login, set password from an invite or reset link |
| `/app/…` | Worker | member area, Spanish only at first (Q15) |
| `/admin/…` | Worker | admin, role `admin` only |
| `/api/billing/webhook` | Worker | provider events, signature verified |
| `/media/…` | static | public images and video |

Language: Spanish at the root, English under `/en/`, each page linked to its twin with `hreflang`. No automatic redirect by browser language.

## 8. Stack decision

Arena result, see section 8.3. Decision: **a zero-dependency static build plus one TypeScript Worker on Cloudflare, with D1 for data and a private R2 bucket for photos and plan PDFs, and in-house login.**

### 8.1 Shape

- `site/` holds page templates as ES modules that return HTML strings, the brand stylesheet and the small scripts (equations, video, music). `content/blog/` holds Markdown posts. `scripts/build.mjs` writes `dist/` (all public pages in both languages, RSS, sitemap) with Node built-ins only.
- `worker/` holds the Worker. Wrangler's `assets` config serves `dist/`, and `run_worker_first` sends `/entrar/*`, `/app/*`, `/admin/*` and `/api/*` to the Worker. Every other path is a static file with no Worker invocation.
- `migrations/` holds D1 SQL. Tests run with `node --test`, using `node:sqlite` behind a 40-line adapter with the D1 method shapes (`prepare`, `bind`, `first`, `all`, `run`, `batch`), so the same SQL runs in tests and on D1.
- TypeScript is written in the erasable subset (no enums, no namespaces, no parameter properties), so Node 26 runs it directly and Wrangler bundles it. Type checking with `tsc --noEmit` arrives when installs are allowed (plan task M4.0). Until then types document intent, and tests carry the safety.

### 8.2 Alternatives and why each lost

| Alternative | Why it lost here |
| --- | --- |
| Astro with content collections and the Cloudflare adapter | The best fit for the blog. It needs `npm install`, which this session cannot run, so no milestone could be built or verified now. It stays the named upgrade if the static build script grows past about 400 lines or a CMS needs it. |
| Hono or similar with server-rendered JSX for every page | Puts a Worker invocation on every public page view for pages that never change, and needs installs. |
| Supabase or Firebase for auth and data, Workers for static files | A second vendor holding health data and photos outside Cloudflare, a second bill and a second privacy agreement, for a member count in the hundreds. |
| Cloudflare Access as the login | Login-only and admin-provisioned for free, but free only up to 50 users, then billed per user per month, and members see a Cloudflare-branded one-time-code screen. Kept as the fallback if in-house auth fails review. |
| Clerk or Auth0 | Solid restricted-signup and invite flows, with a monthly cost per active user and a JS SDK on every member page. Rejected on cost and weight at this size, reconsidered if Mauricio wants social login. |
| Keep the single `index.html` | Cannot host a blog, a member area or billing, and its defects (section 3) are cheaper to leave behind than to patch. |

### 8.3 Arena record

Three independent runners received the same brief (requirements, the Node-only tool limit, the Taste rules). Two returned ADRs. The third stopped when the session was interrupted for an effort change and was not re-run. Both finished runners chose this shape independently. The synthesis note and grafts are in the companion plan's appendix A.

## 9. Blog

Content model, one Markdown file per post at `content/blog/<lang>/<slug>.md`, with front matter:

```text
title: string, required, 70 characters or fewer
description: string, required, 160 characters or fewer
date: YYYY-MM-DD, required
lang: es | en, required, must match the folder
slug: kebab-case, required, unique per language
translation: slug of the twin post in the other language, optional
cover: path under /media/blog/, optional, with cover_alt required when cover is set
tags: list of strings, optional
draft: true | false, default false
```

The build parses front matter, rejects invalid posts with a file and field in the error, skips drafts, sorts by date and writes the listing, one page per post, RSS 2.0 per language and the sitemap. Each post page carries a canonical URL, `hreflang` pairs, Open Graph and Twitter tags and `BlogPosting` JSON-LD. Markdown support is a small subset (headings, paragraphs, lists, links, images, emphasis, blockquotes) with HTML escaped. The renderer carries a `ponytail:` comment naming that ceiling and the upgrade (a Markdown library or Astro) for the day a post needs tables or footnotes.

The blog ships empty. The build test uses a fixture post outside `content/` to prove the listing, post, RSS and sitemap paths. A git-based CMS (Pages CMS, Decap or Sveltia) can write the same Markdown files later through a pull request, so Mauricio would publish without a developer. Which one is question Q10.

## 10. Member access control

Login only. There is no signup route, form or API.

- **Provisioning.** An admin creates a member with name, email, plan and starting subscription status. The system creates a single-use invite token (32 random bytes, only its SHA-256 stored, valid 72 hours) and shows the link once. The admin sends it over WhatsApp. No email is sent until Roberto picks an email provider (Q16).
- **First admin.** `scripts/create-admin.mjs` prints the SQL for one admin user and an invite link. Roberto runs it with `wrangler d1 execute` against the target database. Nothing runs it automatically.
- **Passwords.** PBKDF2-SHA256 through WebCrypto, 100,000 iterations (the Workers limit), a 16-byte random salt per user, stored as `pbkdf2$100000$<salt>$<hash>` so the parameters can rise later. Minimum 10 characters. Comparison in constant time. Two arena runners guessed that 100,000 iterations may exceed the Workers Free plan's 10 ms CPU limit per request. Nobody has measured it. Plan task M4.3 times it on the real runtime before staging, and the Workers Paid plan (USD 5 a month) is spending question Q22.
- **Sessions.** 32 random bytes in a cookie named `__Host-fm_session` (`Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`). D1 stores only the SHA-256 of the token, with expiry 30 days and sliding renewal after 24 hours. Logout deletes the row.
- **CSRF.** Every state-changing request is a POST, and the Worker rejects one whose `Origin` header does not match the site.
- **Reset.** Only an admin issues a reset link (valid 24 hours, because a person relays it by WhatsApp; single use), which also ends the member's sessions. There is no self-service "forgot password" until email exists; the login page says to write to Mauricio on WhatsApp.
- **Deactivation.** Status `deactivated` refuses login and deletes sessions in the same transaction. Data stays until the retention rule in section 12 applies. Reactivation sends a new invite.
- **Roles.** `member` and `admin`, one per user, checked by one guard per route group.
- **Rate limits.** Five failed logins per email per 15 minutes, and 20 per IP, then a 15-minute refusal with the same generic message ("Correo o contraseña incorrectos").
- **Audit.** Every admin action (create, reset, deactivate, reactivate, plan change, billing override, document upload) writes an audit row with actor, target and time.

## 11. Member area

Every member has one subscription row, created at provisioning, which carries the assigned plan (Standard, Elite or Platino). The member sees, on their phone first:

| Screen | Content |
| --- | --- |
| Inicio | plan, billing status, latest weight with change since the first entry, date of the last photo set, a quick weight entry |
| Peso | list and line of weight entries (date, kg, optional body fat and waist) |
| Entrenos | logged workouts (date, title, minutes, effort 1 to 10, notes) |
| Fotos | private progress photos by date and pose (frente, perfil, espalda); upload from the phone |
| Plan | the current training plan PDF that Mauricio uploaded |
| Nutrición | the current nutrition plan PDF, daily targets (kcal, protein, carbohydrate, fat) and today's log by meal with totals against targets |
| Coach IA | "Próximamente" notice, a sample conversation clearly labelled as a demonstration, a disabled input. No model is called. |
| Cuenta | change password, billing status and history, log out |

Admin sees a member list (plan, subscription status, last activity), a member page (all of the above read-only, plus upload plan PDFs, set nutrition targets, change plan, reset link, deactivate) and the billing view (section 13).

### 11.1 Data model (D1, SQLite)

Quantities are integers in their smallest unit, so no floating point reaches the database.

```text
users(id TEXT PK, email TEXT UNIQUE COLLATE NOCASE, name TEXT, role CHECK IN ('member','admin'),
      status CHECK IN ('invited','active','deactivated'), password_hash TEXT NULL, created_at, updated_at)
sessions(token_hash TEXT PK, user_id FK, created_at, expires_at)
auth_tokens(token_hash TEXT PK, user_id FK, purpose CHECK IN ('invite','reset'), expires_at, used_at NULL)
login_failures(key TEXT, at INTEGER)                      -- key is 'email:<x>' or 'ip:<x>'
subscriptions(user_id PK FK, plan CHECK IN ('standard','elite','platino'),
      status CHECK IN ('pending','active','past_due','cancelled'), current_period_end DATE NULL,
      grace_until DATE NULL, cancel_at_period_end INTEGER, provider TEXT NULL, provider_ref TEXT NULL, updated_at)
payments(id PK, user_id FK, period_start DATE, amount_cop INTEGER, status CHECK IN ('pending','paid','failed','refunded'),
      provider_ref TEXT NULL, attempts INTEGER, created_at, updated_at)
billing_events(provider_event_id TEXT PK, provider TEXT, kind TEXT, user_id NULL, received_at, payload TEXT)
weights(id PK, user_id FK, measured_on DATE, weight_g INTEGER, body_fat_pct_x10 INTEGER NULL, waist_mm INTEGER NULL, note TEXT NULL)
workouts(id PK, user_id FK, performed_on DATE, title TEXT, minutes INTEGER NULL, effort INTEGER NULL CHECK BETWEEN 1 AND 10, notes TEXT NULL)
photos(id PK, user_id FK, taken_on DATE, pose CHECK IN ('front','side','back','other'), r2_key TEXT UNIQUE, content_type TEXT, bytes INTEGER, created_at)
documents(id PK, user_id FK, kind CHECK IN ('training_plan','nutrition_plan'), title TEXT, r2_key TEXT UNIQUE, published_at)
nutrition_targets(user_id PK FK, kcal INTEGER, protein_g INTEGER, carbs_g INTEGER, fat_g INTEGER, updated_at)
nutrition_logs(id PK, user_id FK, eaten_on DATE, meal CHECK IN ('breakfast','lunch','dinner','snack'), description TEXT,
      kcal INTEGER NULL, protein_g INTEGER NULL, carbs_g INTEGER NULL, fat_g INTEGER NULL)
audit_log(id PK, actor_id FK, action TEXT, target_user_id NULL, at, detail TEXT NULL)
```

Every member query filters by the session's user id inside the query itself (`WHERE user_id = ?`). Admin queries live in their own module behind the admin guard. Workouts stay free text on purpose. A sets-and-reps model waits until Mauricio's plans need it.

### 11.2 Private files

One private R2 bucket with no public access and no custom domain. Keys are `u/<user_id>/photos/<uuid>.jpg` and `u/<user_id>/docs/<uuid>.pdf`. The browser resizes photos to at most 2,000 px on the long side and re-encodes them to JPEG with a canvas, which drops EXIF data including GPS. The Worker checks the size (8 MB or less) and the magic bytes before storing. Downloads go through `/app/files/<id>`, which loads the row, checks that the owner is the session user or an admin, and streams the object with `Cache-Control: private, no-store`. There are no signed public URLs.

## 12. Privacy and security

Progress photos, weight and nutrition are health data, and Colombian data-protection law treats health data as sensitive and requires prior, express, informed consent (Ley 1581 de 2012 and Decreto 1377 de 2013, to be confirmed by Roberto's lawyer, Q9). The design gives that lawyer something concrete to approve.

- Consent recorded at first login: a checkbox with the data-treatment policy text and its version, stored with a timestamp. No consent, no member data screens.
- Success-stories consent: `content/stories.json` lists each client image and quote with `consent: "unverified" | "written"`. The build prints every unverified item. The cutover checklist fails while any public item is unverified.
- Retention: deactivated members' photos are deleted 90 days after deactivation unless they ask otherwise (proposed default, Q9). Account deletion on request through the admin page removes D1 rows and R2 objects in one admin action, logged.
- Security headers on every response: `Content-Security-Policy` with `default-src 'self'` and the WhatsApp and font origins, `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` without camera except on the photo upload page.
- The public page stops publishing the national ID number and account numbers. They move to the WhatsApp reply a client gets after choosing a plan (proposed default, Q17).
- No secrets in the repo. Local values live in `.dev.vars` (ignored by git), described in `.dev.vars.example`. Production values are Wrangler secrets that Roberto sets.

## 13. Billing (provider-agnostic)

Roberto requires a monthly recurring payment for every member. The provider is undecided and depends on the research doc. This section defines everything that does not depend on the provider.

### 13.1 Subscription states

```text
pending    --payment succeeded-->        active
active     --period ends unpaid or charge fails--> past_due (grace_until = today + 7 days)
past_due   --payment succeeded-->        active (new period)
past_due   --grace_until passes-->       cancelled
active     --member or admin cancels-->  active with cancel_at_period_end, then cancelled at period end
cancelled  --admin reactivates and payment succeeds--> active
any        --admin override-->           any, with an audit row
```

The transition function is pure and table-driven (`worker/billing/state.ts`), so tests cover every pair of state and event, including the illegal ones, which return an error and change nothing.

Time-driven transitions (period end passing, grace ending) are not stored by a scheduled job. The access check computes them from `current_period_end`, `grace_until` and today's date on every request, so a missed job can never leave a member with the wrong access. The admin view shows the same computed state. A Cron Trigger is added only if reminders become automatic (Q16).

### 13.2 Access by state

| State | Member sees |
| --- | --- |
| `active` | everything |
| `past_due`, inside grace | everything, plus a lime notice with days left and the pay button |
| `pending`, `cancelled`, or past grace | the Cuenta screen (billing and history) and read-only export of their own data; no logging, no uploads |
| user `deactivated` | cannot log in |

Data is never deleted because of non-payment. Only the retention rule in section 12 deletes it.

### 13.3 Dunning

Reminders on day 0, day 3 and day 6 of `past_due`. Until an email or WhatsApp sending channel is approved, the admin billing view lists who is due for a reminder that day with a prefilled WhatsApp link, and Mauricio sends it by hand. Provider-side card retries, where the provider offers them, are configured in the provider and reported back through webhooks.

### 13.4 Provider boundary

```text
interface BillingProvider {
  name: string
  startCheckout(input: { userId, plan, amountCop, returnUrl }): Promise<{ redirectUrl }>
  parseEvent(request: Request): Promise<BillingEvent>   // verifies the signature or throws
  cancel(input: { providerRef }): Promise<void>
}
BillingEvent = { kind: 'payment_succeeded' | 'payment_failed' | 'subscription_cancelled', providerEventId, userId, periodEnd?, amountCop? }
```

Webhook handling is idempotent. The event id is the primary key of `billing_events`, so a repeated delivery changes nothing.

Two adapters ship before any provider is chosen, and neither is a provider choice:

- `manual`. An admin records a payment received by today's methods (Nequi, Daviplata, bank transfer, Efecty, Remitly) with amount, method and reference. It goes through the same event path as a webhook, so the state machine and audit log see one shape. This is how FitMagra is paid today, and it may remain the path for methods that cannot debit automatically. Allowed in every environment.
- `stub`. It redirects to a local page with "simulate success" and "simulate failure" buttons. The Worker refuses it unless `ENVIRONMENT` is not `production`.

A plan payment covers `interval_months` months (1, 2 or 3), so the current 2- and 3-month prepaid terms fit without a second billing model (Q14).

The real provider adapter is milestone M7, gated on Roberto's choice (Q2) and on the research doc. DIAN electronic invoicing is a provider and accountant question (Q4) that this design leaves to that milestone.

### 13.5 Admin billing view

Counts by state, members past due with days left and a reminder link, recent payments and failures, and the manual override (mark paid, extend grace, cancel), each requiring a reason that goes to the audit log.

## 14. Hosting on Cloudflare Workers

- **One Worker, static assets plus code.** `wrangler.jsonc` points `assets.directory` at `dist/`, sets `not_found_handling: "404-page"` and `run_worker_first` to the four Worker path groups, and binds `DB` (D1), `FILES` (R2) and `ASSETS`.
- **Environments.** `dev` (local `wrangler dev` with local D1 and R2), `staging` (`env.staging`, its own Worker name, D1 database and bucket, on a `workers.dev` hostname behind Cloudflare Access, with a preview banner and `noindex`), `production` (top level, custom domain). Staging data is never production data.
- **Preview per pull request.** `wrangler versions upload` gives a preview URL without changing traffic. Roberto runs it or approves a CI job for it (Q1).
- **Domain cutover**, run by Roberto, in order: confirm who owns the domain and where its DNS lives (Q1); move DNS to Cloudflare if it is elsewhere; deploy production to its `workers.dev` hostname and run the cutover checklist there; attach the custom domain to the Worker; check HTTPS, `www` redirect, `sitemap.xml` and a login; keep the old host untouched for 14 days.
- **Mail.** Cutover changes only the web records. MX and other mail records stay as they are.
- **Rollback.** `wrangler rollback` returns traffic to the previous version in one command. D1 Time Travel restores data to a point in time if a migration or admin action damages it. Versions are immutable, so the previous build stays deployable. D1 migrations only add columns or tables until the release after the one that used them, so a code rollback never meets a schema it cannot read. Cutting DNS back to the old host is the last resort and is written in the runbook.
- **Cutover checklist** (fails closed): every consent item is `written`; legal pages have lawyer text; billing provider is not `stub` in production, or billing is disabled; secrets are set; the Taste inspector passes; page-weight budgets pass; a member can log in, add a weight and upload a photo on staging.

## 15. Performance budgets

These are targets, not measurements. Nothing has been measured in a browser this session.

| Budget | Target | How it is checked |
| --- | --- | --- |
| Home page first-load transfer, excluding the video and the music | 600 KB or less | `scripts/check-budgets.mjs` sums the bytes of every file the built page references before user interaction, from `dist/`, so the number has no network noise |
| JavaScript on public pages | 20 KB or less uncompressed | same script |
| Hero image or shape | no raster image needed for the first screen | the hero is a CSS shape and text |
| Largest Contentful Paint, mobile | 2.5 s or less | Lighthouse mobile preset, once installs or a browser run are available, 5 runs, median and range reported per the benchmark checklist, with the limiter named (expected to be the font file or the first photograph) |
| Cumulative Layout Shift | 0.05 or less | same runs |

Today's page already exceeds the first budget before any measurement. Its own files referenced on load include the 4.7 MB music file with `preload="auto"`, 302 KB for the hero photo and seven font families. That figure comes from file sizes on disk, not a network trace, and browsers may not honour `preload="auto"` in full.

## 16. Milestones

Each milestone is one branch and one pull request against `main`, small enough to review in one sitting, shippable without the next one, and verified before its PR opens. Branches stack: each cuts from the previous milestone's branch, and each PR body names the PR it builds on. Merging stays with Roberto.

| ID | Delivers | Acceptance checks |
| --- | --- | --- |
| M0 | This spec and the plan | both files exist; unslop pass on both |
| M1 | Brand tokens, static build, new ES/EN home page, live equations, all media reorganised, broken links fixed, `wrangler.jsonc` with static assets | `node --test` passes; build writes both home pages; every local reference in `dist/` resolves; Taste lint and inspector pass or their unavailability is recorded; budgets script passes; equations match published worked examples |
| M2 | Success-stories pages with consent data | pages build in both languages; every image and quote from section 4 appears; build lists unverified consent items |
| M3 | Empty blog with listing, post template, RSS, sitemap, SEO | fixture post renders; RSS validates as XML with zero items when empty; sitemap lists every public page; invalid front matter fails the build with file and field |
| M4 | Worker, D1 schema, login, invites, reset, deactivation, roles, rate limits, audit | tests cover login success and failure, lockout, invite and reset single use and expiry, deactivation killing sessions, member blocked from admin routes, no signup route |
| M5 | Member area screens and data, private photo storage, plan PDFs, nutrition targets and log, Coach IA "próximamente" | tests prove a member reads and writes only their own rows and files; upload rejects wrong type and size; Coach IA makes no network call |
| M6 | Billing domain with the stub provider, access gating, dunning list, admin billing view | every state and event pair tested; access matrix tested; webhook replay is a no-op; stub refused in production config |
| M7 | Real payment adapter | gated: starts only after Roberto picks the provider from the research doc |
| M8 | Cutover runbook, staging config, checklist script | checklist script fails on the current content (consent unverified) and passes on a fixture that meets every item |

## 17. What implementation is approved to do

Approved (Roberto, 15:11): branches, commits, pushes of feature branches to `origin`, one PR per milestone against `main`, local builds and local `wrangler dev`.
Not approved: merging, pushing to `main`, deploying or publishing anything to Cloudflare, production changes, spending, live payment credentials, sending messages to clients, changing Claude settings.

## 18. Open questions for Roberto

Each question has the default the build uses until Roberto answers. Every default is reversible.

| # | Question | Default used now |
| --- | --- | --- |
| Q1 | Which Cloudflare account owns the Worker, who owns the FitMagra domain, and where is its DNS today? | config uses placeholder names; nothing deployed |
| Q2 | Which payment provider, after reading the research doc? | `stub` provider only |
| Q3 | Who provisions member credentials day to day, Mauricio, Roberto or both, and who is the first admin? | both are admins |
| Q4 | Which billing entity issues DIAN electronic invoices, with which NIT, and does the provider or an accountant issue them? | no invoicing in code |
| Q5 | The monthly price in COP for each plan, and whether prices include IVA | today's prices: 250,000, 400,000 and 600,000 COP |
| Q6 | Which auth approach: in-house (this spec), Cloudflare Access, or a third-party provider? | in-house |
| Q7 | Which database and storage: D1 and R2 (this spec) or another? | D1 and R2 |
| Q8 | Analytics: none, Cloudflare Web Analytics (no cookies), or another tool? | none |
| Q9 | Legal review of health data and photos under Ley 1581 de 2012: policy text, consent wording, retention period, registration duties | build blocks cutover until lawyer text exists; 90-day photo retention proposed |
| Q10 | Blog CMS: Markdown in git edited by a developer, or a git-based CMS (Pages CMS, Decap, Sveltia)? | Markdown in git |
| Q11 | Logo files and font licensing: is there a vector original and a light-ground version, and is Montserrat acceptable? | PNG files on black; Montserrat (OFL) |
| Q12 | Timeline: which milestones matter for which date? | build in milestone order |
| Q13 | Enrollment link: does a new client still start on WhatsApp, or go straight to checkout once billing exists? | WhatsApp |
| Q14 | Do the 2-month and 3-month prepaid discounts survive with monthly billing? | shown as text, not billed |
| Q15 | Does the member area need English at launch? | Spanish only |
| Q16 | Email provider for invites, resets and dunning (and is WhatsApp sending wanted)? | admin copies links by hand |
| Q17 | Keep the national ID and account numbers off the public page? | removed from the page, sent on WhatsApp |
| Q18 | Written consent from every client shown on Historias, and the source of the 4.8 rating | consent marked unverified; rating removed |
| Q19 | Which WhatsApp number is primary (+57 315 361 4260 or +57 316 575 4416) and what is the Instagram handle? | 315 for contact, 316 for payments; no Instagram link |
| Q20 | Several plan features name methods with weak or contested evidence (blood-type prescription, "biodecomposición genética", organ cleansing, Traditional Chinese Medicine) while the page promises Oxford CEBM evidence levels. Keep, reword or drop? | kept verbatim inside "Todo lo que incluye"; flagged for Mauricio |
| Q21 | Add `Mauriciofitmagra/fitmagra-landing` to the brain registry and open the task note | orchestrator action, not done here |
| Q22 | Approve Workers Paid (USD 5 a month) if PBKDF2 login exceeds the Free plan's CPU limit when measured? | not purchased; measured in M4 on the real runtime |
