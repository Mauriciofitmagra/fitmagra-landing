import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from './d1-sqlite.mjs';

const fresh = () => {
  const db = d1({ migrations: false });
  db.raw.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT UNIQUE)');
  return db;
};

test('prepare().bind().run(), first() and all() follow the D1 shapes', async () => {
  const db = fresh();
  const r = await db.prepare('INSERT INTO t (name) VALUES (?)').bind('ana').run();
  assert.equal(r.success, true);
  assert.equal(r.meta.changes, 1);
  assert.deepEqual(await db.prepare('SELECT name FROM t WHERE id = ?').bind(1).first(), { name: 'ana' });
  assert.equal(await db.prepare('SELECT name FROM t WHERE id = ?').bind(9).first(), null);
  assert.equal(await db.prepare('SELECT name FROM t WHERE id = ?').bind(1).first('name'), 'ana');
  const all = await db.prepare('SELECT name FROM t').all();
  assert.deepEqual(all.results, [{ name: 'ana' }]);
});

test('batch() runs in one transaction and rolls back on error', async () => {
  const db = fresh();
  const ins = db.prepare('INSERT INTO t (name) VALUES (?)');
  await assert.rejects(db.batch([ins.bind('a'), ins.bind('b'), ins.bind('a')]), /UNIQUE/);
  assert.equal((await db.prepare('SELECT count(*) n FROM t').first()).n, 0);
  await db.batch([ins.bind('a'), ins.bind('b')]);
  assert.equal((await db.prepare('SELECT count(*) n FROM t').first()).n, 2);
});

test('applies every migration in order and enforces foreign keys', async () => {
  const db = d1();
  const tables = (await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()).results.map((r) => r.name);
  assert.ok(tables.includes('users'));
  assert.equal((await db.prepare('PRAGMA foreign_keys').first()).foreign_keys, 1);
});
