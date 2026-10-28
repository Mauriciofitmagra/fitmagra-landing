import type { DB } from '../db.ts';
import type { Session } from '../auth/sessions.ts';
import { randomToken, sha256Hex, INVITE_TTL, RESET_TTL, type TokenPurpose } from '../auth/tokens.ts';
import { html, redirect, form, esc } from '../http.ts';
import { page, messageView } from '../views.ts';
import { checkFile, fileKey, beginUpload, discardUpload, PDF, type Bucket } from '../files.ts';
import { LOGS, type LogKind } from '../app/logs.ts';
import { entryTable } from '../app/views.ts';
import { PLANS, isPlan } from '../billing/plans.ts';
import { today } from '../app/routes.ts';

const audit = (db: DB, actor: Session, action: string, target: string | null, now: number, detail: string | null = null) =>
  db.prepare('INSERT INTO audit_log (actor_id, action, target_user_id, at, detail) VALUES (?, ?, ?, ?, ?)').bind(actor.userId, action, target, now, detail);

interface Member { id: string; name: string; email: string; role: string; status: string }

export async function list(db: DB, session: Session): Promise<Response> {
  const { results } = await db.prepare('SELECT id, name, email, role, status FROM users ORDER BY name').all<Member>();
  const rows = results.map((m) => `<tr><td><a href="/admin/miembros/${esc(m.id)}/">${esc(m.name)}</a></td><td>${esc(m.email)}</td><td>${esc(m.role)}</td><td>${esc(m.status)}</td>
<td class="actions">
${m.status === 'active' ? `<form method="post" action="/admin/miembros/${esc(m.id)}/reset/"><button class="link">Enlace de contraseña</button></form>` : ''}
${m.status === 'invited' || m.status === 'deactivated' ? `<form method="post" action="/admin/miembros/${esc(m.id)}/reactivar/"><button class="link">${m.status === 'invited' ? 'Nueva invitación' : 'Reactivar'}</button></form>` : ''}
${m.status !== 'deactivated' ? `<form method="post" action="/admin/miembros/${esc(m.id)}/desactivar/"><button class="link">Desactivar</button></form>` : ''}
</td></tr>`).join('\n');
  return html(page('Miembros', `<h1 class="app-title">Miembros</h1>
<p class="notice">Facturación: Próximamente. <span lang="en">Billing: Coming soon.</span></p>
<div class="table-scroll" role="region" aria-label="Miembros" tabindex="0"><table class="table"><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th></th></tr></thead><tbody>
${rows}
</tbody></table></div>
<h2 class="app-subtitle">Crear miembro</h2>
<form method="post" action="/admin/miembros/" class="app-form">
<label class="field"><span>Nombre</span><input name="name" required></label>
<label class="field"><span>Correo</span><input name="email" type="email" required></label>
<label class="field"><span>Rol</span><select name="role"><option value="member">Miembro</option><option value="admin">Admin</option></select></label>
<label class="field"><span>Plan</span><select name="plan">${Object.entries(PLANS).map(([k, p]) => `<option value="${k}">${p.name}</option>`).join('')}</select></label>
<label class="field"><span>WhatsApp, con indicativo</span><input name="phone" inputmode="tel" placeholder="+57 300 000 0000"></label>
<button class="button">Crear y generar invitación</button>
</form>`, session));
}

// The link is shown once; only its hash is stored. The admin sends it by WhatsApp (spec Q16).
const linkView = (request: Request, session: Session, title: string, token: string, purpose: TokenPurpose) => {
  const link = `${new URL(request.url).origin}/entrar/clave/?t=${token}&p=${purpose}`;
  return html(page(title, `<h1 class="app-title">${esc(title)}</h1>
<p>Envía este enlace por WhatsApp. Solo se muestra esta vez y vence en ${purpose === 'invite' ? '72' : '24'} horas.</p>
<p class="link-once"><a href="${esc(link)}">${esc(link)}</a></p>
<p><a href="/admin/">Volver a miembros</a></p>`, session));
};

