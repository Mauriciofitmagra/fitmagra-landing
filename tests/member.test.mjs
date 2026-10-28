import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, send, login, upload, req, JPEG, PNG, PDF, PASSWORD, NEW_PASSWORD } from './helpers.mjs';

const ids = async (env, table, user) => (await env.DB.prepare(`SELECT id FROM ${table} WHERE user_id = ?`).bind(user).all()).results.map((r) => r.id);

test('a member must accept the data-treatment consent before any member screen', async () => {
  const env = await setup({ consented: false });
  const cookie = await login(env, 'ana');
  const res = await send(env, '/app/peso/', { cookie });
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), '/app/consentimiento/');
  assert.equal((await send(env, '/app/consentimiento/', { method: 'POST', cookie, form: {} })).status, 400, 'checkbox required');
  const ok = await send(env, '/app/consentimiento/', { method: 'POST', cookie, form: { accept: 'yes' } });
  assert.equal(ok.status, 303);
  const row = await env.DB.prepare("SELECT consent_version, consent_at FROM users WHERE id = 'ana'").first();
  assert.ok(row.consent_version && row.consent_at > 0);
  assert.equal((await send(env, '/app/peso/', { cookie })).status, 200);
});

test('weights: a member adds and lists their own entries; bad input is refused', async () => {
  const env = await setup();
  const cookie = await login(env, 'ana');
  const add = await send(env, '/app/peso/', { method: 'POST', cookie, form: { date: '2026-10-20', kg: '72,5', fat: '24.3', waist: '81' } });
  assert.equal(add.status, 303);
  const row = await env.DB.prepare("SELECT weight_g, body_fat_pct_x10, waist_mm FROM weights WHERE user_id = 'ana'").first();
  assert.deepEqual(row, { weight_g: 72500, body_fat_pct_x10: 243, waist_mm: 810 });
  assert.ok((await (await send(env, '/app/peso/', { cookie })).text()).includes('72,5'));
  assert.equal((await send(env, '/app/peso/', { method: 'POST', cookie, form: { date: '2026-10-20', kg: 'abc' } })).status, 400);
  assert.equal((await send(env, '/app/peso/', { method: 'POST', cookie, form: { date: 'ayer', kg: '70' } })).status, 400);
});

test('a member never sees or deletes another member rows: 404, and the row stays', async () => {
  const env = await setup();
  const ana = await login(env, 'ana');
  const beto = await login(env, 'beto');
  await send(env, '/app/peso/', { method: 'POST', cookie: ana, form: { date: '2026-10-20', kg: '72.5', note: 'nota-de-ana' } });
  await send(env, '/app/entrenos/', { method: 'POST', cookie: ana, form: { date: '2026-10-20', title: 'piernas-de-ana', minutes: '45', effort: '7' } });
  await send(env, '/app/nutricion/', { method: 'POST', cookie: ana, form: { date: '2026-10-20', meal: 'lunch', description: 'arroz-de-ana', kcal: '600' } });
  for (const [screen, marker] of [['/app/peso/', 'nota-de-ana'], ['/app/entrenos/', 'piernas-de-ana'], ['/app/nutricion/?fecha=2026-10-20', 'arroz-de-ana']]) {
    assert.ok(!(await (await send(env, screen, { cookie: beto })).text()).includes(marker), screen);
  }
  for (const [table, base] of [['weights', '/app/peso/'], ['workouts', '/app/entrenos/'], ['nutrition_logs', '/app/nutricion/']]) {
    const [id] = await ids(env, table, 'ana');
    assert.equal((await send(env, `${base}${id}/borrar/`, { method: 'POST', cookie: beto })).status, 404, table);
    assert.deepEqual(await ids(env, table, 'ana'), [id]);
    assert.equal((await send(env, `${base}${id}/borrar/`, { method: 'POST', cookie: ana })).status, 303);
    assert.deepEqual(await ids(env, table, 'ana'), []);
  }
});

test('photos: JPEG upload is stored privately under the member prefix and only owner or admin can read it', async () => {
  const env = await setup();
  const ana = await login(env, 'ana');
  const res = await upload(env, '/app/fotos/', ana, { bytes: JPEG, type: 'image/jpeg', fields: { date: '2026-10-21', pose: 'front' } });
  assert.equal(res.status, 303);
  const photo = await env.DB.prepare("SELECT id, r2_key FROM photos WHERE user_id = 'ana'").first();
  assert.match(photo.r2_key, /^u\/ana\/photos\/[0-9a-f-]{36}\.jpg$/);
  assert.ok(env.FILES.objects.has(photo.r2_key));
  const own = await send(env, `/app/archivos/${photo.id}`, { cookie: ana });
  assert.equal(own.status, 200);
  assert.equal(own.headers.get('content-type'), 'image/jpeg');
  assert.match(own.headers.get('cache-control'), /private, no-store/);
  assert.deepEqual(new Uint8Array(await own.arrayBuffer()), JPEG);
  assert.equal((await send(env, `/app/archivos/${photo.id}`, { cookie: await login(env, 'beto') })).status, 404);
  assert.equal((await send(env, `/app/archivos/${photo.id}`)).status, 303, 'anonymous goes to login');
  assert.equal((await send(env, `/app/archivos/${photo.id}`, { cookie: await login(env, 'admin1') })).status, 200);
});

