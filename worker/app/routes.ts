import type { DB } from '../db.ts';
import type { Session } from '../auth/sessions.ts';
import { html, redirect, form, esc } from '../http.ts';
import { messageView } from '../views.ts';
import { verifyPassword, hashPassword } from '../auth/passwords.ts';
import { checkFile, fileKey, findFile, stream, PHOTO, type Bucket } from '../files.ts';
import { LOGS, type LogKind, parseEntry, isDate } from './logs.ts';
import { appPage, entryForm, entryTable, consentView, coachView, CONSENT_VERSION } from './views.ts';
import { billingSection } from '../billing/routes.ts';

// Members live in 14 countries; the default date follows Bogotá, where the coach works. They can change it.
export const today = (now: number): string => new Date(now * 1000).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

const kg = (g: number): string => (g / 1000).toLocaleString('es-CO', { maximumFractionDigits: 1 });
const signedKg = (g: number): string => `${g < 0 ? '−' : g > 0 ? '+' : ''}${kg(Math.abs(g))} kg`;

export async function home(db: DB, s: Session): Promise<Response> {
  const first = await db.prepare('SELECT weight_g FROM weights WHERE user_id = ? ORDER BY measured_on, rowid LIMIT 1').bind(s.userId).first<number>('weight_g');
  const last = await db.prepare('SELECT weight_g, measured_on FROM weights WHERE user_id = ? ORDER BY measured_on DESC, rowid DESC LIMIT 1').bind(s.userId).first<{ weight_g: number; measured_on: string }>();
  const photo = await db.prepare('SELECT max(taken_on) AS d FROM photos WHERE user_id = ?').bind(s.userId).first<string | null>('d');
  return html(appPage('Inicio', '/app/', `<h1 class="app-title">Hola, ${esc(s.name)}</h1>
<dl class="summary">
<div><dt>Último peso</dt><dd>${last ? `${kg(last.weight_g)} kg, ${esc(last.measured_on)}` : 'Sin registros'}</dd></div>
<div><dt>Cambio desde el inicio</dt><dd>${last && first !== null ? signedKg(last.weight_g - first) : 'Sin registros'}</dd></div>
<div><dt>Últimas fotos</dt><dd>${photo ? esc(photo) : 'Sin fotos'}</dd></div>
</dl>
<p><a class="button" href="/app/peso/">Registrar peso</a></p>`, s));
}

export async function consent(request: Request, db: DB, s: Session, now: number): Promise<Response> {
  if (request.method === 'GET') return html(consentView(s));
  const { accept } = await form(request);
  if (accept !== 'yes') return html(consentView(s, 'Para continuar necesitas aceptar.'), 400);
  await db.prepare('UPDATE users SET consent_version = ?, consent_at = ? WHERE id = ?').bind(CONSENT_VERSION, now, s.userId).run();
  return redirect('/app/');
}

const listRows = async (db: DB, kind: LogKind, userId: string, date?: string) =>
  (await db.prepare(`SELECT * FROM ${kind.table} WHERE user_id = ?${date ? ` AND ${kind.dateCol} = ?` : ''} ORDER BY ${kind.dateCol} DESC, rowid DESC LIMIT 200`)
    .bind(...(date ? [userId, date] : [userId])).all<Record<string, unknown>>()).results;

async function logScreen(db: DB, kind: LogKind, s: Session, now: number, error = '', status = 200): Promise<Response> {
  const rows = await listRows(db, kind, s.userId);
  return html(appPage(kind.title, kind.path, `<h1 class="app-title">${kind.title}</h1>${entryForm(kind, today(now), error)}${entryTable(kind, rows)}`, s), status);
}

export const logList = (db: DB, key: keyof typeof LOGS, s: Session, now: number) => logScreen(db, LOGS[key], s, now);

export async function logAdd(request: Request, db: DB, key: keyof typeof LOGS, s: Session, now: number): Promise<Response> {
  const kind = LOGS[key];
  const parsed = parseEntry(kind, await form(request));
  if ('error' in parsed) return key === 'nutrition' ? nutrition(request, db, s, now, parsed.error, 400) : logScreen(db, kind, s, now, parsed.error, 400);
  const cols = Object.keys(parsed.values);
  await db.prepare(`INSERT INTO ${kind.table} (id, user_id, ${cols.join(', ')}) VALUES (?, ?, ${cols.map(() => '?').join(', ')})`)
    .bind(crypto.randomUUID(), s.userId, ...Object.values(parsed.values)).run();
  return redirect(key === 'nutrition' ? `${kind.path}?fecha=${parsed.values[kind.dateCol]}` : kind.path);
}

