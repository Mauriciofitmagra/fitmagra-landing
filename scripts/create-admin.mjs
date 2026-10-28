// Prints the SQL for the first admin and their one-time invite link. Roberto runs the SQL himself:
//   node scripts/create-admin.mjs --email a@b.co --name "Mauricio" --origin https://<domain> > admin.sql
//   npx wrangler d1 execute fitmagra --remote --file admin.sql   (then delete admin.sql)
// The link goes to stderr so it never lands in the SQL file. Only the token's SHA-256 is stored.
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { randomToken, sha256Hex, INVITE_TTL } from '../worker/auth/tokens.ts';

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

export async function adminBootstrap({ email, name, origin, now = Math.floor(Date.now() / 1000) }) {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email ?? '')) throw new Error('a valid --email is required');
  if (!/^https?:\/\/[^/]+$/.test(origin ?? '')) throw new Error('--origin must look like https://example.com');
  const id = crypto.randomUUID();
  const token = randomToken();
  const sql = `INSERT INTO users (id, email, name, role, status, created_at, updated_at) VALUES (${q(id)}, ${q(email)}, ${q(name || email)}, 'admin', 'invited', ${now}, ${now});
INSERT INTO auth_tokens (token_hash, user_id, purpose, expires_at) VALUES (${q(await sha256Hex(token))}, ${q(id)}, 'invite', ${now + INVITE_TTL});
INSERT INTO audit_log (actor_id, action, target_user_id, at, detail) VALUES (NULL, 'admin.bootstrap', ${q(id)}, ${now}, 'scripts/create-admin.mjs');
`;
  return { sql, token, link: `${origin}/entrar/clave/?t=${token}&p=invite` };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { email: { type: 'string' }, name: { type: 'string' }, origin: { type: 'string' } } });
  const { sql, link } = await adminBootstrap(values);
  process.stdout.write(sql);
  process.stderr.write(`\nInvite link (valid 72 hours, shown once): ${link}\n`);
}