test('photo uploads reject the wrong type, a disguised file and an oversize file', async () => {
  const env = await setup();
  const ana = await login(env, 'ana');
  const fields = { date: '2026-10-21', pose: 'front' };
  assert.equal((await upload(env, '/app/fotos/', ana, { bytes: PNG, type: 'image/png', fields })).status, 400);
  assert.equal((await upload(env, '/app/fotos/', ana, { bytes: PNG, type: 'image/jpeg', fields })).status, 400, 'magic bytes checked');
  const big = new Uint8Array(8 * 1024 * 1024 + 1); big.set(JPEG);
  assert.equal((await upload(env, '/app/fotos/', ana, { bytes: big, type: 'image/jpeg', fields })).status, 413);
  assert.equal(env.FILES.objects.size, 0);
});

test('plan PDFs: only an admin uploads; the member reads their own; others get 404', async () => {
  const env = await setup();
  const admin = await login(env, 'admin1');
  const ana = await login(env, 'ana');
  assert.equal((await upload(env, '/admin/miembros/ana/documentos/', ana, { bytes: PDF, type: 'application/pdf', fields: { kind: 'training_plan', title: 'x' } })).status, 403);
  assert.equal((await upload(env, '/admin/miembros/ana/documentos/', admin, { bytes: JPEG, type: 'application/pdf', fields: { kind: 'training_plan', title: 'x' } })).status, 400);
  assert.equal((await upload(env, '/admin/miembros/ana/documentos/', admin, { bytes: PDF, type: 'application/pdf', fields: { kind: 'training_plan', title: 'Plan octubre' } })).status, 303);
  const doc = await env.DB.prepare("SELECT id, r2_key FROM documents WHERE user_id = 'ana'").first();
  assert.match(doc.r2_key, /^u\/ana\/docs\/[0-9a-f-]{36}\.pdf$/);
  assert.ok((await (await send(env, '/app/plan/', { cookie: ana })).text()).includes('Plan octubre'));
  const dl = await send(env, `/app/archivos/${doc.id}`, { cookie: ana });
  assert.equal(dl.headers.get('content-type'), 'application/pdf');
  assert.equal((await send(env, `/app/archivos/${doc.id}`, { cookie: await login(env, 'beto') })).status, 404);
  const audit = await env.DB.prepare("SELECT action FROM audit_log WHERE action = 'document.upload'").all();
  assert.equal(audit.results.length, 1);
});

test('nutrition: targets set by the admin and the day total of the member log', async () => {
  const env = await setup();
  const admin = await login(env, 'admin1');
  const ana = await login(env, 'ana');
  assert.equal((await send(env, '/admin/miembros/ana/metas/', { method: 'POST', cookie: admin, form: { kcal: '2100', protein: '140', carbs: '220', fat: '70' } })).status, 303);
  await send(env, '/app/nutricion/', { method: 'POST', cookie: ana, form: { date: '2026-10-22', meal: 'breakfast', description: 'Avena', kcal: '400', protein: '20' } });
  await send(env, '/app/nutricion/', { method: 'POST', cookie: ana, form: { date: '2026-10-22', meal: 'lunch', description: 'Pollo', kcal: '700', protein: '50' } });
  const body = await (await send(env, '/app/nutricion/?fecha=2026-10-22', { cookie: ana })).text();
  assert.ok(body.includes('1100 de 2100 kcal'), 'kcal total against target');
  assert.ok(body.includes('70 de 140 g'), 'protein total against target');
  assert.equal((await send(env, '/admin/miembros/ana/metas/', { method: 'POST', cookie: admin, form: { kcal: '50', protein: '1', carbs: '1', fat: '1' } })).status, 400);
});

test('Coach IA is a labelled demonstration: no script, no form action, the input is disabled', async () => {
  const env = await setup();
  const body = await (await send(env, '/app/coach-ia/', { cookie: await login(env, 'ana') })).text();
  assert.ok(body.includes('Próximamente'));
  assert.ok(body.includes('Demostración'));
  assert.ok(!/<script/i.test(body));
  assert.match(body, /<input[^>]*disabled/);
  assert.ok(!/<form[^>]*coach/i.test(body));
});