export async function create(request: Request, db: DB, session: Session, now: number): Promise<Response> {
  const { name = '', email = '', role = 'member', plan = '', phone = '' } = await form(request);
  const digits = phone.replace(/\D/g, '');
  if (!name.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) || !['member', 'admin'].includes(role) || (role === 'member' && !isPlan(plan)) || (digits && (digits.length < 8 || digits.length > 15))) {
    return html(messageView('Datos incompletos', 'Revisa el nombre, el correo y el rol.', session), 400);
  }
  const id = crypto.randomUUID();
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  try {
    await db.batch([
      db.prepare("INSERT INTO users (id, email, name, role, status, phone, created_at, updated_at) VALUES (?, ?, ?, ?, 'invited', ?, ?, ?)").bind(id, email.trim(), name.trim(), role, digits || null, now, now),
      // Every member starts with an assigned plan and a pending subscription (spec 11, 13).
      ...(role === 'member' ? [db.prepare("INSERT INTO subscriptions (user_id, plan, status, updated_at) VALUES (?, ?, 'pending', ?)").bind(id, plan, now)] : []),
      db.prepare("INSERT INTO auth_tokens (token_hash, user_id, purpose, expires_at) VALUES (?, ?, 'invite', ?)").bind(tokenHash, id, now + INVITE_TTL),
      audit(db, session, 'member.create', id, now, role === 'member' ? `member, ${plan}` : role),
    ]);
  } catch (error) {
    if (String(error).includes('UNIQUE constraint failed: users.email')) return html(messageView('Correo en uso', 'Ya existe una cuenta con ese correo.', session), 409);
    throw error;
  }
  return linkView(request, session, 'Invitación creada', token, 'invite');
}

export async function detail(db: DB, session: Session, id: string, now: number): Promise<Response> {
  const m = await db.prepare('SELECT id, name, email, role, status FROM users WHERE id = ?').bind(id).first<Member>();
  if (!m) return html(messageView('No existe', 'Ese miembro no existe.', session), 404);
  const rows = async (kind: LogKind) => (await db.prepare(`SELECT * FROM ${kind.table} WHERE user_id = ? ORDER BY ${kind.dateCol} DESC LIMIT 50`).bind(id).all<Record<string, unknown>>()).results;
  const t = await db.prepare('SELECT kcal, protein_g, carbs_g, fat_g FROM nutrition_targets WHERE user_id = ?').bind(id).first<Record<string, number>>();
  const docs = (await db.prepare('SELECT id, kind, title FROM documents WHERE user_id = ? ORDER BY published_at DESC').bind(id).all<{ id: string; kind: string; title: string }>()).results;
  const photos = (await db.prepare('SELECT id, taken_on, pose FROM photos WHERE user_id = ? ORDER BY taken_on DESC').bind(id).all<{ id: string; taken_on: string; pose: string }>()).results;
  const state = await db.prepare("SELECT data_revision, (SELECT id FROM erasure_jobs WHERE user_id = users.id AND status = 'pending') AS pending FROM users WHERE id = ?").bind(id).first<{ data_revision: string; pending: string | null }>();
  if (!state) return html(messageView('No existe', 'Ese miembro no existe.', session), 404);
  const pending = state.pending;
  const operation = pending ?? crypto.randomUUID();
  const num = (name: string, label: string, value: unknown) => `<label class="field"><span>${label}</span><input name="${name}" inputmode="numeric" value="${esc(value ?? '')}" required></label>`;
  return html(page(m.name, `<h1 class="app-title">${esc(m.name)}</h1>
<p>${esc(m.email)}, ${esc(m.role)}, ${esc(m.status)}</p>
<p class="notice">Pagos: Próximamente. <span lang="en">Payments: Coming soon.</span></p>
<h2 class="app-subtitle">Planes en PDF</h2>
<ul>${docs.map((d) => `<li><a href="/app/archivos/${esc(d.id)}">${esc(d.title)}</a> (${d.kind === 'training_plan' ? 'entrenamiento' : 'nutrición'})</li>`).join('')}</ul>
<form method="post" action="/admin/miembros/${esc(id)}/documentos/" enctype="multipart/form-data" class="app-form">
<label class="field"><span>Tipo</span><select name="kind"><option value="training_plan">Plan de entrenamiento</option><option value="nutrition_plan">Plan de nutrición</option></select></label>
<label class="field"><span>Título</span><input name="title" required></label>
<label class="field"><span>PDF, 15 MB o menos</span><input type="file" name="file" accept="application/pdf" required></label>
<button class="button">Subir plan</button>
</form>
<h2 class="app-subtitle">Metas diarias de nutrición</h2>
<form method="post" action="/admin/miembros/${esc(id)}/metas/" class="app-form">
${num('kcal', 'kcal', t?.kcal)}${num('protein', 'Proteína (g)', t?.protein_g)}${num('carbs', 'Carbohidratos (g)', t?.carbs_g)}${num('fat', 'Grasa (g)', t?.fat_g)}
<button class="button">Guardar metas</button>
</form>
<h2 class="app-subtitle">Peso</h2>${entryTable(LOGS.weights, await rows(LOGS.weights), { readOnly: true })}
<h2 class="app-subtitle">Entrenos</h2>${entryTable(LOGS.workouts, await rows(LOGS.workouts), { readOnly: true })}
<h2 class="app-subtitle">Nutrición</h2>${entryTable(LOGS.nutrition, await rows(LOGS.nutrition), { readOnly: true })}
<h2 class="app-subtitle">Fotos</h2>
<ul class="photo-grid">${photos.map((p) => `<li><img src="/app/archivos/${esc(p.id)}" alt="Foto del ${esc(p.taken_on)}" loading="lazy"><span>${esc(p.taken_on)}, ${esc(p.pose)}</span></li>`).join('')}</ul>
<h2 class="app-subtitle">Borrar todos los datos</h2>
<p>Borra peso, entrenos, nutrición, fotos y planes de este miembro. No se puede deshacer. Escribe su correo para confirmar.</p>
<form method="post" action="/admin/miembros/${esc(id)}/borrar-datos/" class="app-form">
<input type="hidden" name="operation" value="${esc(operation)}">
<input type="hidden" name="revision" value="${esc(state.data_revision)}">
${pending ? '<p class="notice">Borrado pendiente. Reintenta cuando terminen las cargas; si persiste, contacta a soporte.</p>' : ''}
<label class="field"><span>Correo del miembro</span><input name="confirm" required></label>
<button class="button">Borrar datos</button>
</form>`, session));
}

