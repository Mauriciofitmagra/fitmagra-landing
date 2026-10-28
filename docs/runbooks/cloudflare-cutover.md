# Cloudflare cutover runbook

How FitMagra moves from today's hosting to one Cloudflare Worker (spec section 14). Nothing in this file has been run. Every command below is marked **Roberto runs**. An agent may prepare a pull request for the repo side of a step. It never runs a deploy, a `wrangler` command against a Cloudflare account, a `vercel` command, or a DNS change.

The checklist script decides whether cutover may happen:

```text
SITE_URL=https://<production domain> node scripts/build.mjs
SITE_URL=https://<production domain> node scripts/check-cutover.mjs
```

It prints one line per item and exits with code 1 while any item fails. Human sign-offs live in `docs/runbooks/cutover-signoff.json`. Each one needs `"by": "Roberto"` or `"by": "Mauricio"` and a `YYYY-MM-DD` date. An agent cannot sign.

## Gate 0. Vercel, before anything merges to main

This gate comes first because it protects the site that is live today.

The GitHub repo `Mauriciofitmagra/fitmagra-landing` is connected to the Vercel project `mauriciofitmagras-projects/fitmagra`, and every pull request from #2 to #8 shows a failing Vercel preview check. It is likely, not confirmed, that Vercel builds `main` and serves the public site from it. The rebuild removes the root `index.html`, and the new site needs `node scripts/build.mjs` before there is anything to serve. If Vercel deploys `main` the old way, merging any of these pull requests would likely change or break the live site.

Do not merge any of #2 to #8, or this runbook's own pull request, until Roberto or Mauricio has done all of this:

1. **Roberto or Mauricio runs.** Open the Vercel project `mauriciofitmagras-projects/fitmagra` and note which branch deploys to production, which domains point at it, and what the production URL shows now.
2. **Roberto decides.** Either Cloudflare serves the site (this runbook), or Vercel keeps serving it and this runbook does not apply.
3. **Roberto or Mauricio runs**, if the decision is Cloudflare. Stop Vercel from deploying `main` before the first merge. Vercel's project settings offer ways to pause production deployments or to disconnect the Git repository. Keep the current production deployment serving the domain until step 7 of this runbook moves the domain.
4. **Roberto or Mauricio runs**, if the decision is to keep Vercel. Reconfigure the Vercel project to build this site (build command `node scripts/build.mjs`, output directory `dist`). The member area, D1 and R2 parts of this repo need a different backend on Vercel; that is a new design, outside this runbook.
5. **Roberto or Mauricio records it** in `cutover-signoff.json`:

```json
"vercel": { "by": "Roberto", "date": "2026-11-03", "decision": "cloudflare", "liveSiteChecked": true, "note": "Production deploys paused on Vercel; domain still on the old deployment." }
```

The checklist item "Vercel decided before anything merges to main" passes only with `decision` set to `cloudflare`, `liveSiteChecked` true and a valid sign-off.

## Step 1. Accounts and names

**Roberto decides** which Cloudflare account owns the Worker, who owns the FitMagra domain and where its DNS lives today (spec Q1). The repo uses these names.

| Thing | Production | Staging |
| --- | --- | --- |
| Worker | `fitmagra` | `fitmagra-staging` |
| D1 database | `fitmagra` | `fitmagra-staging` |
| R2 bucket (private) | `fitmagra-files` | `fitmagra-files-staging` |
| `ENVIRONMENT` var | `production` | `staging` |
| `BILLING_PROVIDER` var | unset (online payment off) | `stub` |

## Step 2. Create the databases and buckets

**Roberto runs**, once per environment:

```text
npx wrangler login
npx wrangler d1 create fitmagra-staging
npx wrangler d1 create fitmagra
npx wrangler r2 bucket create fitmagra-files-staging
npx wrangler r2 bucket create fitmagra-files
```

Copy each printed `database_id` into `wrangler.jsonc` in place of `REPLACE_WITH_STAGING_D1_ID` and `REPLACE_WITH_PRODUCTION_D1_ID`, in a pull request. The ids are not secrets. Leave both buckets without public access and without a custom domain.

