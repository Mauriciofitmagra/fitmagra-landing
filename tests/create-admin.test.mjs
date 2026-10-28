import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminBootstrap } from '../scripts/create-admin.mjs';
import { d1 } from './d1-sqlite.mjs';
import { sha256Hex } from '../worker/auth/tokens.ts';

test('the SQL creates one invited admin and stores only the token hash; the link carries the token', async () => {
  const { sql, link, token } = await adminBootstrap({ email: "o'brien@x.co", name: 'Roberto', origin: 'https://fitmagra.test', now: 100 });
  assert.ok(!sql.includes(token), 'raw token never in SQL');
  assert.ok(sql.includes(await sha256Hex(token)));
  assert.equal(link, `https://fitmagra.test/entrar/clave/?t=${token}&p=invite`);
  const db = d1();
  db.raw.exec(sql);
  const u = await db.prepare('SELECT email, role, status FROM users').first();
  assert.deepEqual(u, { email: "o'brien@x.co", role: 'admin', status: 'invited' });
  assert.equal((await db.prepare("SELECT purpose FROM auth_tokens").first()).purpose, 'invite');
});

test('refuses a missing email or origin', async () => {
  await assert.rejects(adminBootstrap({ email: '', name: 'x', origin: 'https://a.co' }), /email/);
  await assert.rejects(adminBootstrap({ email: 'a@b.co', name: 'x', origin: 'ftp://a' }), /origin/);
});
