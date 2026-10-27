import { strings, wa } from './i18n.mjs';

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const lines = (ls) => ls.map(esc).join('<br>');

// ponytail: root-relative canonical and hreflang until the production domain is known (spec Q1).
const alternates = Object.values(strings)
  .map((s) => `<link rel="alternate" hreflang="${s.lang}" href="${s.path}">`)
  .join('\n');

export function layout(t, { title = t.meta.title, body, index = true }) {
  return `<!doctype html>
<html lang="${t.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(t.meta.description)}">
${index ? `<link rel="canonical" href="${t.path}">\n${alternates}\n<link rel="alternate" hreflang="x-default" href="/">` : '<meta name="robots" content="noindex">'}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;800&display=swap">
<link rel="stylesheet" href="/assets/brand.css">
</head>
<body>
<a class="skip" href="#contenido">${esc(t.nav.skip)}</a>
<header class="nav">
<a class="nav-logo" href="${t.path}"><img src="/media/logo-oficial.png" width="1623" height="439" alt="FitMagra Systems"></a>
<nav aria-label="${esc(t.nav.home)}">
${t.nav.links.map(([href, label]) => `<a href="${href}">${esc(label)}</a>`).join('\n')}
<a href="${t.nav.other[0]}" hreflang="${t.lang === 'es' ? 'en' : 'es'}">${esc(t.nav.other[1])}</a>
</nav>
<a class="button" href="${wa(t.actionText)}">${esc(t.action)}</a>
</header>
<main id="contenido">
${body}
</main>
</body>
</html>
`;
}
