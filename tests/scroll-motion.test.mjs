import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../site/assets/scroll-motion.js', import.meta.url), 'utf8');

test('offscreen content slides in when it enters, and reduced motion stays still', () => {
  const classes = new Set();
  const element = {
    parentElement: { closest: () => null },
    classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name) },
    getBoundingClientRect: () => ({ top: 1000, bottom: 1100 }),
  };
  let callback, observed = 0, removed = 0;
  class Observer {
    constructor(fn) { callback = fn; }
    observe() { observed++; }
    unobserve() { removed++; }
  }
  const context = { window: { matchMedia: () => ({ matches: true }), innerHeight: 800, IntersectionObserver: Observer }, document: { querySelectorAll: () => [element] }, IntersectionObserver: Observer };
  runInNewContext(source, context);
  assert.equal(observed, 1);
  assert.ok(classes.has('slide-waiting'));
  callback([{ target: element, isIntersecting: true }]);
  assert.ok(!classes.has('slide-waiting'));
  assert.equal(removed, 1);
  classes.clear(); observed = 0;
  context.window.matchMedia = () => ({ matches: false });
  runInNewContext(source, context);
  assert.equal(observed, 0);
  assert.equal(classes.size, 0);
});
