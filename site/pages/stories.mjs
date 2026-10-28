import { esc, lines } from '../layout.mjs';
import { wa } from '../i18n.mjs';

export function stories(t) {
  return `<section class="stories-head">
<h1 class="display">${lines(t.stories.heading)}</h1>
<p class="statement">${esc(t.stories.empty)}</p>
</section>
<section class="closing">
<p class="statement">${esc(t.stories.closing)}</p>
<p><a class="button" href="${wa(t.actionText)}">${esc(t.action)}</a></p>
</section>`;
}
