import { esc } from '../http.ts';
import { page } from '../views.ts';
import type { Session } from '../auth/sessions.ts';
import { type LogKind, type Field, display } from './logs.ts';

import { CONSENT_VERSION } from './consent.ts';

const TABS: [string, string][] = [
  ['/app/', 'Inicio'], ['/app/peso/', 'Peso'], ['/app/entrenos/', 'Entrenos'], ['/app/fotos/', 'Fotos'],
  ['/app/plan/', 'Plan'], ['/app/nutricion/', 'Nutrición'], ['/app/coach-ia/', 'Coach IA'], ['/app/cuenta/', 'Cuenta'],
];

export const appPage = (title: string, current: string, body: string, session: Session): string => page(title, `<nav class="app-tabs" aria-label="Área de miembro">
${TABS.map(([href, label]) => `<a href="${href}"${href === current ? ' aria-current="page"' : ''}>${label}</a>`).join('\n')}
</nav>
${body}`, session);

const notice = (error: string): string => (error ? `<p class="notice" role="alert">${esc(error)}</p>` : '');

const input = (f: Field, today: string, values: Record<string, string>): string => {
  if (f.type === 'select') return `<label class="field"><span>${esc(f.label)}</span><select name="${f.name}">${f.options!.map(([v, l]) => `<option value="${v}"${values[f.name] === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  const type = f.type === 'date' ? 'date' : f.type === 'text' ? 'text' : 'text" inputmode="decimal';
  const value = values[f.name] ?? (f.type === 'date' ? today : '');
  return `<label class="field"><span>${esc(f.label)}</span><input name="${f.name}" type="${type}" value="${esc(value)}"${f.required ? ' required' : ''}></label>`;
};

export function entryForm(kind: LogKind, today: string, error = '', values: Record<string, string> = {}): string {
  return `${notice(error)}<form method="post" action="${kind.path}" class="app-form app-form-wide">
${kind.fields.map((f) => input(f, today, values)).join('\n')}
<button class="button">Guardar</button>
</form>`;
}

export function entryTable(kind: LogKind, rows: Record<string, unknown>[], { readOnly = false } = {}): string {
  if (!rows.length) return '<p>Todavía no hay registros.</p>';
  return `<div class="table-scroll" role="region" aria-label="${esc(kind.title)}" tabindex="0"><table class="table"><thead><tr>${kind.fields.map((f) => `<th>${esc(f.label)}</th>`).join('')}${readOnly ? '' : '<th></th>'}</tr></thead><tbody>
${rows.map((r) => `<tr>${kind.fields.map((f) => `<td>${esc(display(f, r[f.col]))}</td>`).join('')}${readOnly ? '' : `<td><form method="post" action="${kind.path}${esc(r.id)}/borrar/"><button class="link">Borrar</button></form></td>`}</tr>`).join('\n')}
</tbody></table></div>`;
}

export const consentView = (session: Session, error = ''): string => page('Tus datos', `<h1 class="app-title">Antes de empezar</h1>
${notice(error)}
<p>En tu área de miembro guardas tu peso, tus entrenos, tu alimentación y fotos de tu progreso. Son datos de salud y la ley colombiana los trata como datos sensibles.</p>
<p>Solo tú y el equipo de FitMagra los pueden ver. Las fotos se guardan en un almacenamiento privado, sin enlaces públicos. Puedes pedir que borremos todo cuando quieras escribiéndole a Mauricio.</p>
<p class="small">Versión de la política: ${CONSENT_VERSION}. El texto final lo revisa un abogado antes del lanzamiento.</p>
<form method="post" action="/app/consentimiento/" class="app-form">
<label class="check"><input type="checkbox" name="accept" value="yes" required> Autorizo a FitMagra a tratar mis datos de salud y mis fotos para mi plan.</label>
<button class="button">Aceptar y continuar</button>
</form>`, session);

export function coachView(session: Session): string {
  const demo: [string, string][] = [
    ['Miembro', '¿Puedo cambiar el arroz del almuerzo por papa?'],
    ['MagraMind', 'Sí. 150 g de arroz cocido equivalen más o menos a 200 g de papa cocida en carbohidratos. Mantén la proteína igual.'],
    ['Miembro', 'Hoy no alcancé a entrenar, ¿lo repongo mañana?'],
    ['MagraMind', 'No dupliques la sesión. Sigue el plan de mañana y cuéntale a Mauricio en tu revisión semanal.'],
  ];
  return appPage('Coach IA', '/app/coach-ia/', `<h1 class="app-title">Coach IA</h1>
<p class="notice">Próximamente. MagraMind todavía está aprendiendo el método de Mauricio y no responde consultas.</p>
<section class="chat-demo" aria-label="Demostración">
<h2 class="app-subtitle">Demostración</h2>
<p class="small">Estos mensajes son un ejemplo escrito a mano. No son asesoría.</p>
${demo.map(([who, text]) => `<p class="chat-line${who === 'Miembro' ? ' chat-me' : ''}"><strong>${who}.</strong> ${esc(text)}</p>`).join('\n')}
<label class="field"><span>Tu pregunta</span><input type="text" disabled placeholder="Disponible pronto"></label>
</section>`, session);
}
