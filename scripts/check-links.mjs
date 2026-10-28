// Every local href, src and poster in dist/ must resolve to a file, and a #fragment to an id on that page.
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

export function htmlPages(dir) {
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.html')) out.push(relative(dir, p).split('\\').join('/'));
    }
  };
  walk(dir);
  return out;
}

const isExternal = (ref) => /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(ref);

// Maps a reference on `page` to a file path relative to dir, or null for external refs.
export function resolveRef(dir, page, ref) {
  if (isExternal(ref) || ref === '/entrar/') return null; // Served by the Worker, not a static file.
  const path = ref.split('#')[0].split('?')[0];
  if (path === '') return page;
  let target = path.startsWith('/') ? path.slice(1) : posix.join(posix.dirname(page), path);
  target = posix.normalize(target);
  if (target === '.' || target.endsWith('/')) target = posix.join(target, 'index.html');
  else if (existsSync(join(dir, target)) && statSync(join(dir, target)).isDirectory()) target = posix.join(target, 'index.html');
  return target;
}

export function refsIn(html) {
  return [...html.matchAll(/\s(?:href|src|poster)="([^"]+)"/g)].map((m) => m[1]);
}

export function checkLinks(dir) {
  const missing = [];
  for (const page of htmlPages(dir)) {
    const html = readFileSync(join(dir, page), 'utf8');
    for (const ref of refsIn(html)) {
      const target = resolveRef(dir, page, ref);
      if (target === null) continue;
      const file = join(dir, target);
      if (!existsSync(file)) { missing.push({ page, ref }); continue; }
      const frag = ref.includes('#') ? ref.split('#')[1] : '';
      if (frag && target.endsWith('.html')) {
        const body = target === page ? html : readFileSync(file, 'utf8');
        if (!new RegExp(`\\sid="${frag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`).test(body)) missing.push({ page, ref });
      }
    }
  }
  return missing;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = fileURLToPath(new URL('../dist/', import.meta.url));
  const missing = checkLinks(dir);
  for (const m of missing) console.log(`MISSING ${m.page} -> ${m.ref}`);
  console.log(`${htmlPages(dir).length} pages checked, ${missing.length} missing references`);
  process.exit(missing.length ? 1 : 0);
}
