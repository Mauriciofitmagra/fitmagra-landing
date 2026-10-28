import type { DB } from '../db.ts';
import { CONSENT_VERSION } from '../app/consent.ts';
import { randomToken, sha256Hex } from './tokens.ts';

export const SESSION_TTL = 30 * 24 * 3600;
const RENEW_AFTER = 24 * 3600;

export type Role = 'member' | 'admin';
export interface Session { userId: string; name: string; email: string; role: Role; consented: boolean; dataRevision: string; erasing: boolean; authRevision: string; sessionHash: string }

export async function createSession(db: DB, { userId, now, passwordHash, authRevision }: { userId: string; now: number; passwordHash: string; authRevision: string }): Promise<string | null> {
  const token = randomToken();
  const result = await db.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) SELECT ?, id, ?, ? FROM users WHERE id = ? AND status = 'active' AND password_hash = ? AND auth_revision = ?")
    .bind(await sha256Hex(token), now, now + SESSION_TTL, userId, passwordHash, authRevision).run();
  return result.meta.changes ? token : null;
}

// Only an active user has a session. Deactivation takes effect on the next request.
export async function readSession(db: DB, { token, now }: { token: string; now: number }): Promise<Session | null> {
  const hash = await sha256Hex(token);
  const row = await db.prepare(`SELECT s.expires_at, u.id, u.name, u.email, u.role, u.consent_version, u.data_revision, u.data_erasing, u.auth_revision FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.status = 'active'`).bind(hash, now)
    .first<{ expires_at: number; id: string; name: string; email: string; role: Role; consent_version: string | null; data_revision: string; data_erasing: number; auth_revision: string }>();
  if (!row) return null;
  if (now - (row.expires_at - SESSION_TTL) >= RENEW_AFTER) {
    await db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').bind(now + SESSION_TTL, hash).run();
  }
  return { userId: row.id, name: row.name, email: row.email, role: row.role, consented: row.consent_version === CONSENT_VERSION, dataRevision: row.data_revision, erasing: row.data_erasing === 1, authRevision: row.auth_revision, sessionHash: hash };
}

export const endSession = async (db: DB, token: string): Promise<void> => {
  await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run();
};

export const endSessions = async (db: DB, userId: string): Promise<void> => {
  await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
};
