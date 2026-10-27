import type { DB } from '../db.ts';
import { html, redirect, form, clientIp, sessionCookie, clearCookie, cookie } from '../http.ts';
import { verifyPassword, hashPassword } from './passwords.ts';
import { consumeToken, type TokenPurpose } from './tokens.ts';
import { createSession, endSession, endSessions } from './sessions.ts';
import { loginView, setPasswordView, messageView } from '../views.ts';

const WINDOW = 15 * 60;
const LIMITS = { email: 5, ip: 20 };
const GENERIC = 'Correo o contraseña incorrectos.';
const MIN_PASSWORD = 10;

const failures = async (db: DB, key: string, now: number): Promise<number> =>
  (await db.prepare('SELECT count(*) AS n FROM login_failures WHERE key = ? AND at > ?').bind(key, now - WINDOW).first<number>('n')) ?? 0;

export const loginPage = (): Response => html(loginView());

export async function login(request: Request, db: DB, now: number): Promise<Response> {
  const { email = '', password = '' } = await form(request);
  const emailKey = `email:${email.trim().toLowerCase()}`;
  const ipKey = `ip:${clientIp(request)}`;
  if (await failures(db, emailKey, now) >= LIMITS.email || await failures(db, ipKey, now) >= LIMITS.ip) {
    return html(loginView(GENERIC), 429);
  }
  const user = await db.prepare("SELECT id, password_hash FROM users WHERE email = ? AND status = 'active'")
    .bind(email.trim()).first<{ id: string; password_hash: string | null }>();
  if (!user?.password_hash || !(await verifyPassword(password, user.password_hash))) {
    const record = db.prepare('INSERT INTO login_failures (key, at) VALUES (?, ?)');
    await db.batch([record.bind(emailKey, now), record.bind(ipKey, now), db.prepare('DELETE FROM login_failures WHERE at <= ?').bind(now - WINDOW)]);
    return html(loginView(GENERIC), 401);
  }
  await db.prepare('DELETE FROM login_failures WHERE key = ?').bind(emailKey).run();
  return redirect('/app/', { 'set-cookie': sessionCookie(await createSession(db, { userId: user.id, now })) });
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
  const userId = await consumeToken(db, { token: t, purpose, now });
  if (!userId) return html(messageView('Enlace vencido', 'Este enlace ya se usó o venció. Pídele a Mauricio uno nuevo.'), 400);
  const changed = await db.prepare("UPDATE users SET password_hash = ?, status = 'active', updated_at = ? WHERE id = ? AND status != 'deactivated'")
    .bind(await hashPassword(password), now, userId).run();
  if (!changed.meta.changes) return html(messageView('Cuenta inactiva', 'Tu cuenta está desactivada. Escríbele a Mauricio.'), 403);
  await endSessions(db, userId);
  return redirect('/app/', { 'set-cookie': sessionCookie(await createSession(db, { userId, now })) });
}

export async function logout(request: Request, db: DB): Promise<Response> {
  const token = cookie(request);
  if (token) await endSession(db, token);
  return redirect('/entrar/', { 'set-cookie': clearCookie() });
}