export async function uploadDocument(request: Request, db: DB, files: Bucket, session: Session, now: number, id: string): Promise<Response> {
  const member = await db.prepare('SELECT data_revision FROM users WHERE id = ?').bind(id).first<{ data_revision: string }>();
  if (!member) return html(messageView('No existe', 'Ese miembro no existe.', session), 404);
  const data = await request.formData();
  const kind = String(data.get('kind') ?? '');
  const title = String(data.get('title') ?? '').trim().slice(0, 120);
  if (!['training_plan', 'nutrition_plan'].includes(kind) || !title) return html(messageView('Datos incompletos', 'Elige el tipo y escribe un título.', session), 400);
  const checked = await checkFile(data.get('file'), PDF);
  if (!checked.ok) return html(messageView('Archivo rechazado', checked.error, session), checked.status);
  const key = fileKey(id, 'docs', 'pdf');
  if (!await beginUpload(db, id, member.data_revision, key, now)) return html(messageView('Borrado en curso', 'La cuenta cambió. Vuelve a intentarlo más tarde.', session), 409);
  await files.put(key, checked.bytes, { httpMetadata: { contentType: 'application/pdf' } });
  const [inserted] = await db.batch([
    db.prepare(`INSERT INTO documents (id, user_id, kind, title, r2_key, bytes, published_at)
      SELECT ?, id, ?, ?, ?, ?, ? FROM users WHERE id = ? AND data_revision = ? AND data_erasing = 0
      AND EXISTS (SELECT 1 FROM upload_intents WHERE r2_key = ? AND user_id = ?)`)
      .bind(crypto.randomUUID(), kind, title, key, checked.bytes.byteLength, now, id, member.data_revision, key, id),
    db.prepare('DELETE FROM upload_intents WHERE r2_key = ? AND EXISTS (SELECT 1 FROM documents WHERE r2_key = ?)').bind(key, key),
    db.prepare("INSERT INTO audit_log (actor_id, action, target_user_id, at, detail) SELECT ?, 'document.upload', ?, ?, ? WHERE EXISTS (SELECT 1 FROM documents WHERE r2_key = ?)")
      .bind(session.userId, id, now, kind, key),
  ]);
  if (!inserted.meta.changes) {
    await discardUpload(db, files, key);
    return html(messageView('Borrado en curso', 'El plan no se guardó. Vuelve a intentarlo más tarde.', session), 409);
  }
  return redirect(`/admin/miembros/${id}/`);
}

