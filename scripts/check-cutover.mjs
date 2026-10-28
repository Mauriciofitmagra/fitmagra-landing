// The production cutover checklist (spec section 14, runbook docs/runbooks/cloudflare-cutover.md). It fails closed: a missing
// file, an unreadable value or an unsigned item is a failure. Run `node scripts/build.mjs` first, then
// `SITE_URL=https://<domain> node scripts/check-cutover.mjs`. Exit code 0 only when every item passes.
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkLinks } from './check-links.mjs';
import { pageWeight, BUDGETS } from './check-budgets.mjs';

export const stripJsonc = (text) => text.replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str ?? '');
const SIGNERS = ['Roberto', 'Mauricio'];
const read = (root, p) => readFileSync(join(root, p), 'utf8');

// A human sign-off: who (Roberto or Mauricio) and when. Agents cannot sign.
const signedOff = (s) => Boolean(s && SIGNERS.includes(s.by) && /^\d{4}-\d{2}-\d{2}$/.test(s.date ?? ''));

function item(id, label, run) {
  try {
    const detail = run();
    return { id, label, ok: detail === true, detail: detail === true ? 'ok' : detail };
  } catch (e) {
    return { id, label, ok: false, detail: `could not check: ${e.message}` };
  }
}

export function checkCutover({ root, env = process.env }) {
  const signoff = () => JSON.parse(read(root, 'docs/runbooks/cutover-signoff.json'));
  const wrangler = () => JSON.parse(stripJsonc(read(root, 'wrangler.jsonc')));
  const sign = (id, key, label) => item(id, label, () => signedOff(signoff()[key]) || `needs a sign-off by ${SIGNERS.join(' or ')} with a date in cutover-signoff.json (${key})`);
  return [
    item('vercel-decision', 'Vercel decided before anything merges to main', () => {
      const v = signoff().vercel;
      if (!signedOff(v)) return 'Roberto or Mauricio must record the Vercel decision (runbook gate 0)';
      if (v.liveSiteChecked !== true) return 'confirm what the Vercel project serves today (liveSiteChecked)';
      if (v.decision !== 'cloudflare') return `decision is "${v.decision}"; this Cloudflare cutover applies only to "cloudflare"`;
      return true;
    }),
    item('story-consent', 'Client stories and media excluded from the build', () => {
      const media = join(root, 'dist/media');
      const included = readdirSync(media).filter((name) => /^(stories|t-.*|testimonial-video\.mp4)$/.test(name));
      return included.length === 0 || `client media present: ${included.join(', ')}`;
    }),
    item('legal-pages', 'Lawyer-approved Términos and Privacidad', () => {
      for (const [f, output] of [['terminos', 'terminos'], ['privacidad', 'privacidad'], ['terms', 'en/terms'], ['privacy', 'en/privacy']]) {
        const p = `content/legal/${f}.md`;
        if (!existsSync(join(root, p))) return `${p} is missing`;
        if (/PENDIENTE|PLACEHOLDER|TODO/i.test(read(root, p))) return `${p} still has placeholder text`;
        const built = `dist/${output}/index.html`;
        if (!existsSync(join(root, built)) || statSync(join(root, built)).size === 0) return `${built} is missing or empty; rebuild the site`;
      }
      const version = read(root, 'worker/app/consent.ts').match(/export const CONSENT_VERSION = ['"]([^'"]+)['"]/)?.[1];
      if (!version || /borrador|draft|pendiente|todo/i.test(version)) return 'consent version is missing or still a draft';
      const review = signoff().legalReview;
      if (!signedOff(review) || !review.lawyer?.trim() || review.consentVersion !== version) return 'record the lawyer review and matching consent version in cutover-signoff.json';
      return true;
    }),
    item('site-url', 'SITE_URL is the real domain', () => {
      const u = env.SITE_URL ?? '';
      if (!/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}$/.test(u) || u.endsWith('.invalid')) return `SITE_URL is "${u || 'unset'}"; set it to https://<production domain> before building`;
      for (const [path, suffix] of [['dist/index.html', '/'], ['dist/en/index.html', '/en/']]) {
        if (!read(root, path).includes(`<link rel="canonical" href="${u}${suffix}">`)) return `${path} was not built with SITE_URL=${u}`;
      }
      return true;
    }),
    item('database-ids', 'Real D1 ids in wrangler.jsonc', () => {
      const c = wrangler();
      const ids = [...c.d1_databases, ...(c.env?.staging?.d1_databases ?? [])].map((d) => d.database_id ?? '');
      return ids.every((id) => id && !id.startsWith('REPLACE_')) || 'database_id values are still placeholders';
    }),
    item('billing-provider', 'No stub billing in production', () => {
      const p = wrangler().vars?.BILLING_PROVIDER;
      return p !== 'stub' || 'production vars set BILLING_PROVIDER=stub';
    }),
    item('dist-built', 'dist/ is built', () => {
      for (const p of ['dist/index.html', 'dist/en/index.html']) if (!existsSync(join(root, p)) || statSync(join(root, p)).size === 0) return `${p} is missing or empty; run node scripts/build.mjs`;
      return true;
    }),
    item('links', 'Every local link in dist/ resolves', () => {
      const missing = checkLinks(join(root, 'dist'));
      return missing.length === 0 || `${missing.length} missing, first: ${missing[0].page} -> ${missing[0].ref}`;
    }),
    item('budgets', 'Home pages within page-weight budget', () => {
      for (const p of ['index.html', 'en/index.html']) {
        const w = pageWeight(join(root, 'dist'), p);
        if (w.total > BUDGETS.homeTotal || w.code > BUDGETS.pageCode || w.js > BUDGETS.pageJs) return `${p} is over budget`;
      }
      return true;
    }),
    sign('signoff-secrets', 'secretsSet', 'Production secrets set with wrangler secret put'),
    sign('signoff-taste', 'tasteInspector', 'Taste inspector run on staging with 0 FAIL'),
    sign('signoff-staging', 'stagingSmokeTest', 'Staging: a member logs in, adds a weight and uploads a photo'),
    sign('signoff-workers-cpu', 'workersCpuMeasured', 'Login CPU time measured on Workers (spec Q22)'),
  ];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const items = checkCutover({ root });
  for (const i of items) console.log(`${i.ok ? 'ok  ' : 'FAIL'} ${i.label}${i.ok ? '' : `: ${i.detail}`}`);
  const failed = items.filter((i) => !i.ok).length;
  console.log(failed ? `${failed} of ${items.length} items fail. Do not cut over.` : `All ${items.length} items pass.`);
  process.exit(failed ? 1 : 0);
}
