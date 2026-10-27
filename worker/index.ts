// The one Worker. wrangler.jsonc sends /entrar, /salir, /app, /admin and /api here first; every other
// path is a static file from dist/. There is no signup route: accounts exist only when an admin creates them.
import type { DB } from './db.ts';
import { nowSeconds } from './db.ts';
import { html, redirect, cookie, sameOrigin, withSecurity, esc } from './http.ts';
import { readSession, type Session } from './auth/sessions.ts';
import * as auth from './auth/routes.ts';
import * as admin from './admin/routes.ts';
import { page, messageView } from './views.ts';

export interface Env {
  DB: DB;
  ASSETS: { fetch(request: Request): Promise<Response> };
  ENVIRONMENT: string;
}

type Guard = 'public' | 'member' | 'admin';
interface Ctx { request: Request; env: Env; now: number; session: Session | null; params: string[] }
type Route = [method: string, path: RegExp, guard: Guard, handler: (c: Ctx) => Promise<Response> | Response];

const ROUTES: Route[] = [
  ['GET', /^\/entrar\/$/, 'public', () => auth.loginPage()],
  ['POST', /^\/entrar\/$/, 'public', (c) => auth.login(c.request, c.env.DB, c.now)],
  ['GET', /^\/entrar\/clave\/$/, 'public', (c) => auth.setPasswordPage(c.request)],
  ['POST', /^\/entrar\/clave\/$/, 'public', (c) => auth.setPassword(c.request, c.env.DB, c.now)],
  ['POST', /^\/salir\/$/, 'public', (c) => auth.logout(c.request, c.env.DB)],
  ['GET', /^\/app\/$/, 'member', (c) => html(page('Inicio', `<h1 class="app-title">Hola, ${esc(c.session!.name)}</h1><p>Tu área de miembro se está construyendo.</p>`, c.session))],
  ['GET', /^\/admin\/$/, 'admin', (c) => admin.list(c.env.DB, c.session!)],
  ['POST', /^\/admin\/miembros\/$/, 'admin', (c) => admin.create(c.request, c.env.DB, c.session!, c.now)],
  ['POST', /^\/admin\/miembros\/([\w-]+)\/(reset|desactivar|reactivar|rol)\/$/, 'admin', (c) => admin.memberAction(c.request, c.env.DB, c.session!, c.now, c.params[0], c.params[1])],
];

const WORKER_PATHS = /^\/(entrar|salir|app|admin|api)(\/|$)/;

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (!WORKER_PATHS.test(url.pathname)) return env.ASSETS.fetch(request);
  const match = ROUTES.find(([method, path]) => method === request.method && path.test(url.pathname));
  if (!match) return html(messageView('No encontrado', 'Esta página no existe.'), 404);
  const [, path, guard, handler] = match;
  if (request.method === 'POST' && !sameOrigin(request)) return html(messageView('Solicitud rechazada', 'Vuelve a intentarlo desde el sitio.'), 403);
  const now = nowSeconds();
  const token = cookie(request);
  const session = guard === 'public' || !token ? null : await readSession(env.DB, { token, now });
  if (guard !== 'public' && !session) return redirect('/entrar/');
  if (guard === 'admin' && session!.role !== 'admin') return html(messageView('Sin acceso', 'Esta sección es solo para administradores.', session), 403);
  return handler({ request, env, now, session, params: path.exec(url.pathname)!.slice(1) });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const res = await route(request, env);
    return WORKER_PATHS.test(new URL(request.url).pathname) ? withSecurity(res) : res;
  },
};
