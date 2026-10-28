import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { hashPassword } from '../worker/auth/passwords.ts';
import { stripJsonc } from '../scripts/check-cutover.mjs';

const root = new URL('../', import.meta.url);
const base = 'https://fitmagra.test';
const password = 'test-member-password'; // gitleaks:allow
const adminPassword = 'test-admin-password'; // gitleaks:allow

test('Worker runtime supports invitation, unpaid member access, private files and erasure', async () => {
  const [{ text: script }] = (await build({ entryPoints: [fileURLToPath(new URL('../worker/index.ts', import.meta.url))], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', write: false })).outputFiles;
  const config = JSON.parse(stripJsonc(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8')));
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script, compatibilityDate: config.compatibility_date, d1Databases: ['DB'], r2Buckets: ['FILES'], bindings: { ENVIRONMENT: 'test' }, cf: false, telemetry: { enabled: false } }));
  const post = (path, fields, cookie = '') => mf.dispatchFetch(base + path, { method: 'POST', redirect: 'manual', headers: { origin: base, 'content-type': 'application/x-www-form-urlencoded', ...(cookie ? { cookie } : {}) }, body: new URLSearchParams(fields).toString() });
  try {
    const db = await mf.getD1Database('DB');
    for (const name of readdirSync(new URL('migrations/', root)).filter(f => f.endsWith('.sql')).sort()) {
      const sql = readFileSync(new URL(`migrations/${name}`, root), 'utf8').replace(/^--.*$/gm, '');
      // shortcut: this split cannot handle semicolons in literals or triggers; use a SQL parser if migrations add them.
      for (const statement of sql.split(';').map(s => s.trim()).filter(Boolean)) await db.prepare(statement).run();
    }
    const now = Math.floor(Date.now() / 1000);
    await db.prepare("INSERT INTO users(id,email,name,role,status,password_hash,created_at,updated_at) VALUES('admin','admin@example.test','Admin','admin','active',?,?,?)").bind(await hashPassword(adminPassword), now, now).run();
    let res = await post('/entrar/', { email: 'admin@example.test', password: adminPassword });
    assert.equal(res.status, 303, 'admin login');
    const adminCookie = res.headers.get('set-cookie').split(';')[0];
    res = await post('/admin/miembros/', { name: 'Ana', email: 'ana@example.test', role: 'member', plan: 'elite' }, adminCookie);
    assert.equal(res.status, 200, 'member invitation');
    const invite = (await res.text()).match(/href="(https:\/\/fitmagra\.test\/entrar\/clave\/\?t=[^"]+)"/);
    assert.ok(invite, 'invitation link');
    const url = new URL(invite[1].replaceAll('&amp;', '&'));
    res = await post('/entrar/clave/', { t: url.searchParams.get('t'), p: 'invite', password, confirm: password });
    assert.equal(res.status, 303, 'set invitation password');
    let memberCookie = res.headers.get('set-cookie').split(';')[0];
    res = await mf.dispatchFetch(base + '/app/', { redirect: 'manual', headers: { cookie: memberCookie } });
    assert.equal(res.headers.get('location'), '/app/consentimiento/');
    assert.equal((await post('/app/consentimiento/', { accept: 'yes' }, memberCookie)).status, 303);
    res = await mf.dispatchFetch(base + '/app/cuenta/', { headers: { cookie: memberCookie } });
    assert.equal(res.status, 200);
    assert.match(await res.text(), /Pagos: Próximamente/);
    assert.equal((await post('/salir/', {}, memberCookie)).status, 303);
    res = await post('/entrar/', { email: 'ana@example.test', password });
    assert.equal(res.status, 303, 'member login');
    memberCookie = res.headers.get('set-cookie').split(';')[0];
    assert.equal((await post('/app/peso/', { date: '2026-10-20', kg: '70' }, memberCookie)).status, 303);

    const photo = new FormData();
    photo.set('date', '2026-10-20'); photo.set('pose', 'front');
    photo.set('file', new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1])], 'test.jpg', { type: 'image/jpeg' }));
    const encoded = new Request(base + '/app/fotos/', { method: 'POST', body: photo });
    res = await mf.dispatchFetch(base + '/app/fotos/', { method: 'POST', redirect: 'manual', headers: { cookie: memberCookie, origin: base, 'content-type': encoded.headers.get('content-type') }, body: await encoded.arrayBuffer() });
    assert.equal(res.status, 303, 'private photo upload');
    const member = await db.prepare("SELECT id FROM users WHERE email = 'ana@example.test'").first();
    const stored = await db.prepare('SELECT id,r2_key FROM photos WHERE user_id = ?').bind(member.id).first();
    const bucket = await mf.getR2Bucket('FILES');
    assert.ok(await bucket.get(stored.r2_key));
    res = await mf.dispatchFetch(`${base}/app/archivos/${stored.id}`, { headers: { cookie: memberCookie } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/jpeg');
    assert.equal((await mf.dispatchFetch(`${base}/app/archivos/${stored.id}`, { redirect: 'manual' })).headers.get('location'), '/entrar/');
    res = await post(`/admin/miembros/${member.id}/borrar-datos/`, { confirm: 'ana@example.test', operation: randomUUID(), revision: '' }, adminCookie);
    assert.equal(res.status, 303, 'erase member data');
    assert.equal(await bucket.get(stored.r2_key), null);
    assert.equal((await db.prepare('SELECT count(*) AS n FROM weights WHERE user_id = ?').bind(member.id).first()).n, 0);
  } finally {
    await mf.dispose();
  }
});
