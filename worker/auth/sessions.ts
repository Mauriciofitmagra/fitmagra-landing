import type { DB } from '../db.ts';
import { randomToken, sha256Hex } from './tokens.ts';

export const SESSION_TTL = 30 * 24 * 3600;
const RENEW_AFTER = 24 * 3600;

export type Role = 'member' | 'admin';
export interface Session { userId: string; name: string; email: string; role: Role; consented: boolean }

export async function createSession(db: DB, { userId, now }: { userId: string; now: number }): Promise<string> {
  const token = randomToken();
  await db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256Hex(token), userId, now, now + SESSION_TTL).run();
  return token;
}

// Only an active user has a session. Deactivation takes effect on the next request.
export async function readSession(db: DB, { token, now }: { token: string; now: number }): Promise<Session | null> {
  const hash = await sha256Hex(token);
  const row = await db.prepare(`SELECT s.expires_at, u.id, u.name, u.email, u.role, u.consent_version FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.status = 'active'`).bind(hash, now)
    .first<{ expires_at: number; id: string; name: string; email: string; role: Role; consent_version: string | null }>();
  if (!row) return null;
  if (now - (row.expires_at - SESSION_TTL) >= RENEW_AFTER) {
    await db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').bind(now + SESSION_TTL, hash).run();
  }
  return { userId: row.id, name: row.name, email: row.email, role: row.role, consented: row.consent_version !== null };
}

export const endSession = async (db: DB, token: string): Promise<void> => {
  await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run();
};

export const endSessions = async (db: DB, userId: string): Promise<void> => {
  await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
};