export async function setTargets(request: Request, db: DB, session: Session, now: number, id: string): Promise<Response> {
  const member = await db.prepare('SELECT data_revision FROM users WHERE id = ?').bind(id).first<{ data_revision: string }>();
  if (!member) return html(messageView('No existe', 'Ese miembro no existe.', session), 404);
  const f = await form(request);
  const fields = ['kcal', 'protein', 'carbs', 'fat'];
  const v = fields.map((k) => Number(f[k]));
  if (fields.some((k) => !(f[k] ?? '').trim()) || v.some((n) => !Number.isInteger(n))) return html(messageView('Metas no válidas', 'Escribe números enteros.', session), 400);
  try {
    const [saved] = await db.batch([
      db.prepare(`INSERT INTO nutrition_targets (user_id, kcal, protein_g, carbs_g, fat_g, updated_at)
        SELECT id, ?, ?, ?, ?, ? FROM users WHERE id = ? AND data_revision = ? AND data_erasing = 0
        ON CONFLICT(user_id) DO UPDATE SET kcal = excluded.kcal, protein_g = excluded.protein_g, carbs_g = excluded.carbs_g, fat_g = excluded.fat_g, updated_at = excluded.updated_at`)
        .bind(...v, now, id, member.data_revision),
      db.prepare("INSERT INTO audit_log (actor_id, action, target_user_id, at, detail) SELECT ?, 'nutrition.targets', ?, ?, ? WHERE EXISTS (SELECT 1 FROM users WHERE id = ? AND data_revision = ? AND data_erasing = 0)")
        .bind(session.userId, id, now, v.join('/'), id, member.data_revision),
    ]);
    if (!saved.meta.changes) return html(messageView('Borrado en curso', 'Las metas no se guardaron. Vuelve a intentarlo más tarde.', session), 409);
  } catch (error) {
    if (String(error).includes('CHECK constraint failed')) return html(messageView('Metas fuera de rango', 'Revisa los valores: kcal entre 800 y 8000.', session), 400);
    throw error;
  }
  return redirect(`/admin/miembros/${id}/`);
}