// Deleting someone else's row matches nothing and returns 404, the same as a row that does not exist.
export async function logDelete(db: DB, key: keyof typeof LOGS, s: Session, id: string): Promise<Response> {
  const kind = LOGS[key];
  const r = await db.prepare(`DELETE FROM ${kind.table} WHERE id = ? AND user_id = ?`).bind(id, s.userId).run();
  return r.meta.changes ? redirect(kind.path) : html(messageView('No encontrado', 'Ese registro no existe.', s), 404);
}

export async function nutrition(request: Request, db: DB, s: Session, now: number, error = '', status = 200): Promise<Response> {
  const kind = LOGS.nutrition;
  const asked = new URL(request.url).searchParams.get('fecha') ?? '';
  const day = isDate(asked) ? asked : today(now);
  const rows = await listRows(db, kind, s.userId, day);
  const t = await db.prepare('SELECT kcal, protein_g, carbs_g, fat_g FROM nutrition_targets WHERE user_id = ?').bind(s.userId).first<Record<string, number>>();
  const sum = (col: string) => rows.reduce((acc, r) => acc + (Number(r[col]) || 0), 0);
  const totals = t ? `<ul class="totals">
<li>${sum('kcal')} de ${t.kcal} kcal</li><li>Proteína ${sum('protein_g')} de ${t.protein_g} g</li>
<li>Carbohidratos ${sum('carbs_g')} de ${t.carbs_g} g</li><li>Grasa ${sum('fat_g')} de ${t.fat_g} g</li></ul>` : '<p>Mauricio todavía no ha cargado tus metas diarias.</p>';
  return html(appPage('Nutrición', kind.path, `<h1 class="app-title">Nutrición</h1>
${await documentsList(db, s.userId, 'nutrition_plan')}
<h2 class="app-subtitle">Tu día, ${esc(day)}</h2>
<form method="get" action="${kind.path}" class="inline-form"><label class="field"><span>Ver otro día</span><input type="date" name="fecha" value="${esc(day)}"></label><button class="link">Ver</button></form>
${totals}
${entryTable(kind, rows)}
<h2 class="app-subtitle">Registrar comida</h2>
${entryForm(kind, day, error)}`, s), status);
}

async function documentsList(db: DB, userId: string, kind: 'training_plan' | 'nutrition_plan'): Promise<string> {
  const { results } = await db.prepare('SELECT id, title, published_at FROM documents WHERE user_id = ? AND kind = ? ORDER BY published_at DESC').bind(userId, kind).all<{ id: string; title: string; published_at: number }>();
  if (!results.length) return '<p>Mauricio todavía no ha cargado este plan.</p>';
  const [current, ...older] = results;
  return `<p><a class="button" href="/app/archivos/${esc(current.id)}">Abrir ${esc(current.title)} (PDF)</a></p>
${older.length ? `<details><summary>Versiones anteriores</summary><ul>${older.map((d) => `<li><a href="/app/archivos/${esc(d.id)}">${esc(d.title)}</a></li>`).join('')}</ul></details>` : ''}`;
}

export const plan = async (db: DB, s: Session): Promise<Response> =>
  html(appPage('Plan', '/app/plan/', `<h1 class="app-title">Tu plan de entrenamiento</h1>${await documentsList(db, s.userId, 'training_plan')}`, s));

export async function photos(db: DB, s: Session, now: number, error = '', status = 200): Promise<Response> {
  const { results } = await db.prepare('SELECT id, taken_on, pose FROM photos WHERE user_id = ? ORDER BY taken_on DESC, created_at DESC').bind(s.userId).all<{ id: string; taken_on: string; pose: string }>();
  const poses: Record<string, string> = { front: 'Frente', side: 'Perfil', back: 'Espalda', other: 'Otra' };
  return html(appPage('Fotos', '/app/fotos/', `<h1 class="app-title">Fotos de progreso</h1>
<p>Solo tú y el equipo de FitMagra ven estas fotos. Antes de subirlas, tu teléfono las reduce y les quita la ubicación.</p>
${error ? `<p class="notice" role="alert">${esc(error)}</p>` : ''}
<form method="post" action="/app/fotos/" enctype="multipart/form-data" class="app-form" data-resize>
<label class="field"><span>Fecha</span><input type="date" name="date" value="${today(now)}" required></label>
<label class="field"><span>Pose</span><select name="pose">${Object.entries(poses).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
<label class="field"><span>Foto (JPEG o WebP, 8 MB o menos)</span><input type="file" name="file" accept="image/jpeg,image/webp" required></label>
<button class="button">Subir</button>
</form>
<script src="/assets/resize.js" defer></script>
<ul class="photo-grid">${results.map((p) => `<li><img src="/app/archivos/${esc(p.id)}" alt="Foto ${esc(poses[p.pose] ?? p.pose)} del ${esc(p.taken_on)}" loading="lazy"><span>${esc(p.taken_on)}, ${esc(poses[p.pose] ?? p.pose)}</span>
<form method="post" action="/app/fotos/${esc(p.id)}/borrar/"><button class="link">Borrar</button></form></li>`).join('\n')}</ul>`, s), status);
}

