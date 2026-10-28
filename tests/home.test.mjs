import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from '../scripts/build.mjs';
import { strings } from '../site/i18n.mjs';

const outDir = mkdtempSync(join(tmpdir(), 'fitmagra-home-'));
await build({ outDir });

const text = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const flat = (features) => features.flatMap((f) => (Array.isArray(f) ? [f[0], ...f[1]] : [f]));

for (const t of Object.values(strings)) {
  const html = readFileSync(join(outDir, t.path, 'index.html'), 'utf8');

  test(`${t.lang} home renders every section in order`, () => {
    const order = ['hero', 'intro', 'metodo', 'proof', 'about', 'how', 'planes', 'preguntas', 'closing'].map((id) => html.indexOf(`id="${id}"`));
    assert.ok(order.every((i) => i > 0), `missing section: ${order}`);
    assert.deepEqual([...order].sort((a, b) => a - b), order);
    assert.ok(html.indexOf('<footer') > order.at(-1));
  });

  test(`${t.lang} equations show a formula table without JS and load the shared module`, () => {
    assert.match(html, /<table class="formulas"/);
    for (const name of Object.values(t.eq.names)) assert.ok(html.includes(text(name)), name);
    assert.match(html, /<script type="module" src="\/assets\/equations\.js"><\/script>/);
  });

  test(`${t.lang} proof band names all 14 countries`, () => {
    assert.equal(t.proof.countries.length, 14);
    for (const c of t.proof.countries) assert.ok(html.includes(`<li>${text(c)}</li>`), c);
  });

  test(`${t.lang} pricing keeps every feature line inside <details>`, () => {
    const details = html.match(/<details>[\s\S]*?<\/details>/g) ?? [];
    assert.equal(details.length, 3);
    t.pricing.plans.forEach((plan, i) => {
      for (const line of flat(plan.features)) assert.ok(details[i].includes(text(line)), line);
    });
  });

  test(`${t.lang} FAQ has six answered bands and the footer player is opt-in`, () => {
    assert.equal((html.match(/class="faq-band/g) ?? []).length, 6);
    for (const [, a] of t.faq.items) assert.ok(html.includes(text(a)));
    assert.match(html, /<audio controls preload="none" src="\/media\/fitmagra-vibes\.mp3">/);
    assert.match(html, /src="\/media\/neon\.jpg"/);
  });

  test(`${t.lang} home says payments are coming soon`, () => {
    assert.match(html, t.lang === 'es' ? /Pagos: próximamente/ : /Payments: coming soon/);
    assert.doesNotMatch(html, /SumUp|Nequi|Daviplata/);
  });

  test(`${t.lang} home avoids banned claims and accounts`, () => {
    for (const bad of ['MagraMind 24/7', '24/7 MagraMind', '4.8', '1.016.013.376', '—']) assert.ok(!html.includes(bad), bad);
  });
}

test('browser equations script imports the shared logic', () => {
  const js = readFileSync(join(outDir, 'assets/equations.js'), 'utf8');
  assert.match(js, /from '\.\/equations\.mjs'/);
  assert.ok(existsSync(join(outDir, 'assets/equations.mjs')));
});
