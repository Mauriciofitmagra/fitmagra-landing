import type { DB } from '../db.ts';
import type { Session } from '../auth/sessions.ts';
import { endSessions } from '../auth/sessions.ts';
import { issueToken, type TokenPurpose } from '../auth/tokens.ts';
import { html, redirect, form, esc } from '../http.ts';
import { page, messageView } from '../views.ts';
import { checkFile, fileKey, PDF, type Bucket } from '../files.ts';
import { LOGS, type LogKind } from '../app/logs.ts';
import { entryTable } from '../app/views.ts';

const audit = (db: DB, actor: Session, action: string, target: string | null, now: number, detail: string | null = null) =>
  db.prepare('INSERT INTO audit_log (actor_id, action, target_user_id, at, detail) VALUES (?, ?, ?, ?, ?)').bind(actor.userId, action, target, now, detail);

interface Member { id: string; name: string; email: string; role: string; status: string }

export async function list(db: DB, session: Session): Promise<Response> {
  const { results } = await db.prepare('SELECT id, name, email, role, status FROM users ORDER BY name').all<Member>();
  const rows = results.map((m) => `<tr><td><a href="/admin/miembros/${esc(m.id)}/">${esc(m.name)}</a></td><td>${esc(m.email)}</td><td>${esc(m.role)}</td><td>${esc(m.status)}</td>
<td class="actions">
<form method="post" action="/admin/miembros/${esc(m.id)}/reset/"><button class="link">Enlace de contraseña</button></form>
${m.status === 'deactivated'
    ? `<form method="post" action="/admin/miembros/${esc(m.id)}/reactivar/"><button class="link">Reactivar</button></form>`
    : `<form method="post" action="/admin/miembros/${esc(m.id)}/desactivar/"><button class="link">Desactivar</button></form>`}
</td></tr>`).join('\n');
  return html(page('Miembros', `<h1 class="app-title">Miembros</h1>
<table class="table"><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th></th></tr></thead><tbody>
${rows}
</tbody></table>
<h2 class="app-subtitle">Crear miembro</h2>
<form method="post" action="/admin/miembros/" class="app-form">
<label class="field"><span>Nombre</span><input name="name" required></label>
<label class="field"><span>Correo</span><input name="email" type="email" required></label>
<label class="field"><span>Rol</span><select name="role"><option value="member">Miembro</option><option value="admin">Admin</option></select></label>
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
  const { name = '', email = '', role = 'member' } = await form(request);
  if (!name.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) || !['member', 'admin'].includes(role)) {
    return html(messageView('Datos incompletos', 'Revisa el nombre, el correo y el rol.', session), 400);
  }
  const id = crypto.randomUUID();
  try {
    await db.batch([
      db.prepare("INSERT INTO users (id, email, name, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'invited', ?, ?)").bind(id, email.trim(), name.trim(), role, now, now),
      audit(db, session, 'member.create', id, now, role),
    ]);
  } catch {
    return html(messageView('Correo en uso', 'Ya existe una cuenta con ese correo.', session), 409);
  }
  return linkView(request, session, 'Invitación creada', await issueToken(db, { userId: id, purpose: 'invite', now }), 'invite');
}

export async function detail(db: DB, session: Session, id: string): Promise<Response> {
  const m = await db.prepare('SELECT id, name, email, role, status FROM users WHERE id = ?').bind(id).first<Member>();
  if (!m) return html(messageView('No existe', 'Ese miembro no existe.', session), 404);
  const rows = async (kind: LogKind) => (await db.prepare(`SELECT * FROM ${kind.table} WHERE user_id = ? ORDER BY ${kind.dateCol} DESC LIMIT 50`).bind(id).all<Record<string, unknown>>()).results;
  const t = await db.prepare('SELECT kcal, protein_g, carbs_g, fat_g FROM nutrition_targets WHERE user_id = ?').bind(id).first<Record<string, number>>();
  const docs = (await db.prepare('SELECT id, kind, title FROM documents WHERE user_id = ? ORDER BY published_at DESC').bind(id).all<{ id: string; kind: string; title: string }>()).results;
  const photos = (await db.prepare('SELECT id, taken_on, pose FROM photos WHERE user_id = ? ORDER BY taken_on DESC').bind(id).all<{ id: string; taken_on: string; pose: string }>()).results;
  const num = (name: string, label: string, value: unknown) => `<label class="field"><span>${label}</span><input name="${name}" inputmode="numeric" value="${esc(value ?? '')}" required></label>`;
  return html(page(m.name, `<h1 class="app-title">${esc(m.name)}</h1>
<p>${esc(m.email)}, ${esc(m.role)}, ${esc(m.status)}</p>
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
<label class="field"><span>Correo del miembro</span><input name="confirm" required></label>
<button class="button">Borrar datos</button>
</form>`, session));
}

export async function uploadDocument(request: Request, db: DB, files: Bucket, session: Session, now: number, id: string): Promise<Response> {
  const exists = await db.prepare('SELECT id FROM users WHERE id = ?').bind(id).first();
  if (!exists) return html(messageView('No existe', 'Ese miembro no existe.', session), 404);
  const data = await request.formData();
  const kind = String(data.get('kind') ?? '');
  const title = String(data.get('title') ?? '').trim().slice(0, 120);
  if (!['training_plan', 'nutrition_plan'].includes(kind) || !title) return html(messageView('Datos incompletos', 'Elige el tipo y escribe un título.', session), 400);
  const checked = await checkFile(data.get('file'), PDF);
  if (!checked.ok) return html(messageView('Archivo rechazado', checked.error, session), checked.status);
  const key = fileKey(id, 'docs', 'pdf');
  await files.put(key, checked.bytes, { httpMetadata: { contentType: 'application/pdf' } });
  await db.batch([
    db.prepare('INSERT INTO documents (id, user_id, kind, title, r2_key, bytes, published_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), id, kind, title, key, checked.bytes.byteLength, now),
    audit(db, session, 'document.upload', id, now, kind),
  ]);
  return redirect(`/admin/miembros/${id}/`);
}

export async function setTargets(request: Request, db: DB, session: Session, now: number, id: string): Promise<Response> {
  const f = await form(request);
  const v = ['kcal', 'protein', 'carbs', 'fat'].map((k) => Number(f[k]));
  if (v.some((n) => !Number.isInteger(n))) return html(messageView('Metas no válidas', 'Escribe números enteros.', session), 400);
  try {
    await db.batch([
      db.prepare(`INSERT INTO nutrition_targets (user_id, kcal, protein_g, carbs_g, fat_g, updated_at) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET kcal = excluded.kcal, protein_g = excluded.protein_g, carbs_g = excluded.carbs_g, fat_g = excluded.fat_g, updated_at = excluded.updated_at`).bind(id, ...v, now),
      audit(db, session, 'nutrition.targets', id, now, v.join('/')),
    ]);
  } catch {
    return html(messageView('Metas fuera de rango', 'Revisa los valores: kcal entre 800 y 8000.', session), 400);
  }
  return redirect(`/admin/miembros/${id}/`);
}

// Account deletion on request (spec 12): every data row and file of the member, in one logged action.
export async function deleteData(request: Request, db: DB, files: Bucket, session: Session, now: number, id: string): Promise<Response> {
  const m = await db.prepare('SELECT email FROM users WHERE id = ?').bind(id).first<string>('email');
  if (!m) return html(messageView('No existe', 'Ese miembro no existe.', session), 404);
  const { confirm = '' } = await form(request);
  if (confirm.trim().toLowerCase() !== m.toLowerCase()) return html(messageView('Confirmación incorrecta', 'Escribe el correo exacto del miembro.', session), 400);
  const keys = [
    ...(await db.prepare('SELECT r2_key FROM photos WHERE user_id = ?').bind(id).all<{ r2_key: string }>()).results,
    ...(await db.prepare('SELECT r2_key FROM documents WHERE user_id = ?').bind(id).all<{ r2_key: string }>()).results,
  ].map((r) => r.r2_key);
  if (keys.length) await files.delete(keys);
  await db.batch([
    ...['weights', 'workouts', 'nutrition_logs', 'nutrition_targets', 'photos', 'documents'].map((t) => db.prepare(`DELETE FROM ${t} WHERE user_id = ?`).bind(id)),
    audit(db, session, 'member.delete_data', id, now, `${keys.length} files`),
  ]);
  return redirect(`/admin/miembros/${id}/`);
}

export async function memberAction(request: Request, db: DB, session: Session, now: number, id: string, action: string): Promise<Response> {
  const exists = await db.prepare('SELECT id FROM users WHERE id = ?').bind(id).first();
  if (!exists) return html(messageView('No existe', 'Ese miembro no existe.', session), 404);
  if (action === 'reset') {
    await endSessions(db, id);
    await audit(db, session, 'member.reset', id, now).run();
    return linkView(request, session, 'Enlace de contraseña', await issueToken(db, { userId: id, purpose: 'reset', now }), 'reset');
  }
  if (action === 'desactivar') {
    await db.batch([
      db.prepare("UPDATE users SET status = 'deactivated', updated_at = ? WHERE id = ?").bind(now, id),
      db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id),
      audit(db, session, 'member.deactivate', id, now),
    ]);
    return redirect('/admin/');
  }
  if (action === 'reactivar') {
    await db.batch([
      db.prepare("UPDATE users SET status = 'invited', password_hash = NULL, updated_at = ? WHERE id = ?").bind(now, id),
      audit(db, session, 'member.reactivate', id, now),
    ]);
    return linkView(request, session, 'Invitación nueva', await issueToken(db, { userId: id, purpose: 'invite', now }), 'invite');
  }
  if (action === 'rol') {
    const { role = '' } = await form(request);
    if (!['member', 'admin'].includes(role)) return html(messageView('Rol no válido', 'El rol es miembro o admin.', session), 400);
    await db.batch([db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').bind(role, now, id), audit(db, session, 'member.role', id, now, role)]);
    return redirect('/admin/');
  }
  return html(messageView('No existe', 'Esa acción no existe.', session), 404);
}