test('the home screen shows the latest weight and the change since the first entry', async () => {
  const env = await setup();
  const ana = await login(env, 'ana');
  await send(env, '/app/peso/', { method: 'POST', cookie: ana, form: { date: '2026-09-01', kg: '80' } });
  await send(env, '/app/peso/', { method: 'POST', cookie: ana, form: { date: '2026-10-01', kg: '76,4' } });
  const body = await (await send(env, '/app/', { cookie: ana })).text();
  assert.ok(body.includes('76,4 kg'));
  assert.ok(body.includes('−3,6 kg'));
});

test('a member changes their password only with the current one', async () => {
  const env = await setup();
  const ana = await login(env, 'ana');
  assert.equal((await send(env, '/app/cuenta/clave/', { method: 'POST', cookie: ana, form: { current: 'mala', password: NEW_PASSWORD, confirm: NEW_PASSWORD } })).status, 400);
  assert.equal((await send(env, '/app/cuenta/clave/', { method: 'POST', cookie: ana, form: { current: PASSWORD, password: NEW_PASSWORD, confirm: NEW_PASSWORD } })).status, 303);
  const res = await send(env, '/entrar/', { method: 'POST', form: { email: 'ana@x.co', password: NEW_PASSWORD } });
  assert.equal(res.status, 303);
});

test('an admin deletes all of a member data, rows and files, and the action is logged', async () => {
  const env = await setup();
  const admin = await login(env, 'admin1');
  const ana = await login(env, 'ana');
  await send(env, '/app/peso/', { method: 'POST', cookie: ana, form: { date: '2026-10-20', kg: '70' } });
  await upload(env, '/app/fotos/', ana, { bytes: JPEG, type: 'image/jpeg', fields: { date: '2026-10-21', pose: 'front' } });
  await upload(env, '/admin/miembros/ana/documentos/', admin, { bytes: PDF, type: 'application/pdf', fields: { kind: 'nutrition_plan', title: 'N' } });
  assert.equal(env.FILES.objects.size, 2);
  assert.equal((await send(env, '/admin/miembros/ana/borrar-datos/', { method: 'POST', cookie: admin, form: { confirm: 'ana@x.co', operation: crypto.randomUUID() } })).status, 303);
  assert.equal(env.FILES.objects.size, 0);
  for (const t of ['weights', 'photos', 'documents']) assert.deepEqual(await ids(env, t, 'ana'), [], t);
  assert.ok(await env.DB.prepare("SELECT 1 FROM audit_log WHERE action = 'member.delete_data' AND target_user_id = 'ana'").first());
  assert.equal((await send(env, '/admin/miembros/beto/borrar-datos/', { method: 'POST', cookie: admin, form: { confirm: 'wrong' } })).status, 400, 'typed confirmation');
});

test('the admin member page shows that member data read-only', async () => {
  const env = await setup();
  const ana = await login(env, 'ana');
  await send(env, '/app/peso/', { method: 'POST', cookie: ana, form: { date: '2026-10-20', kg: '70', note: 'visible-para-admin' } });
  const body = await (await send(env, '/admin/miembros/ana/', { cookie: await login(env, 'admin1') })).text();
  assert.ok(body.includes('visible-para-admin'));
  assert.equal((await send(env, '/admin/miembros/ana/', { cookie: ana })).status, 403);
});

test('private files require a member to accept consent', async () => {
  const env = await setup();
  const ana = await login(env, 'ana');
  await upload(env, '/app/fotos/', ana, { bytes: JPEG, type: 'image/jpeg', fields: { date: '2026-10-21', pose: 'front' } });
  const { id } = await env.DB.prepare("SELECT id FROM photos WHERE user_id = 'ana'").first();
  await env.DB.prepare("UPDATE users SET consent_version = NULL WHERE id = 'ana'").run();
  const res = await send(env, `/app/archivos/${id}`, { cookie: ana });
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), '/app/consentimiento/');
});

test('member and admin tables have keyboard-accessible scroll regions', async () => {
  const env = await setup();
  const ana = await login(env, 'ana');
  await send(env, '/app/peso/', { method: 'POST', cookie: ana, form: { date: '2026-10-20', kg: '72.5' } });
  const member = await (await send(env, '/app/peso/', { cookie: ana })).text();
  const admin = await (await send(env, '/admin/', { cookie: await login(env, 'admin1') })).text();
  for (const html of [member, admin]) {
    assert.match(html, /<div class="table-scroll" role="region" aria-label="[^"]+" tabindex="0">\s*<table/);
  }
});

