import { esc, lines } from '../layout.mjs';
import { wa } from '../i18n.mjs';
import { imageSize } from '../../lib/image-size.mjs';

const media = (f) => new URL(`../media/${f}`, import.meta.url).pathname;

// Pictures are the 1000 px copies in media/stories/ (made with sips -Z 1000); the originals stay as sources.
// Photographs at uneven sizes: every third one runs wide, the rest pair up.
const photo = (t, p, i) => {
  const file = `stories/${p.id}.jpg`;
  const [w, h] = imageSize(media(file));
  return `<figure class="story-photo${i % 3 === 0 ? ' story-wide' : ''} rise">
<img src="/media/${file}" width="${w}" height="${h}" alt="${esc(p.alt[t.lang])}" loading="lazy" decoding="async">
<figcaption>${esc(p.label[t.lang])}</figcaption>
</figure>`;
};

const quote = (t, q) => `<figure class="story-quote rise">
<blockquote lang="es" class="statement">${esc(q.text)}</blockquote>
${t.stories.translated ? `<p class="small">${esc(t.stories.translated)}. ${esc(q.translation)}</p>` : ''}
<figcaption><strong>${esc(q.name)}</strong>, ${esc(q.role[t.lang])}</figcaption>
</figure>`;

export function stories(t, data) {
  const items = [];
  data.photos.forEach((p, i) => {
    items.push(photo(t, p, i));
    const q = data.quotes[Math.floor(i / 2)];
    if (i % 2 === 1 && q) items.push(quote(t, q));
  });
  for (const q of data.quotes.slice(Math.ceil(data.photos.length / 2))) items.push(quote(t, q));
  return `<section class="stories-head">
<h1 class="display">${lines(t.stories.heading)}</h1>
<p class="statement">${esc(t.stories.disclaimer)}</p>
</section>
<section class="stories-grid">
${items.join('\n')}
</section>
<section class="closing">
<p class="statement">${esc(t.stories.closing)}</p>
<p><a class="button" href="${wa(t.actionText)}">${esc(t.action)}</a></p>
</section>`;
}