// An unresolved upload or uncertain database outcome stays pending until it can be reconciled.
export async function deleteData(request: Request, db: DB, files: Bucket, session: Session, now: number, id: string): Promise<Response> {
  const m = await db.prepare('SELECT email FROM users WHERE id = ?').bind(id).first<string>('email');
  if (!m) return html(messageView('No existe', 'Ese miembro no existe.', session), 404);
  const { confirm = '', operation = '', revision = '' } = await form(request);
  if (confirm.trim().toLowerCase() !== m.toLowerCase()) return html(messageView('Confirmación incorrecta', 'Escribe el correo exacto del miembro.', session), 400);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operation)) return html(messageView('Solicitud no válida', 'Abre la ficha del miembro e inténtalo de nuevo.', session), 400);
  const pending = () => html(messageView('Borrado pendiente', 'Vuelve a la ficha del miembro y reintenta. Si el problema persiste, contacta a soporte.', session), 409);
  const job = await db.prepare('SELECT user_id, status FROM erasure_jobs WHERE id = ?').bind(operation).first<{ user_id: string; status: string }>();
  if (job && job.user_id !== id) return pending();
  if (job?.status === 'complete') return redirect(`/admin/miembros/${id}/`);
  const owner = crypto.randomUUID();
  if (job) {
    const acquired = await db.prepare("UPDATE users SET erasure_owner = ? WHERE id = ? AND data_erasing = 1 AND erasure_owner IS NULL AND EXISTS (SELECT 1 FROM erasure_jobs WHERE id = ? AND user_id = ? AND status = 'pending')")
      .bind(owner, id, operation, id).run();
    if (!acquired.meta.changes) return pending();
  } else {
    const [acquired] = await db.batch([
      db.prepare('UPDATE users SET data_revision = ?, data_erasing = 1, erasure_owner = ? WHERE id = ? AND data_erasing = 0 AND data_revision = ?').bind(crypto.randomUUID(), owner, id, revision),
      db.prepare("INSERT INTO erasure_jobs (id, user_id, status, created_at) SELECT ?, id, 'pending', ? FROM users WHERE id = ? AND erasure_owner = ?").bind(operation, now, id, owner),
    ]);
    if (!acquired.meta.changes) return pending();
  }
  const release = () => db.prepare('UPDATE users SET erasure_owner = NULL WHERE id = ? AND data_erasing = 1 AND erasure_owner = ?').bind(id, owner).run();
  if (await db.prepare('SELECT 1 FROM upload_intents WHERE user_id = ? LIMIT 1').bind(id).first()) {
    await release();
    return pending();
  }
  const keys = [
    ...(await db.prepare('SELECT r2_key FROM photos WHERE user_id = ?').bind(id).all<{ r2_key: string }>()).results,
    ...(await db.prepare('SELECT r2_key FROM documents WHERE user_id = ?').bind(id).all<{ r2_key: string }>()).results,
  ].map((r) => r.r2_key);
  try {
    if (keys.length) await files.delete(keys);
  } catch {
    await release();
    return pending();
  }
  const guard = "EXISTS (SELECT 1 FROM users WHERE id = ? AND data_erasing = 1 AND erasure_owner = ?) AND EXISTS (SELECT 1 FROM erasure_jobs WHERE id = ? AND user_id = ? AND status = 'pending') AND NOT EXISTS (SELECT 1 FROM upload_intents WHERE user_id = ?)";
  const args = [id, owner, operation, id, id];
  let result;
  try {
    result = await db.batch([
    ...['weights', 'workouts', 'nutrition_logs', 'nutrition_targets', 'photos', 'documents'].map((t) => db.prepare(`DELETE FROM ${t} WHERE user_id = ? AND ${guard}`).bind(id, ...args)),
    db.prepare(`UPDATE audit_log SET detail = NULL WHERE action = 'nutrition.targets' AND target_user_id = ? AND ${guard}`).bind(id, ...args),
    db.prepare(`INSERT INTO audit_log (actor_id, action, target_user_id, at, detail) SELECT ?, 'member.delete_data', ?, ?, ? WHERE ${guard}`).bind(session.userId, id, now, `${keys.length} files`, ...args),
    db.prepare(`UPDATE erasure_jobs SET status = 'complete' WHERE id = ? AND ${guard}`).bind(operation, ...args),
    db.prepare("UPDATE users SET data_erasing = 0, erasure_owner = NULL WHERE id = ? AND erasure_owner = ? AND EXISTS (SELECT 1 FROM erasure_jobs WHERE id = ? AND user_id = ? AND status = 'complete')").bind(id, owner, operation, id),
    ]);
  } catch {
    // A lost response can hide a committed batch; never release an uncertain owner.
    try {
      const status = await db.prepare('SELECT status FROM erasure_jobs WHERE id = ? AND user_id = ?').bind(operation, id).first<string>('status');
      if (status === 'complete') return redirect(`/admin/miembros/${id}/`);
    } catch { /* Keep the owner until an operator can establish the outcome. */ }
    return html(messageView('Borrado pendiente', 'No se pudo confirmar el resultado. Contacta a soporte antes de reintentar.', session), 503);
  }
  return result.at(-1)?.meta.changes ? redirect(`/admin/miembros/${id}/`) : pending();
}

