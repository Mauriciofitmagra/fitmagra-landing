// Private files in R2 (spec 11.2). No public bucket URL exists; every read goes through ownership checks here.
import type { DB } from './db.ts';
import type { Session } from './auth/sessions.ts';

export interface Bucket {
  put(key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<{ body: ReadableStream; httpMetadata?: { contentType?: string } } | null>;
  delete(keys: string | string[]): Promise<void>;
}

interface Kind { types: Record<string, number[]>; max: number; ext: string }
export const PHOTO: Kind = { types: { 'image/jpeg': [0xff, 0xd8, 0xff], 'image/webp': [0x52, 0x49, 0x46, 0x46] }, max: 8 * 1024 * 1024, ext: 'jpg' };
export const PDF: Kind = { types: { 'application/pdf': [0x25, 0x50, 0x44, 0x46, 0x2d] }, max: 15 * 1024 * 1024, ext: 'pdf' };

export type Checked = { ok: true; bytes: ArrayBuffer; type: string } | { ok: false; status: 400 | 413; error: string };

// Checks the declared type, the size and the first bytes, so a renamed file cannot pass as a photo or PDF.
export async function checkFile(file: unknown, kind: Kind): Promise<Checked> {
  if (!(file instanceof File) || file.size === 0) return { ok: false, status: 400, error: 'Falta el archivo.' };
  const magic = kind.types[file.type];
  if (!magic) return { ok: false, status: 400, error: 'Ese tipo de archivo no se acepta.' };
  if (file.size > kind.max) return { ok: false, status: 413, error: `El archivo pasa de ${kind.max / 1024 / 1024} MB.` };
  const bytes = await file.arrayBuffer();
  const head = new Uint8Array(bytes, 0, Math.min(magic.length, bytes.byteLength));
  if (!magic.every((b, i) => head[i] === b)) return { ok: false, status: 400, error: 'El archivo no corresponde a su tipo.' };
  return { ok: true, bytes, type: file.type };
}

export const fileKey = (userId: string, folder: 'photos' | 'docs', ext: string): string => `u/${userId}/${folder}/${crypto.randomUUID()}.${ext}`;

export async function beginUpload(db: DB, userId: string, revision: string, key: string, now: number): Promise<boolean> {
  const result = await db.prepare(`INSERT INTO upload_intents (r2_key, user_id, created_at)
    SELECT ?, id, ? FROM users WHERE id = ? AND data_revision = ? AND data_erasing = 0`)
    .bind(key, now, userId, revision).run();
  return result.meta.changes === 1;
}

export async function discardUpload(db: DB, files: Bucket, key: string): Promise<void> {
  await files.delete(key);
  await db.prepare('DELETE FROM upload_intents WHERE r2_key = ?').bind(key).run();
}

// Finds a photo or document by id. A member gets only their own; an admin gets any. Otherwise null, so ids leak nothing.
export async function findFile(db: DB, session: Session, id: string): Promise<{ r2_key: string; content_type: string } | null> {
  const owner = session.role === 'admin' ? '' : ' AND user_id = ?';
  const args = session.role === 'admin' ? [id] : [id, session.userId];
  return (await db.prepare(`SELECT r2_key, content_type FROM photos WHERE id = ?${owner}`).bind(...args).first<{ r2_key: string; content_type: string }>())
    ?? (await db.prepare(`SELECT r2_key, 'application/pdf' AS content_type FROM documents WHERE id = ?${owner}`).bind(...args).first<{ r2_key: string; content_type: string }>());
}

export async function stream(bucket: Bucket, key: string, contentType: string): Promise<Response | null> {
  const obj = await bucket.get(key);
  if (!obj) return null;
  return new Response(obj.body, { headers: { 'content-type': contentType, 'cache-control': 'private, no-store', 'content-disposition': 'inline' } });
}
