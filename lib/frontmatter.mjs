// Blog post front matter (spec section 9). One `key: value` per line; `tags: [a, b]` is a list.
// `file` is the path under content/blog/, e.g. "es/mi-post.md"; its folder must match `lang`.
const REQUIRED = ['title', 'description', 'date', 'lang', 'slug'];

export function parsePost(source, file) {
  const m = source.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error(`${file}: missing front matter`);
  const fields = {};
  for (const line of m[1].split('\n')) {
    if (!line.trim()) continue;
    const at = line.indexOf(':');
    if (at < 1) throw new Error(`${file}: cannot read line "${line}"`);
    const key = line.slice(0, at).trim();
    const raw = line.slice(at + 1).trim();
    fields[key] = raw.startsWith('[') && raw.endsWith(']')
      ? raw.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean)
      : raw.replace(/^(["'])(.*)\1$/, '$2');
  }
  const fail = (msg) => { throw new Error(`${file}: ${msg}`); };
  for (const k of REQUIRED) if (!fields[k]) fail(`${k} is required`);
  const folder = file.split('/')[0];
  if (fields.lang !== folder) fail(`lang "${fields.lang}" does not match folder "${folder}"`);
  if (!['es', 'en'].includes(fields.lang)) fail('lang must be es or en');
  if (fields.title.length > 70) fail('title is longer than 70 characters');
  if (fields.description.length > 160) fail('description is longer than 160 characters');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.date) || Number.isNaN(Date.parse(fields.date))) fail('date must be YYYY-MM-DD');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fields.slug)) fail('slug must be kebab-case');
  if (fields.cover && !fields.cover_alt) fail('cover_alt is required when cover is set');
  return {
    title: fields.title,
    description: fields.description,
    date: fields.date,
    lang: fields.lang,
    slug: fields.slug,
    translation: fields.translation || null,
    cover: fields.cover || null,
    coverAlt: fields.cover_alt || null,
    tags: Array.isArray(fields.tags) ? fields.tags : fields.tags ? [fields.tags] : [],
    draft: fields.draft === 'true',
    body: m[2],
  };
}
