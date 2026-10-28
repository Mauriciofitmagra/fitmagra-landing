import { rmSync, mkdirSync, cpSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { strings } from '../site/i18n.mjs';
import { layout, esc } from '../site/layout.mjs';
import { home } from '../site/pages/home.mjs';
import { stories } from '../site/pages/stories.mjs';
import { listing, post, postHead, postPath, rss, sitemap } from '../site/pages/blog.mjs';
import { parsePost } from '../lib/frontmatter.mjs';
import { markdown } from '../lib/markdown.mjs';

const root = resolve(import.meta.dirname, '..');

// Published posts per language, newest first. Invalid front matter throws with the file and field.
export function loadPosts(blogDir) {
  const byLang = { es: [], en: [] };
  for (const lang of Object.keys(byLang)) {
    const dir = join(blogDir, lang);
    if (!existsSync(dir)) continue;
    const slugs = new Map();
    for (const name of readdirSync(dir).filter((n) => n.endsWith('.md')).sort()) {
      const p = parsePost(readFileSync(join(dir, name), 'utf8'), `${lang}/${name}`);
      if (!p.draft) {
        if (slugs.has(p.slug)) throw new Error(`${lang}/${name}: duplicate slug "${p.slug}" (also in ${lang}/${slugs.get(p.slug)})`);
        slugs.set(p.slug, name);
        byLang[lang].push(p);
      }
    }
    byLang[lang].sort((a, b) => b.date.localeCompare(a.date));
  }
  return byLang;
}

export async function build({
  outDir = join(root, 'dist'),
  blogDir = join(root, 'content/blog'),
  legalDir = join(root, 'content/legal'),
  siteUrl = process.env.SITE_URL || 'https://fitmagra.robertzu43.workers.dev',
  log = console.log,
} = {}) {
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
  cpSync(join(root, 'site/_headers'), join(outDir, '_headers'));
  cpSync(join(root, 'site/media'), join(outDir, 'media'), { recursive: true,
    filter: (path) => !/^(stories|t-.*|testimonial-video\.mp4)$/.test(basename(path)) });
  cpSync(join(root, 'lib/equations.mjs'), join(outDir, 'assets/equations.mjs'));

  const legal = [
    { es: ['terminos', 'Términos'], en: ['terms', 'Terms'] },
    { es: ['privacidad', 'Privacidad'], en: ['privacy', 'Privacy'] },
  ];
  const legalLinks = (lang) => legal.filter((p) => existsSync(join(legalDir, `${p[lang][0]}.md`)))
    .map((p) => [`${strings[lang].path}${p[lang][0]}/`, p[lang][1]]);
  const pair = (key) => ({ es: strings.es[key].path, en: strings.en[key].path });
  for (const t of Object.values(strings)) {
    const links = legalLinks(t.lang);
    write(t.path, layout(t, { siteUrl, legalLinks: links, body: home(t) }));
    write(t.stories.path, layout(t, { siteUrl, legalLinks: links, title: t.stories.title, description: t.stories.description, alts: pair('stories'), body: stories(t) }));
    write(t.blog.path, layout(t, { siteUrl, legalLinks: links, title: t.blog.title, description: t.blog.description, alts: pair('blog'), body: listing(t, posts[t.lang]) }));
    for (const p of legal) {
      const [name, title] = p[t.lang];
      const file = join(legalDir, `${name}.md`);
      if (!existsSync(file)) continue;
      const alts = Object.fromEntries(Object.keys(strings).filter((lang) => existsSync(join(legalDir, `${p[lang][0]}.md`)))
        .map((lang) => [lang, `${strings[lang].path}${p[lang][0]}/`]));
      write(alts[t.lang], layout(t, { siteUrl, legalLinks: links, title: `${title} | FitMagra`, description: title, alts,
        body: `<article class="blog-post"><header class="blog-head"><h1 class="display">${esc(title)}</h1></header><div class="blog-body">${markdown(readFileSync(file, 'utf8'))}</div></article>` }));
    }
    write(`${t.blog.path}rss.xml`, rss(t, posts[t.lang], siteUrl));
    const other = t.lang === 'es' ? strings.en : strings.es;
    for (const p of posts[t.lang]) {
      const twin = p.translation && posts[other.lang].find((q) => q.slug === p.translation);
      const alts = { [t.lang]: postPath(t, p), ...(twin ? { [other.lang]: postPath(other, twin) } : {}) };
      write(postPath(t, p), layout(t, { siteUrl, legalLinks: links, title: `${p.title} | FitMagra`, description: p.description, alts, languageFallback: pair('blog'), head: postHead(t, p, siteUrl), body: post(t, p) }));
    }
  }



  for (const t of Object.values(strings)) {
    const nf = t.notFound;
    write(`${t.path.slice(1)}404.html`, layout(t, {
      title: nf.title,
      index: false,
      body: `<section class="closing"><h1 class="display">${esc(nf.text)}</h1><p><a href="${t.path}">${esc(nf.back)}</a></p></section>`,
    }));
  }
  write('sitemap.xml', sitemap(indexed, siteUrl));
  write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`);
  return outDir;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(`built ${await build()}`);
}
