import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from './d1-sqlite.mjs';

const addUser = (db, id, role = 'member', email = `${id}@x.co`) =>
  db.prepare('INSERT INTO users (id, email, name, role, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 0)').bind(id, email, id, role).run();

test('a role outside member and admin is refused', async () => {
  const db = d1();
  await assert.rejects(addUser(db, 'u1', 'owner'), /CHECK constraint failed/);
});

test('emails are unique regardless of case', async () => {
  const db = d1();
  await addUser(db, 'u1', 'member', 'Ana@X.co');
  await assert.rejects(addUser(db, 'u2', 'member', 'ana@x.co'), /UNIQUE/);
});

test('deleting a user deletes their sessions and tokens', async () => {
  const db = d1();
  await addUser(db, 'u1');
  await db.prepare("INSERT INTO sessions VALUES ('h', 'u1', 0, 9)").run();
  await db.prepare("INSERT INTO auth_tokens VALUES ('t', 'u1', 'invite', 9, NULL)").run();
  await db.prepare("DELETE FROM users WHERE id = 'u1'").run();
  assert.equal((await db.prepare('SELECT count(*) n FROM sessions').first()).n, 0);
  assert.equal((await db.prepare('SELECT count(*) n FROM auth_tokens').first()).n, 0);
});