export async function memberAction(request: Request, db: DB, session: Session, now: number, id: string, action: string): Promise<Response> {
  const account = await db.prepare('SELECT id, status, password_hash, auth_revision FROM users WHERE id = ?').bind(id).first<{ id: string; status: string; password_hash: string | null; auth_revision: string }>();
  if (!account) return html(messageView('No existe', 'Ese miembro no existe.', session), 404);
  if (action === 'reset') {
    if (account.status !== 'active' || !account.password_hash) return html(messageView('Cuenta inactiva', 'Reactiva la cuenta antes de generar un enlace.', session), 409);
    const token = randomToken();
    const tokenHash = await sha256Hex(token);
    const revision = crypto.randomUUID();
    const current = "SELECT 1 FROM users WHERE id = ? AND status = 'active' AND password_hash = ? AND auth_revision = ?";
    const [, , , issued] = await db.batch([
      db.prepare(`UPDATE users SET auth_revision = ? WHERE EXISTS (${current}) AND id = ?`)
        .bind(revision, id, account.password_hash, account.auth_revision, id),
      db.prepare(`DELETE FROM sessions WHERE user_id = ? AND EXISTS (${current})`).bind(id, id, account.password_hash, revision),
      db.prepare(`DELETE FROM auth_tokens WHERE user_id = ? AND EXISTS (${current})`).bind(id, id, account.password_hash, revision),
      db.prepare(`INSERT INTO auth_tokens (token_hash, user_id, purpose, expires_at) SELECT ?, id, 'reset', ? FROM users WHERE id = ? AND status = 'active' AND password_hash = ? AND auth_revision = ?`)
        .bind(tokenHash, now + RESET_TTL, id, account.password_hash, revision),
      db.prepare(`INSERT INTO audit_log (actor_id, action, target_user_id, at, detail) SELECT ?, 'member.reset', ?, ?, NULL WHERE EXISTS (${current})`)
        .bind(session.userId, id, now, id, account.password_hash, revision),
    ]);
    if (!issued.meta.changes) return html(messageView('Cuenta modificada', 'La cuenta cambió. Vuelve a intentarlo.', session), 409);
    return linkView(request, session, 'Enlace de contraseña', token, 'reset');
  }
  if (action === 'desactivar' || action === 'reactivar') {
    const revision = crypto.randomUUID();
    const token = action === 'reactivar' ? randomToken() : '';
    const tokenHash = token ? await sha256Hex(token) : '';
    const current = 'SELECT 1 FROM users WHERE id = ? AND auth_revision = ?';
    const [changed] = await db.batch([
      db.prepare(`UPDATE users SET status = ?, password_hash = CASE WHEN ? = 'reactivar' THEN NULL ELSE password_hash END, updated_at = ?, auth_revision = ?
        WHERE id = ? AND status = ? AND auth_revision = ? AND password_hash IS ?`)
        .bind(action === 'reactivar' ? 'invited' : 'deactivated', action, now, revision, id, account.status, account.auth_revision, account.password_hash),
      db.prepare(`DELETE FROM sessions WHERE user_id = ? AND EXISTS (${current})`).bind(id, id, revision),
      db.prepare(`DELETE FROM auth_tokens WHERE user_id = ? AND EXISTS (${current})`).bind(id, id, revision),
      ...(token ? [db.prepare(`INSERT INTO auth_tokens (token_hash, user_id, purpose, expires_at) SELECT ?, id, 'invite', ? FROM users WHERE id = ? AND auth_revision = ?`)
        .bind(tokenHash, now + INVITE_TTL, id, revision)] : []),
      db.prepare(`INSERT INTO audit_log (actor_id, action, target_user_id, at, detail) SELECT ?, ?, ?, ?, NULL WHERE EXISTS (${current})`)
        .bind(session.userId, action === 'reactivar' ? 'member.reactivate' : 'member.deactivate', id, now, id, revision),
    ]);
    if (!changed.meta.changes) return html(messageView('Cuenta modificada', 'La cuenta cambió. Vuelve a intentarlo.', session), 409);
    return token ? linkView(request, session, 'Invitación nueva', token, 'invite') : redirect('/admin/');
  }
  if (action === 'rol') {
    const { role = '' } = await form(request);
    if (!['member', 'admin'].includes(role)) return html(messageView('Rol no válido', 'El rol es miembro o admin.', session), 400);
    await db.batch([db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').bind(role, now, id), audit(db, session, 'member.role', id, now, role)]);
    return redirect('/admin/');
  }
  return html(messageView('No existe', 'Esa acción no existe.', session), 404);
}
