import type { DB } from '../db.ts';

export type TokenPurpose = 'invite' | 'reset';
export const INVITE_TTL = 72 * 3600;
// 24 hours, not 1, because a person relays the link over WhatsApp (spec section 10).
export const RESET_TTL = 24 * 3600;

const hex = (buf: ArrayBuffer): string => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export const randomToken = (): string =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const sha256Hex = async (s: string): Promise<string> => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));

export async function issueToken(db: DB, { userId, purpose, now }: { userId: string; purpose: TokenPurpose; now: number }): Promise<string> {
  const token = randomToken();
  const ttl = purpose === 'invite' ? INVITE_TTL : RESET_TTL;
  await db.prepare('INSERT INTO auth_tokens (token_hash, user_id, purpose, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256Hex(token), userId, purpose, now + ttl).run();
  return token;
}

// Marks the token used and returns its user in one statement, so two concurrent uses cannot both succeed.
export async function consumeToken(db: DB, { token, purpose, now }: { token: string; purpose: TokenPurpose; now: number }): Promise<string | null> {
  return db.prepare('UPDATE auth_tokens SET used_at = ? WHERE token_hash = ? AND purpose = ? AND used_at IS NULL AND expires_at > ? RETURNING user_id')
    .bind(now, await sha256Hex(token), purpose, now).first<string>('user_id');
}
