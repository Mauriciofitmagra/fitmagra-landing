import { esc, lines } from '../layout.mjs';
import { wa } from '../i18n.mjs';

const hero = (t) => `<section class="hero">
<div class="plate hero-plate" aria-hidden="true"></div>
<h1 class="display">${lines(t.hero.lines)}</h1>
<p class="statement">${esc(t.hero.sentence)}</p>
<p class="actions"><a class="button" href="${wa(t.actionText)}">${esc(t.action)} →</a> <a href="#planes">${esc(t.hero.link)}</a></p>
</section>`;

export const home = (t) => [hero].map((section) => section(t)).join('\n');
