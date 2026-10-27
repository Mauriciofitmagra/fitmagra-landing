import { esc } from './http.ts';
import type { Session } from './auth/sessions.ts';

// App screens use the brand tokens on white (spec 6.4); the Taste rules for public pages do not apply here.
export function page(title: string, body: string, session: Session | null = null): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)} | FitMagra</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;800&display=swap">
<link rel="stylesheet" href="/assets/brand.css">
<link rel="stylesheet" href="/assets/app.css">
</head>
<body class="app">
<header class="app-bar">
<a href="${session ? '/app/' : '/'}"><img src="/media/logo-oficial-600.png" width="600" height="162" alt="FitMagra Systems"></a>
${session ? `<nav>${session.role === 'admin' ? '<a href="/admin/">Admin</a>' : ''}<form method="post" action="/salir/"><button class="link">Salir</button></form></nav>` : ''}
</header>
<main class="app-main">
${body}
</main>
</body>
</html>`;
}

const field = (name: string, label: string, type = 'text', extra = ''): string =>
  `<label class="field"><span>${esc(label)}</span><input name="${name}" type="${type}" ${extra}></label>`;

export const loginView = (error = ''): string => page('Entrar', `<h1 class="app-title">Entrar</h1>
${error ? `<p class="notice" role="alert">${esc(error)}</p>` : ''}
<form method="post" action="/entrar/" class="app-form">
${field('email', 'Correo', 'email', 'required autocomplete="username"')}
${field('password', 'Contraseña', 'password', 'required autocomplete="current-password"')}
<button class="button">Entrar</button>
</form>
<p>¿Olvidaste tu contraseña o todavía no tienes cuenta? Escríbele a Mauricio por WhatsApp y te envía un enlace.</p>`);

export const setPasswordView = (t: string, p: string, error = ''): string => page('Crear contraseña', `<h1 class="app-title">Crea tu contraseña</h1>
${error ? `<p class="notice" role="alert">${esc(error)}</p>` : ''}
<form method="post" action="/entrar/clave/" class="app-form">
<input type="hidden" name="t" value="${esc(t)}"><input type="hidden" name="p" value="${esc(p)}">
${field('password', 'Contraseña nueva, 10 caracteres o más', 'password', 'required minlength="10" autocomplete="new-password"')}
${field('confirm', 'Repítela', 'password', 'required minlength="10" autocomplete="new-password"')}
<button class="button">Guardar</button>
</form>`);

export const messageView = (title: string, text: string, session: Session | null = null): string =>
  page(title, `<h1 class="app-title">${esc(title)}</h1><p>${esc(text)}</p>`, session);
