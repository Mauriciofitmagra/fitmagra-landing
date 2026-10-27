import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from './d1-sqlite.mjs';
import worker from '../worker/index.ts';
import { hashPassword } from '../worker/auth/passwords.ts';

const ORIGIN = 'https://fitmagra.test';
const setup = async () => {
  // Like Workers static assets with not_found_handling 404-page: only built files exist.
  const files = new Set(['/', '/historias/']);
  const ASSETS = { fetch: async (r) => { const p = new URL(r.url).pathname; return files.has(p) ? new Response(`asset ${p}`) : new Response('not found', { status: 404 }); } };
  const env = { DB: d1(), ASSETS, ENVIRONMENT: 'test' };
  const hash = await hashPassword('clave-segura-1');
  for (const [id, role] of [['admin1', 'admin'], ['mem1', 'member']]) {
    await env.DB.prepare("INSERT INTO users (id, email, name, role, status, password_hash, consent_version, consent_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, 'test', 1, 0, 0)")
      .bind(id, `${id}@x.co`, id, role, hash).run();
    if (role === 'member') await env.DB.prepare("INSERT INTO subscriptions (user_id, plan, status, current_period_end, updated_at) VALUES (?, 'elite', 'active', '2099-01-01', 0)").bind(id).run();
  }
  return env;
};
const req = (path, { method = 'GET', form, cookie, origin = ORIGIN, ip = '1.1.1.1' } = {}) => new Request(`${ORIGIN}${path}`, {
  method,
  headers: { ...(cookie ? { cookie } : {}), ...(method === 'POST' && origin ? { origin } : {}), 'cf-connecting-ip': ip, ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
  body: form ? new URLSearchParams(form).toString() : undefined,
  redirect: 'manual',
});
const login = async (env, email, password = 'clave-segura-1', ip) => worker.fetch(req('/entrar/', { method: 'POST', form: { email, password }, ip }), env);
const cookieOf = (res) => res.headers.get('set-cookie')?.split(';')[0];

test('public paths fall through to static assets', async () => {
  const env = await setup();
  assert.equal(await (await worker.fetch(req('/historias/'), env)).text(), 'asset /historias/');
});

test('there is no signup route', async () => {
  const env = await setup();
  for (const [path, method] of [['/registro/', 'GET'], ['/api/signup', 'POST'], ['/entrar/registro/', 'GET']]) {
    const res = await worker.fetch(req(path, { method, form: method === 'POST' ? { email: 'n@x.co' } : undefined }), env);
    assert.equal(res.status, 404, path);
  }
});

test('login sets a __Host- cookie that is Secure, HttpOnly and SameSite=Lax', async () => {
  const env = await setup();
  const res = await login(env, 'MEM1@x.co');
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), '/app/');
  const c = res.headers.get('set-cookie');
  assert.match(c, /^__Host-fm_session=[\w-]+; Path=\/; Max-Age=2592000; Secure; HttpOnly; SameSite=Lax$/);
  const app = await worker.fetch(req('/app/', { cookie: cookieOf(res) }), env);
  assert.equal(app.status, 200);
  assert.ok((await app.text()).includes('mem1'));
});

test('a wrong password gets one generic message, and five failures lock the email for 15 minutes', async () => {
  const env = await setup();
  for (let i = 0; i < 5; i++) {
    const res = await login(env, 'mem1@x.co', 'mala');
    assert.equal(res.status, 401);
    assert.ok((await res.text()).includes('Correo o contraseña incorrectos'));
  }
  const locked = await login(env, 'mem1@x.co');
  assert.equal(locked.status, 429);
  assert.ok((await locked.text()).includes('Correo o contraseña incorrectos'));
});

test('twenty failures from one IP block that IP', async () => {
  const env = await setup();
  for (let i = 0; i < 20; i++) await login(env, `nadie${i}@x.co`, 'x', '9.9.9.9');
  assert.equal((await login(env, 'mem1@x.co', 'clave-segura-1', '9.9.9.9')).status, 429);
  assert.equal((await login(env, 'mem1@x.co', 'clave-segura-1', '8.8.8.8')).status, 303);
});

test('a POST without a matching Origin is refused', async () => {
  const env = await setup();
  const res = await worker.fetch(req('/entrar/', { method: 'POST', form: { email: 'mem1@x.co', password: 'clave-segura-1' }, origin: 'https://evil.test' }), env);
  assert.equal(res.status, 403);
  const none = await worker.fetch(req('/entrar/', { method: 'POST', form: { email: 'mem1@x.co', password: 'clave-segura-1' }, origin: null }), env);
  assert.equal(none.status, 403);
});

test('members are sent to login without a session and get 403 on admin routes', async () => {
  const env = await setup();
  const anon = await worker.fetch(req('/app/'), env);
  assert.equal(anon.status, 303);
  assert.equal(anon.headers.get('location'), '/entrar/');
  const cookie = cookieOf(await login(env, 'mem1@x.co'));
  assert.equal((await worker.fetch(req('/admin/', { cookie }), env)).status, 403);
  assert.equal((await worker.fetch(req('/admin/miembros/', { method: 'POST', cookie, form: { name: 'X', email: 'x@x.co' } }), env)).status, 403);
});

