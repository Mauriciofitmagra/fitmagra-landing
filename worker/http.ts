// Responses, cookies and request checks shared by every Worker route.
export const COOKIE = '__Host-fm_session';
const MAX_AGE = 30 * 24 * 3600;

const SECURITY_HEADERS: Record<string, string> = {
  'content-security-policy': "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'cache-control': 'private, no-store',
};

export function withSecurity(res: Response): Response {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!out.headers.has(k) || k === 'cache-control') out.headers.set(k, v);
  return out;
}

export const html = (body: string, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', ...headers } });

export const redirect = (location: string, headers: Record<string, string> = {}): Response =>
  new Response(null, { status: 303, headers: { location, ...headers } });

export const sessionCookie = (token: string): string => `${COOKIE}=${token}; Path=/; Max-Age=${MAX_AGE}; Secure; HttpOnly; SameSite=Lax`;
export const clearCookie = (): string => `${COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax`;

export function cookie(request: Request, name = COOKIE): string | null {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=') || null;
  }
  return null;
}

// Every state-changing request must come from this site. A missing Origin is refused too.
export const sameOrigin = (request: Request): boolean => request.headers.get('origin') === new URL(request.url).origin;

export async function form(request: Request): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [k, v] of (await request.formData()).entries()) if (typeof v === 'string') out[k] = v;
  return out;
}

export const clientIp = (request: Request): string => request.headers.get('cf-connecting-ip') ?? 'unknown';

export const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
