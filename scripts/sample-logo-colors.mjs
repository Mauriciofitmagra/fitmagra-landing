// Samples the brand colours straight from the official logo files, so the palette in
// site/assets/brand.css can be re-derived and checked: `node scripts/sample-logo-colors.mjs`.
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

export function decodePng(path) {
  const buf = readFileSync(path);
  let off = 8, width, height, colorType;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); colorType = data[9]; }
    if (type === 'IDAT') idat.push(data);
    off += 12 + len;
  }
  if (colorType !== 2 && colorType !== 6) throw new Error(`${path}: only 8-bit RGB/RGBA PNGs are supported`);
  const bpp = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0;
      let v = raw[y * (stride + 1) + 1 + x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * stride + x] = v & 255;
    }
  }
  const px = (x, y) => {
    const i = y * stride + x * bpp;
    return [out[i], out[i + 1], out[i + 2], bpp === 4 ? out[i + 3] : 255];
  };
  return { width, height, px };
}

export const hex = ([r, g, b]) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();

export function averageHex(img, x0, y0, x1, y1) {
  const sum = [0, 0, 0];
  let n = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const p = img.px(x, y);
    sum[0] += p[0]; sum[1] += p[1]; sum[2] += p[2]; n++;
  }
  return hex(sum.map((s) => Math.round(s / n)));
}

export function dominantGreens(img, step = 8) {
  const counts = new Map();
  for (let y = 0; y < img.height; y += 2) for (let x = 0; x < img.width; x += 2) {
    const [r, g, b, a] = img.px(x, y);
    if (a < 200 || g < 90 || g - Math.max(r, b) < 40) continue;
    const key = hex([r, g, b].map((v) => Math.min(255, Math.round(v / step) * step)));
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts].sort((p, q) => q[1] - p[1]).slice(0, 8);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = new URL('../site/media/', import.meta.url).pathname;
  const official = decodePng(`${dir}logo-oficial.png`);
  console.log(`logo-oficial.png ${official.width}x${official.height}`);
  console.log('dominant greens', dominantGreens(official));
  for (const [label, box] of Object.entries({
    'FIT panel, left end': [55, 150, 75, 170],
    'FIT panel, centre': [270, 70, 290, 90],
    'FIT panel, right end': [490, 60, 510, 80],
    'MAGRA letters': [1300, 150, 1310, 160],
    'ground': [2, 2, 12, 12],
    'SYSTEMS rule, left': [250, 379, 300, 382],
  })) console.log(label.padEnd(22), averageHex(official, ...box));

  const metal = decodePng(`${dir}logo-metal.png`);
  console.log(`logo-metal.png ${metal.width}x${metal.height}`);
  console.log('dominant greens', dominantGreens(metal));
}
