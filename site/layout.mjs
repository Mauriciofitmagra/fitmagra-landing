import { strings, wa, CONTACT } from './i18n.mjs';

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const lines = (ls) => ls.map(esc).join('<br>');

// Resized copies made once with macOS sips; the originals stay for the stories page.
const SIZE = {
  'logo-oficial-600.png': [600, 162],
  'coach-green-640.jpg': [640, 639],
  'coach-pilates-640.jpg': [582, 640],
  'coach-black-800.jpg': [533, 800],
  't-mes-640.jpg': [584, 640],
  'rosario-400.png': [400, 345],
  'neon.jpg': [1156, 520],
};
export const img = (file, alt, cls = '', lazy = true) => {
  const [w, h] = SIZE[file];
  return `<img${cls && ` class="${cls}"`} src="/media/${file}" width="${w}" height="${h}" alt="${esc(alt)}"${lazy ? ' loading="lazy" decoding="async"' : ''}>`;
};

// ponytail: root-relative canonical and hreflang until the production domain is known (spec Q1).
const alternates = Object.values(strings)
  .map((s) => `<link rel="alternate" hreflang="${s.lang}" href="${s.path}">`)
  .join('\n');

const navLinks = (t) => `${t.nav.links.map(([href, label]) => `<a href="${t.path}${href}">${esc(label)}</a>`).join('\n')}
<a href="${t.nav.other[0]}" hreflang="${t.lang === 'es' ? 'en' : 'es'}">${esc(t.nav.other[1])}</a>`;

const footer = (t) => `<footer class="footer">
${img('neon.jpg', t.footer.neonAlt, 'neon')}
<div class="footer-grid">
<p class="statement">${esc(t.footer.slogan)}</p>
<nav aria-label="${esc(t.nav.home)}">
${navLinks(t)}
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
<a class="nav-logo" href="${t.path}">${img('logo-oficial-600.png', 'FitMagra Systems', '', false)}</a>
<nav aria-label="${esc(t.nav.home)}">
${navLinks(t)}
</nav>
<a class="button" href="${wa(t.actionText)}">${esc(t.action)}</a>
</header>
<main id="contenido">
${body}
</main>
${footer(t)}
</body>
</html>
`;
}
