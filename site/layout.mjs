import { strings, wa, CONTACT } from './i18n.mjs';

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const lines = (ls) => ls.map(esc).join('<br>');

// Resized copies made once with macOS sips; the originals stay for the stories page.
const SIZE = {
  'logo-oficial-600.png': [600, 162],
  'coach-green-640.jpg': [640, 639],
  'coach-pilates-640.jpg': [582, 640],
  'coach-black-800.jpg': [533, 800],
  'rosario-400.png': [400, 345],
  'neon.jpg': [1156, 520],
};
export const img = (file, alt, cls = '', lazy = true) => {
  const [w, h] = SIZE[file];
  return `<img${cls && ` class="${cls}"`} src="/media/${file}" width="${w}" height="${h}" alt="${esc(alt)}"${lazy ? ' loading="lazy" decoding="async"' : ''}>`;
};

// `alts` maps each language to this page's URL in that language.
const HOME = { es: strings.es.path, en: strings.en.path };
const alternates = (alts, siteUrl) => Object.entries(alts)
  .map(([lang, href]) => `<link rel="alternate" hreflang="${lang}" href="${esc(siteUrl + href)}">`)
  .join('\n');

const navLinks = (t, alts = HOME, languageFallback = HOME) => {
  const other = t.lang === 'es' ? 'en' : 'es';
  return `${t.nav.links.map(([href, label]) => `<a href="${t.path}${href}">${esc(label)}</a>`).join('\n')}
<a href="/entrar/">${esc(t.nav.login)}</a>
<a href="${alts[other] ?? languageFallback[other]}" hreflang="${other}">${esc(t.nav.other[1])}</a>`;
};

const footer = (t, alts, legalLinks, languageFallback) => `<footer class="footer">
${img('neon.jpg', t.footer.neonAlt, 'neon')}
<div class="footer-grid">
<p class="statement">${esc(t.footer.slogan)}</p>
<nav aria-label="${esc(t.nav.home)}">
${navLinks(t, alts, languageFallback)}
${legalLinks.map(([path, title]) => `<a href="${path}">${esc(title)}</a>`).join('\n')}
</nav>
<address>
<h2>${esc(t.footer.contact)}</h2>
<a href="${wa(t.actionText)}">WhatsApp ${esc(CONTACT.phone)}</a>
<a href="mailto:${CONTACT.email}">${esc(CONTACT.email)}</a>
<a href="${CONTACT.facebook}">Facebook</a>
<span>${esc(t.footer.place)}</span>
</address>
<div class="player">
<p>${esc(t.footer.music)}</p>
<audio controls preload="none" src="/media/fitmagra-vibes.mp3"></audio>
</div>
<p class="small">${esc(t.footer.rights)}</p>
</div>
</footer>`;

export function layout(t, { title = t.meta.title, description = t.meta.description, body, index = true, alts = HOME, head = '', siteUrl = 'https://fitmagra.invalid', legalLinks = [], languageFallback = HOME }) {
  return `<!doctype html>
<html lang="${t.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${index ? `<link rel="canonical" href="${esc(siteUrl + alts[t.lang])}">\n${alternates(alts, siteUrl)}\n<link rel="alternate" hreflang="x-default" href="${esc(siteUrl + (alts.es ?? alts[t.lang]))}">` : '<meta name="robots" content="noindex">'}
${head || (index ? `<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(siteUrl + alts[t.lang])}">
<meta property="og:image" content="${esc(siteUrl)}/media/coach-black-800.jpg">
<meta name="twitter:card" content="summary_large_image">` : '')}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;800&display=swap">
<link rel="stylesheet" href="/assets/brand.css">
</head>
<body>
<a class="skip" href="#contenido">${esc(t.nav.skip)}</a>
<header class="nav">
<a class="nav-logo" href="${t.path}">${img('logo-oficial-600.png', 'FitMagra Systems', '', false)}</a>
<nav aria-label="${esc(t.nav.home)}">
${navLinks(t, alts, languageFallback)}
</nav>
<a class="button" href="${wa(t.actionText)}">${esc(t.action)}</a>
</header>
<main id="contenido">
${body}
</main>
${footer(t, alts, legalLinks, languageFallback)}
</body>
</html>
`;
}
