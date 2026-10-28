import { rmSync, mkdirSync, cpSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { strings } from '../site/i18n.mjs';
import { layout, esc } from '../site/layout.mjs';
import { home } from '../site/pages/home.mjs';
import { stories } from '../site/pages/stories.mjs';
import { listing, post, postHead, postPath, rss, sitemap } from '../site/pages/blog.mjs';
import { parsePost } from '../lib/frontmatter.mjs';

const root = resolve(import.meta.dirname, '..');

// Every story item without written consent; the cutover checklist (spec 14) refuses to launch while any remain.
export const unverifiedConsent = (data) => [...data.photos, ...data.quotes, data.video].filter((s) => s.consent !== 'written').map((s) => s.id);

// Published posts per language, newest first. Invalid front matter throws with the file and field.
export function loadPosts(blogDir) {
  const byLang = { es: [], en: [] };
  for (const lang of Object.keys(byLang)) {
    const dir = join(blogDir, lang);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).filter((n) => n.endsWith('.md')).sort()) {
      const p = parsePost(readFileSync(join(dir, name), 'utf8'), `${lang}/${name}`);
      if (!p.draft) byLang[lang].push(p);
    }
    byLang[lang].sort((a, b) => b.date.localeCompare(a.date));
  }
  return byLang;
}

export async function build({
  outDir = join(root, 'dist'),
  blogDir = join(root, 'content/blog'),
  // ponytail: placeholder until the production domain is known (spec Q1); the cutover check refuses .invalid.
  siteUrl = process.env.SITE_URL || 'https://fitmagra.invalid',
  log = console.log,
} = {}) {
  const storyData = JSON.parse(readFileSync(join(root, 'content/stories.json'), 'utf8'));
  const posts = loadPosts(blogDir);
  const indexed = [];
  const write = (path, html, { index = true } = {}) => {
    const file = join(outDir, path.endsWith('/') ? `${path}index.html` : path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, html);
    if (index && path.endsWith('/')) indexed.push(path);
  };

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  cpSync(join(root, 'site/assets'), join(outDir, 'assets'), { recursive: true });
  cpSync(join(root, 'site/media'), join(outDir, 'media'), { recursive: true });
  cpSync(join(root, 'lib/equations.mjs'), join(outDir, 'assets/equations.mjs'));

  const pair = (key) => ({ es: strings.es[key].path, en: strings.en[key].path });
  for (const t of Object.values(strings)) {
    write(t.path, layout(t, { siteUrl, body: home(t) }));
    write(t.stories.path, layout(t, { siteUrl, title: t.stories.title, description: t.stories.description, alts: pair('stories'), body: stories(t, storyData) }));
    write(t.blog.path, layout(t, { siteUrl, title: t.blog.title, description: t.blog.description, alts: pair('blog'), body: listing(t, posts[t.lang]) }));
    write(`${t.blog.path}rss.xml`, rss(t, posts[t.lang], siteUrl));
    const other = t.lang === 'es' ? strings.en : strings.es;
    for (const p of posts[t.lang]) {
      const twin = p.translation && posts[other.lang].find((q) => q.slug === p.translation);
      const alts = { [t.lang]: postPath(t, p), ...(twin ? { [other.lang]: postPath(other, twin) } : {}) };
      write(postPath(t, p), layout(t, { siteUrl, title: `${p.title} | FitMagra`, description: p.description, alts, head: postHead(t, p, siteUrl), body: post(t, p) }));
    }
  }

  const pending = unverifiedConsent(storyData);
  if (pending.length) log(`consent not yet written for ${pending.length} story items: ${pending.join(', ')}`);

  const nf = strings.es.notFound;
  write('404.html', layout(strings.es, {
    title: nf.title,
    index: false,
    body: `<section class="closing"><h1 class="display">${esc(nf.text)}</h1><p><a href="/">${esc(nf.back)}</a></p></section>`,
  }));
  write('sitemap.xml', sitemap(indexed, siteUrl));
  write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`);
  return outDir;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(`built ${await build()}`);
}