test('invalid log entries retain submitted values and reject impossible dates', async () => {
  const env = await setup();
  const ana = await login(env, 'ana');
  const response = await send(env, '/app/peso/', { method: 'POST', cookie: ana, form: { date: '2026-02-30', kg: '72,5', note: 'Mi nota <personal>' } });
  assert.equal(response.status, 400);
  const html = await response.text();
  assert.match(html, /name="kg"[^>]*value="72,5"/);
  assert.match(html, /name="note"[^>]*value="Mi nota &lt;personal&gt;"/);
  assert.equal((await ids(env, 'weights', 'ana')).length, 0);
  const meal = await send(env, '/app/nutricion/', { method: 'POST', cookie: ana, form: { date: '2026-10-20', meal: 'dinner', description: 'Arroz', kcal: 'invalid' } });
  const mealHtml = await meal.text();
  assert.equal(meal.status, 400);
  assert.match(mealHtml, /value="dinner" selected/);
  assert.match(mealHtml, /name="description"[^>]*value="Arroz"/);
});

test('a member must accept the current consent version', async () => {
  const env = await setup();
  const ana = await login(env, 'ana');
  await env.DB.prepare("UPDATE users SET consent_version = 'older-version' WHERE id = 'ana'").run();
  const response = await send(env, '/app/peso/', { cookie: ana });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/app/consentimiento/');
  await send(env, '/app/consentimiento/', { method: 'POST', cookie: ana, form: { accept: 'yes' } });
  assert.equal((await send(env, '/app/peso/', { cookie: ana })).status, 200);
});

