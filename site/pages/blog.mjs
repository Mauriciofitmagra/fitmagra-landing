import { esc, lines, img } from '../layout.mjs';
import { markdown } from '../../lib/markdown.mjs';

export const postPath = (t, p) => `${t.blog.path}${p.slug}/`;

const date = (t, iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(t.blog.dateLocale, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

export function listing(t, posts) {
  const items = posts.map((p) => `<li class="blog-item rise">
<a href="${postPath(t, p)}"><h2 class="heading">${esc(p.title)}</h2></a>
<p>${esc(p.description)}</p>
<p class="small"><time datetime="${p.date}">${esc(date(t, p.date))}</time></p>
</li>`);
  return `<section class="blog-head">
<h1 class="display">${lines(t.blog.heading)}</h1>
</section>
<section class="blog-list">
${posts.length ? `<ul>\n${items.join('\n')}\n</ul>` : `<p class="statement">${esc(t.blog.empty)}</p>`}
<p><a href="${t.blog.path}rss.xml">${esc(t.blog.rss)}</a></p>
</section>
${posts.length ? '' : writer(t)}`;
}

// The empty blog shows the person who is writing it, so the page is not a blank field.
const writer = (t) => `<section class="blog-writer">
<figure class="rise">${img(t.how.steps[0][2], t.how.steps[0][3])}</figure>
<figure class="rise">${img('coach-pilates-640.jpg', t.about.photoAlt)}</figure>
<figure class="rise">${img('coach-green-640.jpg', t.intro.photoAlt)}</figure>
</section>`;

export function post(t, p) {
  return `<article class="blog-post">
<header class="blog-head">
<h1 class="display">${esc(p.title)}</h1>
<p class="small">${esc(t.blog.published)} <time datetime="${p.date}">${esc(date(t, p.date))}</time></p>
</header>
${p.cover ? `<img class="blog-cover" src="${esc(p.cover)}" alt="${esc(p.coverAlt)}">` : ''}
<div class="blog-body">
${markdown(p.body)}
</div>
<p class="blog-back"><a href="${t.blog.path}">${esc(t.blog.back)}</a></p>
</article>`;
}

// Open Graph tags and BlogPosting JSON-LD for one post. `<` is escaped inside the JSON so a title cannot close the script.
export function postHead(t, p, siteUrl) {
  const url = `${siteUrl}${postPath(t, p)}`;
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: p.title,
    description: p.description,
    datePublished: p.date,
    inLanguage: p.lang,
    url,
    author: { '@type': 'Person', name: 'Mauricio Sánchez' },
    publisher: { '@type': 'Organization', name: 'FitMagra Systems' },
    ...(p.cover ? { image: `${siteUrl}${p.cover}` } : {}),
  };
  return [
    `<meta property="og:type" content="article">`,
    `<meta property="og:title" content="${esc(p.title)}">`,
    `<meta property="og:description" content="${esc(p.description)}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:locale" content="${p.lang === 'es' ? 'es_CO' : 'en_US'}">`,
    p.cover ? `<meta property="og:image" content="${siteUrl}${esc(p.cover)}">` : '',
    `<meta name="twitter:card" content="${p.cover ? 'summary_large_image' : 'summary'}">`,
    `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`,
  ].filter(Boolean).join('\n');
}

const xml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

export function rss(t, posts, siteUrl) {
  const items = posts.map((p) => `<item>
<title>${xml(p.title)}</title>
<link>${siteUrl}${postPath(t, p)}</link>
<guid>${siteUrl}${postPath(t, p)}</guid>
<description>${xml(p.description)}</description>
<pubDate>${new Date(`${p.date}T00:00:00Z`).toUTCString()}</pubDate>
</item>`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>${xml(t.blog.title)}</title>
<link>${siteUrl}${t.blog.path}</link>
<description>${xml(t.blog.description)}</description>
<language>${t.lang}</language>
${items.join('\n')}
</channel>
</rss>
`;
}

export const sitemap = (paths, siteUrl) => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((p) => `<url><loc>${siteUrl}${p}</loc></url>`).join('\n')}
</urlset>
`;
