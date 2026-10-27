import { esc, lines, img } from '../layout.mjs';
import { wa, USD_RATE } from '../i18n.mjs';

const button = (t, text = t.action, message = t.actionText) => `<a class="button" href="${wa(message)}">${esc(text)} →</a>`;
const cop = (n) => n.toLocaleString('es-CO');
const EQUATIONS = ['harrisBenedict', 'mifflinStJeor', 'cunningham', 'oxford'];

const hero = (t) => `<section class="hero" id="hero">
<div class="plate hero-plate" aria-hidden="true"></div>
<h1 class="display">${lines(t.hero.lines)}</h1>
<p class="statement">${esc(t.hero.sentence)}</p>
<p class="actions">${button(t)} <a href="#planes">${esc(t.hero.link)}</a></p>
</section>`;

const intro = (t) => `<section class="intro" id="intro">
<p class="tile tile-slogan rise">${lines(t.intro.slogan)}</p>
<p class="tile tile-count rise"><span class="display">${esc(t.intro.count)}</span> ${esc(t.intro.countLabel)}</p>
<figure class="tile tile-photo rise">${img('coach-green-640.jpg', t.intro.photoAlt)}</figure>
<p class="tile tile-text statement rise">${esc(t.intro.text)}</p>
</section>`;

const field = (name, label, value, extra = '') => `<label><span>${esc(label)}</span><input name="${name}" type="number" inputmode="decimal" value="${value}" ${extra}></label>`;
const equations = (t) => `<section class="equations" id="metodo" data-needs-fat="${esc(t.eq.needsFat)}" data-adults-only="${esc(t.eq.adultsOnly)}" data-empty="${esc(t.eq.empty)}" data-lang="${t.lang}">
<h2 class="display">${esc(t.eq.heading)}</h2>
<form class="eq-form" hidden>
<fieldset><legend>${esc(t.eq.sex)}</legend>
<label><input type="radio" name="sex" value="female" checked> ${esc(t.eq.female)}</label>
<label><input type="radio" name="sex" value="male"> ${esc(t.eq.male)}</label>
</fieldset>
${field('ageYears', t.eq.age, 30, 'min="18" max="100"')}
${field('weightKg', t.eq.weight, 70, 'min="30" max="300"')}
${field('heightCm', t.eq.height, 168, 'min="120" max="230"')}
${field('bodyFatPct', t.eq.fat, '', 'min="3" max="70"')}
</form>
<ul class="eq-results" hidden aria-live="polite">
${EQUATIONS.map((k) => `<li class="plate"><output data-eq="${k}" class="eq-value"></output><span>${esc(t.eq.unit)}, ${esc(t.eq.names[k])}</span></li>`).join('\n')}
</ul>
<table class="formulas">
<thead><tr><th scope="col">${esc(t.eq.formulaHead[0])}</th><th scope="col">${esc(t.eq.formulaHead[1])}</th></tr></thead>
<tbody>
${EQUATIONS.map((k) => `<tr><th scope="row">${esc(t.eq.names[k])}</th><td>${esc(t.eq.formulas[k])}</td></tr>`).join('\n')}
</tbody>
</table>
<p class="eq-note">${esc(t.eq.note)}</p>
<script type="module" src="/assets/equations.js"></script>
</section>`;

const countries = (t, hidden = false) => `<ul${hidden ? ' aria-hidden="true"' : ''}>${t.proof.countries.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>`;
const proof = (t) => `<section class="proof" id="proof">
<div class="proof-track">${countries(t)}${countries(t, true)}</div>
<p class="statement">${esc(t.proof.sentence)} <a href="${t.stories.path}">${esc(t.proof.link)}</a></p>
</section>`;

const about = (t) => `<section class="about" id="about">
<div class="about-panel">
<h2 class="heading">${lines(t.about.lines)}</h2>
<figure class="about-photo shutter">${img('coach-pilates-640.jpg', t.about.photoAlt, 'plate-mask')}</figure>
${t.about.blocks.map(([title, body], i) => `<div class="about-block">${i === 0 ? `<span class="rosario">${img('rosario-400.png', t.about.rosarioAlt)}</span>` : ''}<h3>${esc(title)}</h3><p>${esc(body)}</p></div>`).join('\n')}
<p>${button(t)}</p>
</div>
</section>`;

const how = (t) => `<section class="how" id="how">
<h2 class="display">${esc(t.how.heading)}</h2>
<ol class="how-tiles">
${t.how.steps.map(([title, body, file, alt]) => `<li class="how-tile rise">${img(file, alt)}<h3 class="heading">${esc(title)}</h3><p>${esc(body)}</p></li>`).join('\n')}
</ol>
</section>`;

const feature = (f) => (Array.isArray(f)
  ? `<li>${esc(f[0])}<ul>${f[1].map((s) => `<li>${esc(s)}</li>`).join('')}</ul></li>`
  : `<li>${esc(f)}</li>`);
const pricing = (t) => `<section class="pricing" id="planes">
<h2 class="display">${esc(t.pricing.heading)}</h2>
<p class="pricing-note">${esc(t.pricing.note)}</p>
<div class="tickets">
${t.pricing.plans.map((p) => `<article class="ticket rise">
<div class="ticket-head">
<h3 class="heading">${esc(p.name)}</h3>
<p class="price"><span class="display">${cop(p.cop)}</span> ${esc(t.pricing.perMonth)}</p>
<p class="usd">${esc(t.pricing.usd(Math.round(p.cop / USD_RATE)))}</p>
</div>
<div class="ticket-body">
<ul class="keys">${p.keys.map((k) => `<li>${esc(k)}</li>`).join('')}</ul>
<details>
<summary>${esc(t.pricing.details)}</summary>
<ul class="features">${p.features.map(feature).join('')}</ul>
</details>
<p>${button(t, t.pricing.start(p.name), t.pricing.startText(p.name))}</p>
</div>
</article>`).join('\n')}
</div>
</section>`;

const faq = (t) => `<section class="faq" id="preguntas">
<h2 class="display">${esc(t.faq.heading)}</h2>
${t.faq.items.map(([q, a], i) => `<div class="faq-band ${i % 2 ? 'faq-green' : 'faq-black'}"><h3 class="heading">${esc(q)}</h3><p>${esc(a)}</p></div>`).join('\n')}
</section>`;

const closing = (t) => `<section class="closing" id="closing">
<h2 class="display">${lines(t.closing.lines)}</h2>
<p class="statement">${esc(t.closing.sentence)}</p>
<p>${button(t)}</p>
</section>`;

export const home = (t) => [hero, intro, equations, proof, about, how, pricing, faq, closing].map((section) => section(t)).join('\n');