test('a failed photo database write leaves a durable upload intent', async () => {
  const env = await setup();
  const ana = await login(env, 'ana');
  env.DB.raw.exec("CREATE TRIGGER fail_photo BEFORE INSERT ON photos BEGIN SELECT RAISE(ABORT, 'photo failed'); END");
  await assert.rejects(upload(env, '/app/fotos/', ana, { bytes: JPEG, type: 'image/jpeg', fields: { date: '2026-10-21', pose: 'front' } }), /photo failed/);
  assert.ok(await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'upload_intents'").first());
  const intents = (await env.DB.prepare("SELECT r2_key FROM upload_intents WHERE user_id = 'ana'").all()).results;
  assert.equal(intents.length, 1);
  assert.ok(env.FILES.objects.has(intents[0].r2_key));
});

test('an uncertain object write retains its upload intent', async () => {
  const env = await setup();
  const ana = await login(env, 'ana');
  const put = env.FILES.put;
  env.FILES.put = async (...args) => { await put(...args); throw new Error('uncertain R2 write'); };
  await assert.rejects(upload(env, '/app/fotos/', ana, { bytes: JPEG, type: 'image/jpeg', fields: { date: '2026-10-21', pose: 'front' } }), /uncertain R2 write/);
  assert.ok(await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'upload_intents'").first());
  const intents = (await env.DB.prepare("SELECT r2_key FROM upload_intents WHERE user_id = 'ana'").all()).results;
  assert.equal(intents.length, 1);
  assert.ok(env.FILES.objects.has(intents[0].r2_key));
});

test('a failed document database write leaves a durable upload intent', async () => {
  const env = await setup();
  const admin = await login(env, 'admin1');
  env.DB.raw.exec("CREATE TRIGGER fail_document BEFORE INSERT ON documents BEGIN SELECT RAISE(ABORT, 'document failed'); END");
  await assert.rejects(upload(env, '/admin/miembros/ana/documentos/', admin, { bytes: PDF, type: 'application/pdf', fields: { kind: 'training_plan', title: 'Plan' } }), /document failed/);
  assert.ok(await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'upload_intents'").first());
  const intents = (await env.DB.prepare("SELECT r2_key FROM upload_intents WHERE user_id = 'ana'").all()).results;
  assert.equal(intents.length, 1);
  assert.ok(env.FILES.objects.has(intents[0].r2_key));
});

test('a committed upload survives a lost database response', async () => {
  const env = await setup();
  const ana = await login(env, 'ana');
  const batch = env.DB.batch;
  env.DB.batch = async (statements) => { await batch(statements); throw new Error('response lost'); };
  await assert.rejects(upload(env, '/app/fotos/', ana, { bytes: JPEG, type: 'image/jpeg', fields: { date: '2026-10-21', pose: 'front' } }), /response lost/);
  const photo = await env.DB.prepare("SELECT r2_key FROM photos WHERE user_id = 'ana'").first();
  assert.ok(photo && env.FILES.objects.has(photo.r2_key));
  assert.equal((await env.DB.prepare("SELECT count(*) n FROM upload_intents WHERE user_id = 'ana'").first()).n, 0);
});

test('an upload completed after the erasure fence removes its confirmed object', async () => {
  const env = await setup();
  const ana = await login(env, 'ana');
  const put = env.FILES.put;
  env.FILES.put = async (...args) => {
    await put(...args);
    await env.DB.prepare("UPDATE users SET data_revision = 'new', data_erasing = 1 WHERE id = 'ana'").run();
  };
  const response = await upload(env, '/app/fotos/', ana, { bytes: JPEG, type: 'image/jpeg', fields: { date: '2026-10-21', pose: 'front' } });
  assert.equal(response.status, 409);
  assert.equal(env.FILES.objects.size, 0);
  assert.equal((await env.DB.prepare("SELECT count(*) n FROM upload_intents WHERE user_id = 'ana'").first()).n, 0);
  assert.equal((await ids(env, 'photos', 'ana')).length, 0);
});

test('a member log request started before erasure cannot save afterward', async () => {
  const env = await setup();
  const cookie = await login(env, 'ana');
  const { readSession } = await import('../worker/auth/sessions.ts');
  const { logAdd } = await import('../worker/app/routes.ts');
  const now = Math.floor(Date.now() / 1000);
  const session = await readSession(env.DB, { token: cookie.split('=')[1], now });
  await env.DB.prepare("UPDATE users SET data_revision = 'after-erasure' WHERE id = 'ana'").run();
  const request = req('/app/peso/', { method: 'POST', form: { date: '2026-10-20', kg: '72.5' } });
  const response = await logAdd(request, env.DB, 'weights', session, now);
  assert.equal(response.status, 409);
  assert.equal((await ids(env, 'weights', 'ana')).length, 0);
});

test('a stale admin nutrition update cannot write or audit after erasure', async () => {
  for (const existing of [false, true]) {
    const env = await setup();
    const cookie = await login(env, 'admin1');
    if (existing) await env.DB.prepare("INSERT INTO nutrition_targets (user_id, kcal, protein_g, carbs_g, fat_g, updated_at) VALUES ('ana', 1800, 100, 200, 60, 0)").run();
    const { readSession } = await import('../worker/auth/sessions.ts');
    const { setTargets } = await import('../worker/admin/routes.ts');
    const now = Math.floor(Date.now() / 1000);
    const session = await readSession(env.DB, { token: cookie.split('=')[1], now });
    const request = req('/admin/miembros/ana/metas/', { method: 'POST', form: { kcal: '2000', protein: '120', carbs: '200', fat: '70' } });
    const read = request.formData.bind(request);
    request.formData = async () => { const data = await read(); await env.DB.prepare("UPDATE users SET data_revision = 'after-erasure' WHERE id = 'ana'").run(); return data; };
    const response = await setTargets(request, env.DB, session, now, 'ana');
    assert.equal(response.status, 409);
    const target = await env.DB.prepare("SELECT kcal FROM nutrition_targets WHERE user_id = 'ana'").first();
    assert.equal(target?.kcal ?? null, existing ? 1800 : null);
    assert.equal((await env.DB.prepare("SELECT count(*) n FROM audit_log WHERE action = 'nutrition.targets'").first()).n, 0);
  }
});


test('erasure waits for a paused private upload and retries safely', async () => {
  const env = await setup();
  const admin = await login(env, 'admin1');
  const ana = await login(env, 'ana');
  const operation = crypto.randomUUID();
  let started, resume;
  const ready = new Promise(resolve => { started = resolve; });
  const wait = new Promise(resolve => { resume = resolve; });
  const put = env.FILES.put;
  env.FILES.put = async (...args) => { started(); await wait; return put(...args); };
  const pendingUpload = upload(env, '/app/fotos/', ana, { bytes: JPEG, type: 'image/jpeg', fields: { date: '2026-10-21', pose: 'front' } });
  await ready;
  const erase = () => send(env, '/admin/miembros/ana/borrar-datos/', { method: 'POST', cookie: admin, form: { confirm: 'ana@x.co', operation } });
  assert.equal((await erase()).status, 409);
  assert.equal((await send(env, '/app/', { cookie: ana })).status, 409);
  resume();
  assert.equal((await pendingUpload).status, 409);
  assert.equal((await erase()).status, 303);
  assert.equal(env.FILES.objects.size, 0);
  assert.equal((await env.DB.prepare("SELECT count(*) AS n FROM upload_intents WHERE user_id = 'ana'").first()).n, 0);
});

test('retrying a completed erasure cannot delete new member data', async () => {
  const env = await setup();
  const admin = await login(env, 'admin1');
  const ana = await login(env, 'ana');
  const operation = crypto.randomUUID();
  const erase = () => send(env, '/admin/miembros/ana/borrar-datos/', { method: 'POST', cookie: admin, form: { confirm: 'ana@x.co', operation } });
  assert.equal((await erase()).status, 303);
  await send(env, '/app/peso/', { method: 'POST', cookie: ana, form: { date: '2026-10-20', kg: '70' } });
  assert.equal((await erase()).status, 303);
  assert.equal((await ids(env, 'weights', 'ana')).length, 1);
});

test('concurrent erasure is rejected while another request owns the deletion', async () => {
  const env = await setup();
  const admin = await login(env, 'admin1');
  const ana = await login(env, 'ana');
  await upload(env, '/app/fotos/', ana, { bytes: JPEG, type: 'image/jpeg', fields: { date: '2026-10-21', pose: 'front' } });
  let started, resume;
  const ready = new Promise(resolve => { started = resolve; });
  const wait = new Promise(resolve => { resume = resolve; });
  const remove = env.FILES.delete;
  env.FILES.delete = async (...args) => { started(); await wait; return remove(...args); };
  const operation = crypto.randomUUID();
  const erase = op => send(env, '/admin/miembros/ana/borrar-datos/', { method: 'POST', cookie: admin, form: { confirm: 'ana@x.co', operation: op } });
  const first = erase(operation);
  await ready;
  assert.equal((await erase(operation)).status, 409);
  assert.equal((await erase(crypto.randomUUID())).status, 409);
  resume();
  assert.equal((await first).status, 303);
  assert.equal(env.FILES.objects.size, 0);
});

test('a failed storage deletion stays pending and can be retried', async () => {
  const env = await setup();
  const admin = await login(env, 'admin1');
  const ana = await login(env, 'ana');
  await upload(env, '/app/fotos/', ana, { bytes: JPEG, type: 'image/jpeg', fields: { date: '2026-10-21', pose: 'front' } });
  const remove = env.FILES.delete;
  env.FILES.delete = async () => { throw new Error('storage unavailable'); };
  const operation = crypto.randomUUID();
  const erase = () => send(env, '/admin/miembros/ana/borrar-datos/', { method: 'POST', cookie: admin, form: { confirm: 'ana@x.co', operation } });
  assert.equal((await erase()).status, 409);
  assert.equal(env.FILES.objects.size, 1);
  assert.equal((await send(env, '/app/', { cookie: ana })).status, 409);
  env.FILES.delete = remove;
  assert.equal((await erase()).status, 303);
  assert.equal(env.FILES.objects.size, 0);
});

test('a lost final database response cannot make a completed erasure delete new data on retry', async () => {
  const env = await setup();
  const admin = await login(env, 'admin1');
  const ana = await login(env, 'ana');
  const operation = crypto.randomUUID();
  const erase = () => send(env, '/admin/miembros/ana/borrar-datos/', { method: 'POST', cookie: admin, form: { confirm: 'ana@x.co', operation } });
  const batch = env.DB.batch;
  let calls = 0;
  env.DB.batch = async statements => { const result = await batch(statements); if (++calls === 2) throw new Error('response lost'); return result; };
  assert.equal((await erase()).status, 303);
  env.DB.batch = batch;
  assert.equal((await send(env, '/app/peso/', { method: 'POST', cookie: ana, form: { date: '2026-10-20', kg: '70' } })).status, 303);
  assert.equal((await erase()).status, 303);
  assert.equal((await ids(env, 'weights', 'ana')).length, 1);
});

test('a failed final database transaction never reports erasure complete', async () => {
  const env = await setup();
  const admin = await login(env, 'admin1');
  const ana = await login(env, 'ana');
  await send(env, '/app/peso/', { method: 'POST', cookie: ana, form: { date: '2026-10-20', kg: '70' } });
  env.DB.raw.exec("CREATE TRIGGER fail_erase BEFORE INSERT ON audit_log WHEN NEW.action = 'member.delete_data' BEGIN SELECT RAISE(ABORT, 'cleanup failed'); END");
  const operation = crypto.randomUUID();
  const erase = () => send(env, '/admin/miembros/ana/borrar-datos/', { method: 'POST', cookie: admin, form: { confirm: 'ana@x.co', operation } });
  assert.equal((await erase()).status, 503);
  assert.equal((await ids(env, 'weights', 'ana')).length, 1);
  assert.equal((await send(env, '/app/', { cookie: ana })).status, 409);
  assert.equal((await erase()).status, 409);
  assert.equal((await env.DB.prepare('SELECT status FROM erasure_jobs WHERE id = ?').bind(operation).first()).status, 'pending');
});

test('a different stale erasure form cannot delete records created after another erasure', async () => {
  const env = await setup();
  const admin = await login(env, 'admin1');
  const ana = await login(env, 'ana');
  const erase = (operation, revision) => send(env, '/admin/miembros/ana/borrar-datos/', { method: 'POST', cookie: admin, form: { confirm: 'ana@x.co', operation, revision } });
  assert.equal((await erase(crypto.randomUUID(), '')).status, 303);
  await send(env, '/app/peso/', { method: 'POST', cookie: ana, form: { date: '2026-10-20', kg: '70' } });
  assert.equal((await erase(crypto.randomUUID(), '')).status, 409);
  assert.equal((await ids(env, 'weights', 'ana')).length, 1);
});

test('erasure removes nutrition values from audit details', async () => {
  const env = await setup();
  const admin = await login(env, 'admin1');
  await send(env, '/admin/miembros/ana/metas/', { method: 'POST', cookie: admin, form: { kcal: '2100', protein: '140', carbs: '220', fat: '70' } });
  assert.equal((await send(env, '/admin/miembros/ana/borrar-datos/', { method: 'POST', cookie: admin, form: { confirm: 'ana@x.co', operation: crypto.randomUUID(), revision: '' } })).status, 303);
  const audit = await env.DB.prepare("SELECT detail FROM audit_log WHERE action = 'nutrition.targets' AND target_user_id = 'ana'").first();
  assert.equal(audit.detail, null);
});

test('an uncertain upload keeps erasure pending even if its object lands later', async () => {
  const env = await setup();
  const admin = await login(env, 'admin1');
  const ana = await login(env, 'ana');
  let late;
  env.FILES.put = async (key, value, opts) => { late = async () => env.FILES.objects.set(key, { bytes: new Uint8Array(value), httpMetadata: opts.httpMetadata }); throw new Error('uncertain put'); };
  await assert.rejects(upload(env, '/app/fotos/', ana, { bytes: JPEG, type: 'image/jpeg', fields: { date: '2026-10-21', pose: 'front' } }), /uncertain put/);
  const operation = crypto.randomUUID();
  const erase = () => send(env, '/admin/miembros/ana/borrar-datos/', { method: 'POST', cookie: admin, form: { confirm: 'ana@x.co', operation, revision: '' } });
  assert.equal((await erase()).status, 409);
  await late();
  assert.equal((await erase()).status, 409);
  assert.equal(env.FILES.objects.size, 1);
});

test('a member page captured during erasure keeps the pending job if it completes while rendering', async () => {
  const env = await setup();
  const admin = await login(env, 'admin1');
  const ana = await login(env, 'ana');
  const operation = crypto.randomUUID();
  await env.DB.prepare("UPDATE users SET data_revision = 'revision-b', data_erasing = 1 WHERE id = 'ana'").run();
  await env.DB.prepare("INSERT INTO erasure_jobs (id, user_id, status, created_at) VALUES (?, 'ana', 'pending', 1)").bind(operation).run();
  const prepare = env.DB.prepare;
  env.DB.prepare = sql => {
    const statement = prepare(sql);
    if (!sql.includes('AS pending')) return statement;
    return { ...statement, bind: (...args) => {
      const bound = statement.bind(...args);
      return { ...bound, first: async (...params) => {
        const snapshot = await bound.first(...params);
        await prepare("UPDATE erasure_jobs SET status = 'complete' WHERE id = ?").bind(operation).run();
        await prepare("UPDATE users SET data_erasing = 0 WHERE id = 'ana'").run();
        return snapshot;
      } };
    } };
  };
  const page = await (await send(env, '/admin/miembros/ana/', { cookie: admin })).text();
  env.DB.prepare = prepare;
  assert.ok(page.includes(`name="operation" value="${operation}"`));
  await send(env, '/app/peso/', { method: 'POST', cookie: ana, form: { date: '2026-10-20', kg: '70' } });
  assert.equal((await send(env, '/admin/miembros/ana/borrar-datos/', { method: 'POST', cookie: admin, form: { confirm: 'ana@x.co', operation, revision: 'revision-b' } })).status, 303);
  assert.equal((await ids(env, 'weights', 'ana')).length, 1);
});

test('a password change started before an admin reset cannot override the reset', async () => {
  const env = await setup();
  const memberCookie = await login(env, 'ana');
  const adminCookie = await login(env, 'admin1');
  const { readSession } = await import('../worker/auth/sessions.ts');
  const { changePassword } = await import('../worker/app/routes.ts');
  const now = Math.floor(Date.now() / 1000);
  const session = await readSession(env.DB, { token: memberCookie.split('=')[1], now });
  const reset = await send(env, '/admin/miembros/ana/reset/', { method: 'POST', cookie: adminCookie });
  assert.equal(reset.status, 200);
  const request = req('/app/cuenta/clave/', { method: 'POST', form: { current: PASSWORD, password: NEW_PASSWORD, confirm: NEW_PASSWORD } });
  assert.equal((await changePassword(request, env.DB, session, now)).status, 409);
  assert.equal((await send(env, '/entrar/', { method: 'POST', form: { email: 'ana@x.co', password: NEW_PASSWORD } })).status, 401);
  assert.equal((await env.DB.prepare("SELECT count(*) AS n FROM auth_tokens WHERE user_id = 'ana' AND purpose = 'reset'").first()).n, 1);
});

test('changing a password invalidates previous sessions and reset links', async () => {
  const env = await setup();
  const member = await login(env, 'ana');
  const other = await login(env, 'ana');
  const { issueToken } = await import('../worker/auth/tokens.ts');
  await issueToken(env.DB, { userId: 'ana', purpose: 'reset', now: Math.floor(Date.now() / 1000) });
  const response = await send(env, '/app/cuenta/clave/', { method: 'POST', cookie: member, form: { current: PASSWORD, password: NEW_PASSWORD, confirm: NEW_PASSWORD } });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/entrar/?clave=actualizada');
  assert.match(await (await send(env, response.headers.get('location'))).text(), /Contraseña actualizada/);
  assert.equal((await send(env, '/app/', { cookie: other })).headers.get('location'), '/entrar/');
  assert.equal((await env.DB.prepare("SELECT count(*) AS n FROM auth_tokens WHERE user_id = 'ana'").first()).n, 0);
  assert.equal((await send(env, '/entrar/', { method: 'POST', form: { email: 'ana@x.co', password: NEW_PASSWORD } })).status, 303);
});

test('a logged-out session cannot complete a delayed password change', async () => {
  const env = await setup();
  const member = await login(env, 'ana');
  const { readSession } = await import('../worker/auth/sessions.ts');
  const { changePassword } = await import('../worker/app/routes.ts');
  const now = Math.floor(Date.now() / 1000);
  const session = await readSession(env.DB, { token: member.split('=')[1], now });
  await send(env, '/salir/', { method: 'POST', cookie: member });
  const request = req('/app/cuenta/clave/', { method: 'POST', form: { current: PASSWORD, password: NEW_PASSWORD, confirm: NEW_PASSWORD } });
  assert.equal((await changePassword(request, env.DB, session, now)).status, 409);
});

test('concurrent member password changes cannot both succeed', async () => {
  const env = await setup();
  const member = await login(env, 'ana');
  const change = password => send(env, '/app/cuenta/clave/', { method: 'POST', cookie: member, form: { current: PASSWORD, password, confirm: password } });
  const responses = await Promise.all([change(NEW_PASSWORD), change('tercera-clave-123')]);
  assert.deepEqual(responses.map(r => r.status).sort(), [303, 409]);
});

test('a failed password-change transaction preserves the old password and session', async () => {
  const env = await setup();
  const member = await login(env, 'ana');
  env.DB.raw.exec("CREATE TRIGGER fail_revoke BEFORE DELETE ON sessions WHEN OLD.user_id = 'ana' BEGIN SELECT RAISE(ABORT, 'revoke failed'); END");
  await assert.rejects(send(env, '/app/cuenta/clave/', { method: 'POST', cookie: member, form: { current: PASSWORD, password: NEW_PASSWORD, confirm: NEW_PASSWORD } }), /revoke failed/);
  assert.equal((await send(env, '/app/', { cookie: member })).status, 200);
  assert.equal((await send(env, '/entrar/', { method: 'POST', form: { email: 'ana@x.co', password: PASSWORD } })).status, 303);
  assert.equal((await send(env, '/entrar/', { method: 'POST', form: { email: 'ana@x.co', password: NEW_PASSWORD } })).status, 401);
});

test('deleting a meal returns to that meal’s day', async () => {
  const env = await setup();
  const ana = await login(env, 'ana');
  await send(env, '/app/nutricion/', { method: 'POST', cookie: ana, form: { date: '2025-01-12', meal: 'lunch', description: 'Arroz' } });
  const [id] = await ids(env, 'nutrition_logs', 'ana');
  const res = await send(env, `/app/nutricion/${id}/borrar/`, { method: 'POST', cookie: ana });
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), '/app/nutricion/?fecha=2025-01-12');
  assert.match(await (await send(env, res.headers.get('location'), { cookie: ana })).text(), /Tu día, 2025-01-12/);
});

test('delete controls identify their record for screen-reader users', async () => {
  const env = await setup();
  const ana = await login(env, 'ana');
  await send(env, '/app/nutricion/', { method: 'POST', cookie: ana, form: { date: '2025-01-12', meal: 'lunch', description: 'Arroz & pollo' } });
  await upload(env, '/app/fotos/', ana, { bytes: JPEG, type: 'image/jpeg', fields: { date: '2025-01-12', pose: 'front' } });
  const nutrition = await (await send(env, '/app/nutricion/?fecha=2025-01-12', { cookie: ana })).text();
  const photos = await (await send(env, '/app/fotos/', { cookie: ana })).text();
  assert.match(nutrition, /aria-label="Borrar.*2025-01-12.*Arroz &amp; pollo"/);
  assert.match(photos, /aria-label="Borrar foto Frente del 2025-01-12"/);
});

test('photo validation preserves the selected date and pose and asks for the file again', async () => {
  const env = await setup();
  const ana = await login(env, 'ana');
  const res = await upload(env, '/app/fotos/', ana, { bytes: PNG, type: 'image/png', fields: { date: '2025-01-12', pose: 'side' } });
  assert.equal(res.status, 400);
  const html = await res.text();
  assert.match(html, /name="date" value="2025-01-12"/);
  assert.match(html, /<option value="side" selected>Perfil<\/option>/);
  assert.match(html, /elige la foto de nuevo/i);
  assert.equal(env.FILES.objects.size, 0);
});
