import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from './d1-sqlite.mjs';
import { hashPassword, verifyPassword } from '../worker/auth/passwords.ts';
import { issueToken, consumeToken, sha256Hex, INVITE_TTL, RESET_TTL } from '../worker/auth/tokens.ts';
import { createSession, readSession, endSessions, SESSION_TTL } from '../worker/auth/sessions.ts';

const HOUR = 3600;
const withUser = async (status = 'active', role = 'member') => {
  const db = d1();
  await db.prepare("INSERT INTO users (id, email, name, role, status, created_at, updated_at) VALUES ('u1', 'a@x.co', 'Ana', ?, ?, 0, 0)").bind(role, status).run();
  await db.prepare("UPDATE users SET password_hash = 'known-hash' WHERE id = 'u1'").run();
  return db;
};

test('a password verifies, a wrong one does not, and the format carries its parameters', async () => {
  const stored = await hashPassword('correcto-caballo-9');
  assert.match(stored, /^pbkdf2\$100000\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  assert.equal(await verifyPassword('correcto-caballo-9', stored), true);
  assert.equal(await verifyPassword('correcto-caballo-8', stored), false);
  assert.notEqual(await hashPassword('correcto-caballo-9'), stored, 'salted');
  assert.equal(await verifyPassword('x', 'garbage'), false);
});

test('a token is stored only as its SHA-256 and works once', async () => {
  const db = await withUser('invited');
  const token = await issueToken(db, { userId: 'u1', purpose: 'invite', now: 1000 });
  const row = await db.prepare('SELECT token_hash FROM auth_tokens').first();
  assert.equal(row.token_hash, await sha256Hex(token));
  assert.ok(!row.token_hash.includes(token));
  assert.equal(await consumeToken(db, { token, purpose: 'invite', now: 1001 }), 'u1');
  assert.equal(await consumeToken(db, { token, purpose: 'invite', now: 1002 }), null, 'single use');
});

test('invite lasts 72 hours, reset 24 hours, and purposes do not mix', async () => {
  assert.equal(INVITE_TTL, 72 * HOUR);
  assert.equal(RESET_TTL, 24 * HOUR);
  const db = await withUser();
  const invite = await issueToken(db, { userId: 'u1', purpose: 'invite', now: 0 });
  assert.equal(await consumeToken(db, { token: invite, purpose: 'invite', now: 72 * HOUR }), null, 'expired at 72 h');
  const reset = await issueToken(db, { userId: 'u1', purpose: 'reset', now: 0 });
  assert.equal(await consumeToken(db, { token: reset, purpose: 'invite', now: 1 }), null, 'wrong purpose');
  assert.equal(await consumeToken(db, { token: reset, purpose: 'reset', now: 24 * HOUR - 1 }), 'u1');
});

test('a session reads back with the user, expires after 30 days and renews only after 24 hours', async () => {
  const db = await withUser();
  assert.equal(SESSION_TTL, 30 * 24 * HOUR);
  const token = await createSession(db, { userId: 'u1', now: 0, passwordHash: 'known-hash', authRevision: '' });
  const s = await readSession(db, { token, now: 10 });
  assert.equal(s.userId, 'u1');
  assert.equal(s.role, 'member');
  const expiresAt = async () => (await db.prepare('SELECT expires_at FROM sessions').first()).expires_at;
  assert.equal(await expiresAt(), SESSION_TTL, 'no renewal inside 24 h');
  await readSession(db, { token, now: 25 * HOUR });
  assert.equal(await expiresAt(), 25 * HOUR + SESSION_TTL, 'renewed after 24 h');
  assert.equal(await readSession(db, { token, now: 25 * HOUR + SESSION_TTL }), null, 'expired');
  assert.equal(await readSession(db, { token: 'nope', now: 1 }), null);
});

test('a deactivated user has no session, and endSessions removes them all', async () => {
  const db = await withUser();
  const token = await createSession(db, { userId: 'u1', now: 0, passwordHash: 'known-hash', authRevision: '' });
  await db.prepare("UPDATE users SET status = 'deactivated'").run();
  assert.equal(await readSession(db, { token, now: 1 }), null);
  await endSessions(db, 'u1');
  assert.equal((await db.prepare('SELECT count(*) n FROM sessions').first()).n, 0);
});

test('session creation rejects a password that changed after verification', async () => {
  const db = await withUser();
  await db.prepare("UPDATE users SET password_hash = 'new-hash' WHERE id = 'u1'").run();
  assert.equal(await createSession(db, { userId: 'u1', now: 1, passwordHash: 'old-hash', authRevision: '' }), null);
  assert.equal((await db.prepare('SELECT count(*) n FROM sessions').first()).n, 0);
});

test('session creation rejects an account revision that changed after verification', async () => {
  const db = await withUser();
  await db.prepare("UPDATE users SET auth_revision = 'new-revision' WHERE id = 'u1'").run();
  assert.equal(await createSession(db, { userId: 'u1', now: 1, passwordHash: 'known-hash', authRevision: '' }), null);
});
