import type { DB } from '../db.ts';
import { html, redirect, form, clientIp, sessionCookie, clearCookie, cookie } from '../http.ts';
import { verifyPassword, hashPassword } from './passwords.ts';
import { randomToken, sha256Hex, type TokenPurpose } from './tokens.ts';
import { createSession, endSession, SESSION_TTL } from './sessions.ts';
import { loginView, setPasswordView, messageView } from '../views.ts';

const WINDOW = 15 * 60;
const LIMITS = { email: 5, ip: 20 };
const GENERIC = 'Correo o contraseña incorrectos.';
const MIN_PASSWORD = 10;

const failures = async (db: DB, key: string, now: number): Promise<number> =>
  (await db.prepare('SELECT count(*) AS n FROM login_failures WHERE key = ? AND at > ?').bind(key, now - WINDOW).first<number>('n')) ?? 0;

export const loginPage = (request: Request): Response => html(loginView('', new URL(request.url).searchParams.get('clave') === 'actualizada'));

export async function login(request: Request, db: DB, now: number): Promise<Response> {
  const { email = '', password = '' } = await form(request);
  const emailKey = `email:${email.trim().toLowerCase()}`;
  const ipKey = `ip:${clientIp(request)}`;
  if (await failures(db, emailKey, now) >= LIMITS.email || await failures(db, ipKey, now) >= LIMITS.ip) {
    return html(loginView(GENERIC), 429);
  }
  const user = await db.prepare("SELECT id, password_hash, auth_revision FROM users WHERE lower(email) = lower(?) AND status = 'active'")
    .bind(email.trim()).first<{ id: string; password_hash: string | null; auth_revision: string }>();
  if (!user?.password_hash || !(await verifyPassword(password, user.password_hash))) {
    const record = db.prepare('INSERT INTO login_failures (key, at) VALUES (?, ?)');
    await db.batch([record.bind(emailKey, now), record.bind(ipKey, now), db.prepare('DELETE FROM login_failures WHERE at <= ?').bind(now - WINDOW)]);
    return html(loginView(GENERIC), 401);
  }
  await db.prepare('DELETE FROM login_failures WHERE key = ?').bind(emailKey).run();
  const session = await createSession(db, { userId: user.id, now, passwordHash: user.password_hash, authRevision: user.auth_revision });
  return session ? redirect('/app/', { 'set-cookie': sessionCookie(session) }) : html(loginView(GENERIC), 401);
}

export function setPasswordPage(request: Request): Response {
  const url = new URL(request.url);
  return html(setPasswordView(url.searchParams.get('t') ?? '', url.searchParams.get('p') ?? 'invite'));
}

export async function setPassword(request: Request, db: DB, now: number): Promise<Response> {
  const { t = '', p = '', password = '', confirm = '' } = await form(request);
  const purpose: TokenPurpose | null = p === 'invite' || p === 'reset' ? p : null;
  if (!purpose) return html(messageView('Enlace no válido', 'Pídele a Mauricio un enlace nuevo.'), 400);
  if (password.length < MIN_PASSWORD) return html(setPasswordView(t, p, `La contraseña necesita ${MIN_PASSWORD} caracteres o más.`), 400);
  if (password !== confirm) return html(setPasswordView(t, p, 'Las dos contraseñas no coinciden.'), 400);
  const tokenHash = await sha256Hex(t);
  const candidate = await db.prepare(`SELECT t.user_id, u.status FROM auth_tokens t JOIN users u ON u.id = t.user_id
    WHERE t.token_hash = ? AND t.purpose = ? AND t.used_at IS NULL AND t.expires_at > ?`)
    .bind(tokenHash, purpose, now).first<{ user_id: string; status: string }>();
  if (!candidate) return html(messageView('Enlace vencido', 'Este enlace ya se usó o venció. Pídele a Mauricio uno nuevo.'), 400);
  if (candidate.status === 'deactivated') return html(messageView('Cuenta inactiva', 'Tu cuenta está desactivada. Escríbele a Mauricio.'), 403);
  const userId = candidate.user_id;
  const valid = `SELECT 1 FROM auth_tokens WHERE token_hash = ? AND user_id = ? AND purpose = ? AND used_at IS NULL AND expires_at > ?`;
  const session = randomToken();
  const sessionHash = await sha256Hex(session);
  const [changed] = await db.batch([
    db.prepare(`UPDATE users SET password_hash = ?, status = 'active', updated_at = ? WHERE id = ? AND status != 'deactivated' AND EXISTS (${valid})`)
      .bind(await hashPassword(password), now, userId, tokenHash, userId, purpose, now),
    db.prepare(`DELETE FROM sessions WHERE user_id = ? AND EXISTS (${valid}) AND EXISTS (SELECT 1 FROM users WHERE id = ? AND status = 'active')`)
      .bind(userId, tokenHash, userId, purpose, now, userId),
    db.prepare(`INSERT INTO sessions (token_hash, user_id, created_at, expires_at) SELECT ?, id, ?, ? FROM users WHERE id = ? AND status = 'active' AND EXISTS (${valid})`)
      .bind(sessionHash, now, now + SESSION_TTL, userId, tokenHash, userId, purpose, now),
    db.prepare(`DELETE FROM auth_tokens WHERE user_id = ? AND token_hash != ? AND EXISTS (${valid}) AND EXISTS (SELECT 1 FROM users WHERE id = ? AND status = 'active')`)
      .bind(userId, tokenHash, tokenHash, userId, purpose, now, userId),
    db.prepare("UPDATE auth_tokens SET used_at = ? WHERE token_hash = ? AND user_id = ? AND purpose = ? AND used_at IS NULL AND expires_at > ? AND EXISTS (SELECT 1 FROM users WHERE id = ? AND status = 'active')")
      .bind(now, tokenHash, userId, purpose, now, userId),
  ]);
  if (!changed.meta.changes) return html(messageView('Enlace vencido', 'Este enlace ya se usó o venció. Pídele a Mauricio uno nuevo.'), 400);
  return redirect('/app/', { 'set-cookie': sessionCookie(session) });
}

export async function logout(request: Request, db: DB): Promise<Response> {
  const token = cookie(request);
  if (token) await endSession(db, token);
  return redirect('/entrar/', { 'set-cookie': clearCookie() });
}
