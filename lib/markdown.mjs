// ponytail: a Markdown subset (h2 to h4, paragraphs, lists, blockquotes, links, images, bold, italic).
// No tables, code blocks or footnotes. When a post needs them, swap this for a Markdown library or Astro (spec 9).
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const safeUrl = (u) => /^(https?:|mailto:|\/|#)/i.test(u);

function inline(text) {
  return esc(text)
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, src) => (safeUrl(src) ? `<img src="${src}" alt="${alt}" loading="lazy">` : alt))
    .replace(/\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g, (m, label, href) => (safeUrl(href) ? `<a href="${href}">${label}</a>` : label))
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

export function markdown(source) {
  const out = [];
  for (const block of source.replace(/\r\n/g, '\n').trim().split(/\n{2,}/)) {
    const lines = block.split('\n');
    const heading = block.match(/^(#{1,4})\s+(.+)$/);
    if (heading && lines.length === 1) {
      const level = Math.max(2, heading[1].length);
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
    } else if (lines.every((l) => /^[-*]\s+/.test(l))) {
      out.push(`<ul>\n${lines.map((l) => `<li>${inline(l.replace(/^[-*]\s+/, ''))}</li>`).join('\n')}\n</ul>`);
    } else if (lines.every((l) => /^\d+\.\s+/.test(l))) {
      out.push(`<ol>\n${lines.map((l) => `<li>${inline(l.replace(/^\d+\.\s+/, ''))}</li>`).join('\n')}\n</ol>`);
    } else if (lines.every((l) => l.startsWith('>'))) {
      out.push(`<blockquote><p>${inline(lines.map((l) => l.replace(/^>\s?/, '')).join('\n'))}</p></blockquote>`);
    } else {
      out.push(`<p>${inline(block)}</p>`);
    }
  }
  return out.join('\n');
}
