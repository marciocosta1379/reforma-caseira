import sharp from 'sharp';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const dir = join(ROOT, 'public', 'images', 'produtos');

const jsons = ['trenas-laser', 'serra-circular', 'esmerilhadeiras', 'aparadores', 'tramontina']
  .map((n) => join(ROOT, 'scripts', `products-${n}.json`));

function hires(url) {
  const m = url.match(/(\d+-ML[A-Z]\w*?_\d+)/);
  return m ? `https://http2.mlstatic.com/D_NQ_NP_2X_${m[1]}-F.webp` : null;
}

let ok = 0, fail = 0;
for (const jf of jsons) {
  const arr = JSON.parse(readFileSync(jf, 'utf-8'));
  for (const p of arr) {
    const url = hires(p.image || '');
    if (!url) { console.log('skip', p.id); continue; }
    const out = join(dir, `${p.id}.webp`);
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!r.ok) { console.log('HTTP', r.status, p.id); fail++; continue; }
      const b = Buffer.from(await r.arrayBuffer());
      await sharp(b).resize(800, 800, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toFile(out);
      const meta = await sharp(out).metadata();
      console.log('OK', p.id, `${meta.width}x${meta.height}`);
      ok++;
    } catch (e) {
      console.log('ERR', p.id, e.message);
      fail++;
    }
  }
}
console.log(`\n${ok} ok, ${fail} fail`);
