import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markdown } from '../lib/markdown.mjs';

test('headings, paragraphs and emphasis', () => {
  assert.equal(markdown('## Proteína\n\nCome **más** y *mejor*.\nSegunda línea.'),
    '<h2>Proteína</h2>\n<p>Come <strong>más</strong> y <em>mejor</em>.\nSegunda línea.</p>');
  assert.equal(markdown('# Uno'), '<h2>Uno</h2>', 'h1 is reserved for the post title');
  assert.equal(markdown('#### Cuatro'), '<h4>Cuatro</h4>');
});

test('lists and blockquotes', () => {
  assert.equal(markdown('- uno\n- dos'), '<ul>\n<li>uno</li>\n<li>dos</li>\n</ul>');
  assert.equal(markdown('1. uno\n2. dos'), '<ol>\n<li>uno</li>\n<li>dos</li>\n</ol>');
  assert.equal(markdown('> Cita\n> larga'), '<blockquote><p>Cita\nlarga</p></blockquote>');
});

test('links and images', () => {
  assert.equal(markdown('Mira [el plan](/#planes).'), '<p>Mira <a href="/#planes">el plan</a>.</p>');
  assert.equal(markdown('![Un plato](/media/blog/plato.jpg)'), '<p><img src="/media/blog/plato.jpg" alt="Un plato" loading="lazy"></p>');
});

test('escapes HTML and drops unsafe links', () => {
  assert.equal(markdown('<script>alert(1)</script>'), '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  assert.equal(markdown('[x](javascript:alert(1))'), '<p>x</p>');
  assert.equal(markdown('[x](https://a.co/?q="b")'), '<p><a href="https://a.co/?q=&quot;b&quot;">x</a></p>');
});
