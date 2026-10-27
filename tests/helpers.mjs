import { d1 } from './d1-sqlite.mjs';
import worker from '../worker/index.ts';
import { hashPassword } from '../worker/auth/passwords.ts';

export const ORIGIN = 'https://fitmagra.test';
// Made-up passwords for test users in an in-memory database. Not credentials.
export const PASSWORD = 'clave-segura-1'; // gitleaks:allow
export const NEW_PASSWORD = 'otra-clave-123'; // gitleaks:allow

// An in-memory R2 bucket with the calls the Worker uses.
export function memoryBucket() {
  const objects = new Map();
  return {
    objects,
    put: async (key, value, opts = {}) => { objects.set(key, { bytes: new Uint8Array(await new Response(value).arrayBuffer()), httpMetadata: opts.httpMetadata ?? {} }); },
    get: async (key) => {
      const o = objects.get(key);
      return o ? { body: new Response(o.bytes).body, httpMetadata: o.httpMetadata, size: o.bytes.length } : null;
    },
    delete: async (keys) => { for (const k of [].concat(keys)) objects.delete(k); },
  };
}

export async function setup({ consented = true } = {}) {
  const files = new Set(['/']);
  const ASSETS = { fetch: async (r) => (files.has(new URL(r.url).pathname) ? new Response('asset') : new Response('not found', { status: 404 })) };
  const env = { DB: d1(), ASSETS, FILES: memoryBucket(), ENVIRONMENT: 'test' };
  const hash = await hashPassword(PASSWORD);
  for (const [id, role] of [['admin1', 'admin'], ['ana', 'member'], ['beto', 'member']]) {
    await env.DB.prepare("INSERT INTO users (id, email, name, role, status, password_hash, consent_version, consent_at, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, 0, 0)")
      .bind(id, `${id}@x.co`, id, role, hash, consented ? 'test' : null, consented ? 1 : null).run();
  }
  return env;
}

export const req = (path, { method = 'GET', form, body, cookie, headers = {} } = {}) => new Request(`${ORIGIN}${path}`, {
  method,
  headers: { ...(cookie ? { cookie } : {}), ...(method === 'POST' ? { origin: ORIGIN } : {}), 'cf-connecting-ip': '1.1.1.1', ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}), ...headers },
  body: form ? new URLSearchParams(form).toString() : body,
  redirect: 'manual',
});

export const send = (env, path, opts) => worker.fetch(req(path, opts), env);

export async function login(env, id) {
  const res = await send(env, '/entrar/', { method: 'POST', form: { email: `${id}@x.co`, password: PASSWORD } });
  return res.headers.get('set-cookie').split(';')[0];
}

export function upload(env, path, cookie, { field = 'file', bytes, type, name = 'f', fields = {} }) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  fd.set(field, new File([bytes], name, { type }));
  return worker.fetch(new Request(`${ORIGIN}${path}`, { method: 'POST', headers: { cookie, origin: ORIGIN }, body: fd, redirect: 'manual' }), env);
}

export const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
export const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export const PDF = new TextEncoder().encode('%PDF-1.7\n%fake plan\n');
