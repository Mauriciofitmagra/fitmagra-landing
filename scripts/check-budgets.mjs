// Page-weight budgets from spec section 15, counted from files in dist/ (no network, so no run-to-run noise).
// Counts what a page loads before interaction: the HTML, stylesheets and their local url()s, scripts and
// their static imports, images and posters. Media with preload="none" and plain links are not counted.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { htmlPages, resolveRef } from './check-links.mjs';

export const BUDGETS = { homeTotal: 600 * 1024, pageCode: 100 * 1024, pageJs: 20 * 1024 };

export function pageWeight(dir, page) {
  const html = readFileSync(join(dir, page), 'utf8');
  const seen = new Set();
  const w = { html: html.length, css: 0, js: 0, media: 0 };
  const add = (from, ref, kind) => {
    const target = resolveRef(dir, from, ref);
    if (!target || seen.has(target) || !existsSync(join(dir, target))) return;
    seen.add(target);
    const body = readFileSync(join(dir, target));
    w[kind] += body.length;
    if (kind === 'js') for (const m of body.toString().matchAll(/(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]/g)) add(target, m[1] ?? m[2], 'js');
    if (kind === 'css') for (const m of body.toString().matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) add(target, m[1], 'media');
  };
  for (const m of html.matchAll(/<link\b[^>]*>/g)) {
    const href = m[0].match(/href="([^"]+)"/)?.[1];
    if (href && /rel="stylesheet"/.test(m[0])) add(page, href, 'css');
    else if (href && /rel="(?:preload|modulepreload)"/.test(m[0])) add(page, href, /as="script"|modulepreload/.test(m[0]) ? 'js' : 'media');
  }
  for (const m of html.matchAll(/<script\b[^>]*\ssrc="([^"]+)"/g)) add(page, m[1], 'js');
  for (const m of html.matchAll(/<img\b[^>]*\ssrc="([^"]+)"/g)) add(page, m[1], 'media');
  for (const m of html.matchAll(/<(audio|video)\b([^>]*)>/g)) {
    const attrs = m[2];
    const poster = attrs.match(/poster="([^"]+)"/)?.[1];
    if (poster) add(page, poster, 'media');
    const src = attrs.match(/\ssrc="([^"]+)"/)?.[1];
    if (src && !/preload="none"/.test(attrs)) add(page, src, 'media');
  }
  return { js: w.js, code: w.html + w.css + w.js, total: w.html + w.css + w.js + w.media };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = fileURLToPath(new URL('../dist/', import.meta.url));
  let failed = 0;
  const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
  for (const page of htmlPages(dir)) {
    const w = pageWeight(dir, page);
    const home = page === 'index.html' || page === 'en/index.html';
    const problems = [];
    if (home && w.total > BUDGETS.homeTotal) problems.push(`total over ${kb(BUDGETS.homeTotal)}`);
    if (w.code > BUDGETS.pageCode) problems.push(`html+css+js over ${kb(BUDGETS.pageCode)}`);
    if (w.js > BUDGETS.pageJs) problems.push(`js over ${kb(BUDGETS.pageJs)}`);
    failed += problems.length;
    console.log(`${problems.length ? 'FAIL' : 'ok  '} ${page.padEnd(28)} total ${kb(w.total).padStart(9)}  code ${kb(w.code).padStart(8)}  js ${kb(w.js).padStart(7)}${problems.length ? '  ' + problems.join('; ') : ''}`);
  }
  process.exit(failed ? 1 : 0);
}
