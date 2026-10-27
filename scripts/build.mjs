import { rmSync, mkdirSync, cpSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { strings } from '../site/i18n.mjs';
import { layout, esc } from '../site/layout.mjs';
import { home } from '../site/pages/home.mjs';
import { stories } from '../site/pages/stories.mjs';

const root = resolve(import.meta.dirname, '..');

// Every story item without written consent; the cutover checklist (spec 14) refuses to launch while any remain.
export const unverifiedConsent = (data) => [...data.photos, ...data.quotes, data.video].filter((s) => s.consent !== 'written').map((s) => s.id);

export async function build({ outDir = join(root, 'dist'), log = console.log } = {}) {
  const storyData = JSON.parse(readFileSync(join(root, 'content/stories.json'), 'utf8'));
  const storyAlts = { es: strings.es.stories.path, en: strings.en.stories.path };
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  cpSync(join(root, 'site/assets'), join(outDir, 'assets'), { recursive: true });
  cpSync(join(root, 'site/media'), join(outDir, 'media'), { recursive: true });
  cpSync(join(root, 'lib/equations.mjs'), join(outDir, 'assets/equations.mjs'));

  for (const t of Object.values(strings)) {
    const dir = join(outDir, t.path);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), layout(t, { body: home(t) }));
    const sdir = join(outDir, t.stories.path);
    mkdirSync(sdir, { recursive: true });
    writeFileSync(join(sdir, 'index.html'), layout(t, { title: t.stories.title, description: t.stories.description, alts: storyAlts, body: stories(t, storyData) }));
  }

  const pending = unverifiedConsent(storyData);
  if (pending.length) log(`consent not yet written for ${pending.length} story items: ${pending.join(', ')}`);

  const nf = strings.es.notFound;
  writeFileSync(join(outDir, '404.html'), layout(strings.es, {
    title: nf.title,
    index: false,
    body: `<section class="closing"><h1 class="display">${esc(nf.text)}</h1><p><a href="/">${esc(nf.back)}</a></p></section>`,
  }));
  writeFileSync(join(outDir, 'robots.txt'), 'User-agent: *\nAllow: /\n');
  return outDir;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(`built ${await build()}`);
}