test('an admin provisions a member, the invite link sets a password once, and the member logs in', async () => {
  const env = await setup();
  const admin = cookieOf(await login(env, 'admin1@x.co'));
  const created = await worker.fetch(req('/admin/miembros/', { method: 'POST', cookie: admin, form: { name: 'Laura G.', email: 'laura@x.co', role: 'member', plan: 'elite' } }), env);
  assert.equal(created.status, 200);
  const link = (await created.text()).match(/\/entrar\/clave\/\?t=([\w-]+)&amp;p=invite/);
  assert.ok(link, 'invite link shown once');
  assert.equal((await login(env, 'laura@x.co', 'cualquier-cosa')).status, 401, 'invited user cannot log in yet');
  const set = await worker.fetch(req('/entrar/clave/', { method: 'POST', form: { t: link[1], p: 'invite', password: 'nueva-clave-22', confirm: 'nueva-clave-22' } }), env);
  assert.equal(set.status, 303);
  assert.equal((await login(env, 'laura@x.co', 'nueva-clave-22')).status, 303);
  const again = await worker.fetch(req('/entrar/clave/', { method: 'POST', form: { t: link[1], p: 'invite', password: 'otra-clave-333', confirm: 'otra-clave-333' } }), env);
  assert.equal(again.status, 400, 'link works once');
  const audit = await env.DB.prepare("SELECT action FROM audit_log WHERE actor_id = 'admin1'").all();
  assert.deepEqual(audit.results.map((r) => r.action), ['member.create']);
});

test('a short password is refused when setting it', async () => {
  const env = await setup();
  const admin = cookieOf(await login(env, 'admin1@x.co'));
  const body = await (await worker.fetch(req('/admin/miembros/mem1/reset/', { method: 'POST', cookie: admin }), env)).text();
  const t = body.match(/t=([\w-]+)&amp;p=reset/)[1];
  const res = await worker.fetch(req('/entrar/clave/', { method: 'POST', form: { t, p: 'reset', password: 'corta', confirm: 'corta' } }), env);
  assert.equal(res.status, 400);
});

test('a reset link ends the member sessions and sets a new password', async () => {
  const env = await setup();
  const member = cookieOf(await login(env, 'mem1@x.co'));
  const admin = cookieOf(await login(env, 'admin1@x.co'));
  const body = await (await worker.fetch(req('/admin/miembros/mem1/reset/', { method: 'POST', cookie: admin }), env)).text();
  assert.equal((await worker.fetch(req('/app/', { cookie: member }), env)).status, 303, 'old session ended');
  const t = body.match(/t=([\w-]+)&amp;p=reset/)[1];
  await worker.fetch(req('/entrar/clave/', { method: 'POST', form: { t, p: 'reset', password: 'clave-nueva-44', confirm: 'clave-nueva-44' } }), env);
  assert.equal((await login(env, 'mem1@x.co', 'clave-nueva-44')).status, 303);
});

test('deactivation ends sessions and refuses login; reactivation issues a new invite', async () => {
  const env = await setup();
  const member = cookieOf(await login(env, 'mem1@x.co'));
  const admin = cookieOf(await login(env, 'admin1@x.co'));
  await worker.fetch(req('/admin/miembros/mem1/desactivar/', { method: 'POST', cookie: admin }), env);
  assert.equal((await worker.fetch(req('/app/', { cookie: member }), env)).status, 303);
  assert.equal((await env.DB.prepare("SELECT count(*) n FROM sessions WHERE user_id = 'mem1'").first()).n, 0);
  assert.equal((await login(env, 'mem1@x.co')).status, 401);
  const re = await worker.fetch(req('/admin/miembros/mem1/reactivar/', { method: 'POST', cookie: admin }), env);
  assert.match(await re.text(), /p=invite/);
});

test('a member name is escaped on every page that shows it', async () => {
  const env = await setup();
  await env.DB.prepare("UPDATE users SET name = '<script>x</script>' WHERE id = 'mem1'").run();
  const cookie = cookieOf(await login(env, 'mem1@x.co'));
  const body = await (await worker.fetch(req('/app/', { cookie }), env)).text();
  assert.ok(!body.includes('<script>x</script>'));
  assert.ok(body.includes('&lt;script&gt;'));
  const admin = cookieOf(await login(env, 'admin1@x.co'));
  assert.ok(!(await (await worker.fetch(req('/admin/', { cookie: admin }), env)).text()).includes('<script>x</script>'));
});

test('logout deletes the session', async () => {
  const env = await setup();
  const cookie = cookieOf(await login(env, 'mem1@x.co'));
  const out = await worker.fetch(req('/salir/', { method: 'POST', cookie }), env);
  assert.equal(out.status, 303);
  assert.match(out.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await worker.fetch(req('/app/', { cookie }), env)).status, 303);
});

test('every Worker response carries the security headers', async () => {
  const env = await setup();
  for (const res of [await worker.fetch(req('/entrar/'), env), await login(env, 'mem1@x.co', 'mala'), await worker.fetch(req('/app/'), env)]) {
    assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
    assert.match(res.headers.get('strict-transport-security'), /max-age=\d+/);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    assert.match(res.headers.get('cache-control'), /no-store/);
  }
});
