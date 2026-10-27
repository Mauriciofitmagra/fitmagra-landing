import type { DB } from '../db.ts';
import type { Session } from '../auth/sessions.ts';
import { endSessions } from '../auth/sessions.ts';
import { issueToken, type TokenPurpose } from '../auth/tokens.ts';
import { html, redirect, form, esc } from '../http.ts';
import { page, messageView } from '../views.ts';

const audit = (db: DB, actor: Session, action: string, target: string | null, now: number, detail: string | null = null) =>
  db.prepare('INSERT INTO audit_log (actor_id, action, target_user_id, at, detail) VALUES (?, ?, ?, ?, ?)').bind(actor.userId, action, target, now, detail);

interface Member { id: string; name: string; email: string; role: string; status: string }

export async function list(db: DB, session: Session): Promise<Response> {
  const { results } = await db.prepare('SELECT id, name, email, role, status FROM users ORDER BY name').all<Member>();
  const rows = results.map((m) => `<tr><td>${esc(m.name)}</td><td>${esc(m.email)}</td><td>${esc(m.role)}</td><td>${esc(m.status)}</td>
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