**Roberto runs**, to create the tables:

```text
npx wrangler d1 migrations apply fitmagra-staging --env staging --remote
npx wrangler d1 migrations apply fitmagra --remote
```

Migrations only add tables and columns, so an older Worker version can still read the database after a rollback.

## Step 3. Staging

**Roberto runs:**

```text
node scripts/build.mjs
npx wrangler deploy --env staging
```

Then, in the Cloudflare dashboard, put the staging `workers.dev` hostname behind Cloudflare Access so only Roberto and Mauricio reach it.

**Roberto runs**, to create the first admin on staging:

```text
node scripts/create-admin.mjs --email <admin email> --name "<name>" --origin https://<staging hostname> > admin.sql
npx wrangler d1 execute fitmagra-staging --env staging --remote --file admin.sql
rm admin.sql
```

The invite link prints on the terminal, not into the file. It works once and expires in 72 hours.

## Step 4. Prove it on staging

**Roberto or Mauricio runs**, then signs each line in `cutover-signoff.json`:

- `stagingSmokeTest`. An admin creates a member, the member sets a password from the invite link, accepts the consent, adds a weight, uploads a photo from a phone, and sees the photo. A second member cannot open the first member's photo URL.
- `workersCpuMeasured`. Login works on staging and the Worker's CPU time per login is within the plan's limit, read from the Workers dashboard or `npx wrangler tail --env staging`. If it is over, decide spec Q22 (Workers Paid) before production.
- `tasteInspector`. The Taste inspector run on the staging home, Historias and blog pages shows 0 FAIL.

## Step 5. Production secrets and content

- **Roberto runs** `npx wrangler secret put <NAME>` for each secret production needs. Today there are none. The payment provider adds its own in milestone M7. Sign `secretsSet` when every secret the code reads is set.
- **Mauricio provides**, through a pull request: the lawyer's approved text for `content/legal/terminos.md`, `content/legal/privacidad.md`, `content/legal/terms.md` and `content/legal/privacy.md` (spec Q9, Q18). Drafts are in `docs/drafts/`. Client stories and media are excluded from this release; consent must be obtained before adding them later.

## Step 6. Production on its workers.dev hostname

**Roberto runs:**

```text
SITE_URL=https://<production domain> node scripts/build.mjs
SITE_URL=https://<production domain> node scripts/check-cutover.mjs
npx wrangler deploy
```

Do not deploy unless the checklist printed "All 13 items pass." Create the production admin with `scripts/create-admin.mjs` as in step 3, against `fitmagra` with `--remote` and without `--env`.

## Step 7. Move the domain

**Roberto runs**, in this order:

1. If the domain's DNS is not on Cloudflare yet, add the zone to the Cloudflare account and change the nameservers at the registrar. Copy every existing record first. Leave MX and other mail records exactly as they are.
2. Attach the domain to the `fitmagra` Worker as a Custom Domain (dashboard, or a `routes` entry with `custom_domain: true` in `wrangler.jsonc` through a pull request).
3. Check HTTPS, the `www` redirect, `/sitemap.xml`, `/blog/rss.xml`, one login and one photo view.
4. Keep the old Vercel deployment untouched for 14 days.

## Rollback

| Problem | **Roberto runs** |
| --- | --- |
| A deploy broke the site or the member area | `npx wrangler rollback` returns traffic to the previous version. `npx wrangler deployments list` shows the versions. |
| A migration or an admin action damaged data | D1 Time Travel restores the database to a point in time: `npx wrangler d1 time-travel restore fitmagra --timestamp <ISO time before the problem>`. |
| Cloudflare itself is the problem in the first 14 days | Point the domain back to the old Vercel deployment in DNS. Member-area data stays in D1 and R2 and is not lost. |

## Not covered here

- Choosing and wiring the payment provider (milestone M7, spec Q2, the research doc on branch `research/payments-colombia`).
- DIAN electronic invoicing (spec Q4).
- Email for invites and reminders (spec Q16).
