// The one Worker. wrangler.jsonc sends /entrar, /salir, /app, /admin and /api here first; every other
// path is a static file from dist/. There is no signup route: accounts exist only when an admin creates them.
import type { DB } from './db.ts';
import { nowSeconds } from './db.ts';
import { html, redirect, cookie, sameOrigin, withSecurity } from './http.ts';
import { readSession, type Session } from './auth/sessions.ts';
import * as auth from './auth/routes.ts';
import * as admin from './admin/routes.ts';
import * as app from './app/routes.ts';
import type { Bucket } from './files.ts';
import * as billing from './billing/routes.ts';
import { messageView } from './views.ts';

export interface Env {
  DB: DB;
  ASSETS: { fetch(request: Request): Promise<Response> };
  FILES: Bucket;
  ENVIRONMENT: string;
  BILLING_PROVIDER?: string;
}

// Members need a valid session and consent; billing is deferred.
type Guard = 'public' | 'signed' | 'account' | 'member' | 'admin';
interface Ctx { request: Request; env: Env; now: number; session: Session | null; params: string[] }
type Route = [method: string, path: RegExp, guard: Guard, handler: (c: Ctx) => Promise<Response> | Response];

const ROUTES: Route[] = [
  ['GET', /^\/entrar\/$/, 'public', () => auth.loginPage()],
  ['POST', /^\/entrar\/$/, 'public', (c) => auth.login(c.request, c.env.DB, c.now)],
  ['GET', /^\/entrar\/clave\/$/, 'public', (c) => auth.setPasswordPage(c.request)],
  ['POST', /^\/entrar\/clave\/$/, 'public', (c) => auth.setPassword(c.request, c.env.DB, c.now)],
  ['POST', /^\/salir\/$/, 'public', (c) => auth.logout(c.request, c.env.DB)],
  ['GET', /^\/app\/$/, 'member', (c) => app.home(c.env.DB, c.session!)],
  ['GET', /^\/app\/consentimiento\/$/, 'signed', (c) => app.consent(c.request, c.env.DB, c.session!, c.now)],
  ['POST', /^\/app\/consentimiento\/$/, 'signed', (c) => app.consent(c.request, c.env.DB, c.session!, c.now)],
  ['GET', /^\/app\/(peso|entrenos)\/$/, 'member', (c) => app.logList(c.env.DB, LOG_KEYS[c.params[0]], c.session!, c.now)],
  ['GET', /^\/app\/nutricion\/$/, 'member', (c) => app.nutrition(c.request, c.env.DB, c.session!, c.now)],
  ['POST', /^\/app\/(peso|entrenos|nutricion)\/$/, 'member', (c) => app.logAdd(c.request, c.env.DB, LOG_KEYS[c.params[0]], c.session!, c.now)],
  ['POST', /^\/app\/(peso|entrenos|nutricion)\/([\w-]+)\/borrar\/$/, 'member', (c) => app.logDelete(c.env.DB, LOG_KEYS[c.params[0]], c.session!, c.params[1])],
  ['GET', /^\/app\/fotos\/$/, 'member', (c) => app.photos(c.env.DB, c.session!, c.now)],
  ['POST', /^\/app\/fotos\/$/, 'member', (c) => app.photoAdd(c.request, c.env.DB, c.env.FILES, c.session!, c.now)],
  ['POST', /^\/app\/fotos\/([\w-]+)\/borrar\/$/, 'member', (c) => app.photoDelete(c.env.DB, c.env.FILES, c.session!, c.params[0])],
  ['GET', /^\/app\/archivos\/([\w-]+)$/, 'account', (c) => app.file(c.env.DB, c.env.FILES, c.session!, c.params[0])],
  ['GET', /^\/app\/plan\/$/, 'member', (c) => app.plan(c.env.DB, c.session!)],
  ['GET', /^\/app\/coach-ia\/$/, 'member', (c) => app.coach(c.session!)],
  ['GET', /^\/app\/cuenta\/$/, 'account', (c) => app.account(c.env.DB, c.session!, c.now)],
  ['POST', /^\/app\/cuenta\/clave\/$/, 'account', (c) => app.changePassword(c.request, c.env.DB, c.session!, c.now)],
  ['GET', /^\/admin\/$/, 'admin', (c) => admin.list(c.env.DB, c.session!)],
  ['POST', /^\/admin\/miembros\/$/, 'admin', (c) => admin.create(c.request, c.env.DB, c.session!, c.now)],
  ['GET', /^\/admin\/miembros\/([\w-]+)\/$/, 'admin', (c) => admin.detail(c.env.DB, c.session!, c.params[0], c.now)],
  ['POST', /^\/admin\/miembros\/([\w-]+)\/documentos\/$/, 'admin', (c) => admin.uploadDocument(c.request, c.env.DB, c.env.FILES, c.session!, c.now, c.params[0])],
  ['POST', /^\/admin\/miembros\/([\w-]+)\/metas\/$/, 'admin', (c) => admin.setTargets(c.request, c.env.DB, c.session!, c.now, c.params[0])],
  ['POST', /^\/admin\/miembros\/([\w-]+)\/borrar-datos\/$/, 'admin', (c) => admin.deleteData(c.request, c.env.DB, c.env.FILES, c.session!, c.now, c.params[0])],
  ['POST', /^\/admin\/miembros\/([\w-]+)\/(reset|desactivar|reactivar|rol)\/$/, 'admin', (c) => admin.memberAction(c.request, c.env.DB, c.session!, c.now, c.params[0], c.params[1])],
];

const notFound = (): Response => html(messageView('No encontrado', 'Esta página no existe.'), 404);

const LOG_KEYS: Record<string, 'weights' | 'workouts' | 'nutrition'> = { peso: 'weights', entrenos: 'workouts', nutricion: 'nutrition' };

const WORKER_PATHS = /^\/(entrar|salir|app|admin|api)(\/|$)/;

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (!WORKER_PATHS.test(url.pathname)) return env.ASSETS.fetch(request);
  const match = ROUTES.find(([method, path]) => method === request.method && path.test(url.pathname));
  if (!match) return notFound();
  const [, path, guard, handler] = match;
  if (request.method === 'POST' && !sameOrigin(request)) return html(messageView('Solicitud rechazada', 'Vuelve a intentarlo desde el sitio.'), 403);
  const now = nowSeconds();
  const token = cookie(request);
  const session = guard === 'public' || !token ? null : await readSession(env.DB, { token, now });
  if (guard !== 'public' && !session) return redirect('/entrar/');
  const isAdmin = session?.role === 'admin';
  if ((guard === 'account' || guard === 'member') && !session!.consented && !isAdmin) return redirect('/app/consentimiento/');
  if ((guard === 'account' || guard === 'member') && session!.erasing && !isAdmin) return html(messageView('Borrado en curso', 'Tu información está en proceso de borrado. Contacta a Mauricio si necesitas ayuda.', session), 409);
  if (guard === 'admin' && !isAdmin) return html(messageView('Sin acceso', 'Esta sección es solo para administradores.', session), 403);
  const ctx = { request, env, now, session, params: path.exec(url.pathname)!.slice(1) };
  return handler(ctx);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const res = await route(request, env);
    return WORKER_PATHS.test(new URL(request.url).pathname) ? withSecurity(res) : res;
  },
};
