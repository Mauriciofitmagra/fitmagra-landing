import { rmSync, mkdirSync, cpSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { strings } from '../site/i18n.mjs';
import { layout, esc } from '../site/layout.mjs';
import { home } from '../site/pages/home.mjs';

const root = resolve(import.meta.dirname, '..');

export async function build({ outDir = join(root, 'dist') } = {}) {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  cpSync(join(root, 'site/assets'), join(outDir, 'assets'), { recursive: true });
  cpSync(join(root, 'site/media'), join(outDir, 'media'), { recursive: true });
  cpSync(join(root, 'lib/equations.mjs'), join(outDir, 'assets/equations.mjs'));

  for (const t of Object.values(strings)) {
    const dir = join(outDir, t.path);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), layout(t, { body: home(t) }));
  }

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
