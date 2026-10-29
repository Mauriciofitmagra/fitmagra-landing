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

  test(`${t.lang} navigation puts the blog first`, () => {
    const nav = html.match(/<header class="nav">[\s\S]*?<nav[^>]*>([\s\S]*?)<\/nav>/)[1];
    assert.ok(nav.indexOf(`${t.blog.path}`) < nav.indexOf(`${t.path}#metodo`));
  });

  test(`${t.lang} home renders every section in order`, () => {
    const order = ['hero', 'intro', 'proof', 'how', 'planes', 'pago', 'about', 'metodo', 'preguntas', 'closing'].map((id) => html.indexOf(`id="${id}"`));
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

  test(`${t.lang} FAQ has six answered bands and no music player`, () => {
    assert.equal((html.match(/class="faq-band/g) ?? []).length, 6);
    for (const [, a] of t.faq.items) assert.ok(html.includes(text(a)));
    assert.doesNotMatch(html, /<audio/);
    assert.match(html, /src="\/media\/neon\.jpg"/);
  });

  test(`${t.lang} exposes login, the new contact and illustrated steps`, () => {
    assert.match(html, /href="\/entrar\/"/);
    assert.match(html, /573165754416/);
    assert.doesNotMatch(html, /rosario-400\.png/);
    const steps = html.match(/<ol class="how-tiles">([\s\S]*?)<\/ol>/)[1];
    assert.equal((steps.match(/<svg/g) ?? []).length, 3);
    assert.doesNotMatch(steps, /<img/);
  });

  test(`${t.lang} payment section links to Wompi and WhatsApp`, () => {
    const section = html.match(/<section class="payment"[\s\S]*?<\/section>/)?.[0];
    assert.ok(section);
    assert.ok(section.includes('https://checkout.wompi.co/l/VPOS_h9q1ew'));
    assert.ok(section.includes('https://wa.me/573165754416'));
    assert.match(section, t.lang === 'es' ? /comprobante/i : /payment confirmation/i);
    assert.match(section, t.lang === 'es' ? /ingresa el valor/i : /enter your plan amount/i);
  });

  test(`${t.lang} removes the dumbbell and loads shared scroll motion`, () => {
    assert.doesNotMatch(html, /dumbbell|mancuerna/i);
    assert.match(html, /src="\/assets\/scroll-motion\.js"/);
  });

  test(`${t.lang} home sections have a back-to-home link`, () => {
    for (const section of html.match(/<section\b[\s\S]*?<\/section>/g) ?? []) {
      assert.match(section, /<nav class="back-home-nav"[^>]*><a class="back-home" href="#contenido"/);
    }
  });

  test(`${t.lang} hero leads with the coaching method instead of the rejected portrait`, () => {
    const hero = html.match(/<section class="hero"[\s\S]*?<\/section>/)[0];
    assert.doesNotMatch(hero, /coach-black-800\.jpg/);
    assert.match(hero, /class="hero-method"/);
    assert.ok(hero.includes('href="#planes"'));
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