export async function photoAdd(request: Request, db: DB, files: Bucket, s: Session, now: number): Promise<Response> {
  const data = await request.formData();
  const date = String(data.get('date') ?? '');
  const pose = String(data.get('pose') ?? '');
  if (!isDate(date) || !['front', 'side', 'back', 'other'].includes(pose)) return photos(db, s, now, 'Revisa la fecha y la pose.', 400);
  const checked = await checkFile(data.get('file'), PHOTO);
  if (!checked.ok) return photos(db, s, now, checked.error, checked.status);
  const key = fileKey(s.userId, 'photos', checked.type === 'image/webp' ? 'webp' : 'jpg');
  await files.put(key, checked.bytes, { httpMetadata: { contentType: checked.type } });
  await db.prepare('INSERT INTO photos (id, user_id, taken_on, pose, r2_key, content_type, bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), s.userId, date, pose, key, checked.type, checked.bytes.byteLength, now).run();
  return redirect('/app/fotos/');
}

export async function photoDelete(db: DB, files: Bucket, s: Session, id: string): Promise<Response> {
  const row = await db.prepare('SELECT r2_key FROM photos WHERE id = ? AND user_id = ?').bind(id, s.userId).first<string>('r2_key');
  if (!row) return html(messageView('No encontrado', 'Esa foto no existe.', s), 404);
  await files.delete(row);
  await db.prepare('DELETE FROM photos WHERE id = ? AND user_id = ?').bind(id, s.userId).run();
  return redirect('/app/fotos/');
}

export async function file(db: DB, files: Bucket, s: Session, id: string): Promise<Response> {
  const found = await findFile(db, s, id);
  const res = found && (await stream(files, found.r2_key, found.content_type));
  return res || html(messageView('No encontrado', 'Ese archivo no existe.', s), 404);
}

export const coach = (s: Session): Response => html(coachView(s));

export const account = async (db: DB, s: Session, now: number, error = '', status = 200): Promise<Response> => html(appPage('Cuenta', '/app/cuenta/', `<h1 class="app-title">Tu cuenta</h1>
<p>${esc(s.name)}, ${esc(s.email)}</p>
${await billingSection(db, s, today(now))}
<h2 class="app-subtitle">Cambiar contraseña</h2>
${error ? `<p class="notice" role="alert">${esc(error)}</p>` : ''}
<form method="post" action="/app/cuenta/clave/" class="app-form">
<label class="field"><span>Contraseña actual</span><input type="password" name="current" required autocomplete="current-password"></label>
<label class="field"><span>Nueva, 10 caracteres o más</span><input type="password" name="password" required minlength="10" autocomplete="new-password"></label>
<label class="field"><span>Repítela</span><input type="password" name="confirm" required minlength="10" autocomplete="new-password"></label>
<button class="button">Cambiar</button>
</form>
<form method="post" action="/salir/"><button class="link">Cerrar sesión</button></form>`, s), status);

export async function changePassword(request: Request, db: DB, s: Session, now: number): Promise<Response> {
  const { current = '', password = '', confirm = '' } = await form(request);
  const stored = await db.prepare('SELECT password_hash FROM users WHERE id = ?').bind(s.userId).first<string>('password_hash');
  if (!stored || !(await verifyPassword(current, stored))) return account(db, s, now, 'La contraseña actual no es correcta.', 400);
  if (password.length < 10) return account(db, s, now, 'La contraseña nueva necesita 10 caracteres o más.', 400);
  if (password !== confirm) return account(db, s, now, 'Las dos contraseñas no coinciden.', 400);
  await db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').bind(await hashPassword(password), now, s.userId).run();
  return redirect('/app/cuenta/');
}
