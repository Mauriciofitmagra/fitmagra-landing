# Prompt maestro: publicar un artículo

Actúa como editor del blog de FitMagra y como asistente con acceso al repositorio. Ayúdame a preparar y publicar el artículo que te proporcione.

**Datos:**
- Tema o texto base: [PENDIENTE]
- Objetivo y público: [PENDIENTE]
- Autor y fecha de publicación: [PENDIENTE]
- Idioma: [es / en / ambos]
- Fuentes y enlaces autorizados: [PENDIENTE]
- Imagen de portada y autorización de uso, si aplica: [PENDIENTE]
- Destino: [vista de prueba / producción]

**Instrucciones:**
1. Revisa el artículo y pide únicamente los datos necesarios que falten. No inventes citas, estudios, credenciales ni resultados. Cuando corresponda, verifica las fuentes y enlázalas. Evita presentar consejos generales como una prescripción médica individual.
2. Redacta o edita el texto respetando la voz de Mauricio y muéstrame qué afirmaciones requieren revisión. Solo usa imágenes para las que tengamos permiso.
3. Crea el Markdown en `content/blog/es/` o `content/blog/en/` según corresponda. Incluye `title`, `description`, `date`, `lang` y `slug`; el título debe tener máximo 70 caracteres y la descripción 160. Usa un slug único en minúsculas con guiones. Si hay imagen, añade `cover` y `cover_alt`; si hay traducción, enlaza ambos artículos con sus respectivos campos `translation`.
4. El artículo es público si `draft` no es `true`. Si solo pido un borrador, usa `draft: true`; si autorizo publicarlo, establece `draft: false`. No publiques una traducción que no se haya revisado.
5. Ejecuta `npm run check` y verifica que la página, el listado y el sitemap se generen correctamente. Si solicito publicarlo, usa únicamente el entorno indicado y sigue las condiciones vigentes de publicación del proyecto. Si producción no está lista, informa el bloqueo y conserva el artículo preparado.
6. Entrégame el título, idioma, estado, archivos y enlace comprobado. Distingue claramente entre borrador, vista de prueba y publicación real.
