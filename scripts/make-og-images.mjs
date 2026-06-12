// Gera os cartões sociais (og:image) de cada post em 1200x630 JPG.
// WhatsApp não renderiza WebP, então é necessário gerar JPG explícito.
// Uso: node scripts/make-og-images.mjs   (roda no deploy, antes do build)

import { readFile, mkdir, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const POSTS_DIR = join(ROOT, 'src', 'content', 'posts');
const PUBLIC = join(ROOT, 'public');
const OG_DIR = join(PUBLIC, 'images', 'og');

const W = 1200;
const H = 630;

const xmlEscape = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

function wrapTitle(title, maxChars = 21, maxLines = 4) {
  const words = title.split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length <= maxChars) {
      cur = (cur + ' ' + w).trim();
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].replace(/.{1}$/, '…');
  }
  return lines;
}

function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const fm = m ? m[1] : '';
  const titleM = fm.match(/^title:\s*['"]?(.+?)['"]?\s*$/m);
  const imgM = fm.match(/image:\s*['"](\/images\/produtos\/[^'"]+)['"]/);
  return {
    title: titleM ? titleM[1].replace(/''/g, "'") : null,
    image: imgM ? imgM[1] : null,
  };
}

async function buildCard({ slug, title, image }) {
  const lines = wrapTitle(title);
  const lineHeight = 62;
  const titleTop = 250;
  const titleSvg = lines
    .map((ln, i) => `<text x="60" y="${titleTop + i * lineHeight}" font-family="Arial, sans-serif" font-size="52" font-weight="700" fill="#2d3a4a">${xmlEscape(ln)}</text>`)
    .join('\n');

  const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="#ffffff"/>
    <rect x="0" y="0" width="14" height="${H}" fill="#e8651a"/>
    <rect x="720" y="0" width="480" height="${H}" fill="#f7f8fa"/>
    <text x="60" y="92" font-family="Arial, sans-serif" font-size="44" font-weight="700" fill="#2d3a4a">Reforma Caseira</text>
    <text x="60" y="122" font-family="Arial, sans-serif" font-size="19" fill="#e8651a">Ferramentas · Reforma · DIY</text>
    ${titleSvg}
    <rect x="60" y="536" width="340" height="54" rx="27" fill="#e8651a"/>
    <text x="84" y="571" font-family="Arial, sans-serif" font-size="26" font-weight="700" fill="#ffffff">reformacaseira.com.br</text>
  </svg>`);

  const composites = [];

  if (image) {
    const productPath = join(PUBLIC, image);
    if (existsSync(productPath)) {
      const box = { w: 400, h: 470 };
      const prod = await sharp(productPath)
        .resize(box.w, box.h, { fit: 'inside', background: { r: 247, g: 248, b: 250, alpha: 1 } })
        .toBuffer();
      const meta = await sharp(prod).metadata();
      const left = Math.round(960 - meta.width / 2);
      const top = Math.round(315 - meta.height / 2);
      composites.push({ input: prod, left, top });
    }
  }

  const out = join(OG_DIR, `${slug}.jpg`);
  await sharp(bg).composite(composites).jpeg({ quality: 86 }).toFile(out);
  return out;
}

async function main() {
  const force = process.argv.includes('--force');

  if (!existsSync(OG_DIR)) await mkdir(OG_DIR, { recursive: true });
  const files = (await readdir(POSTS_DIR)).filter((f) => f.endsWith('.mdx'));
  let ok = 0;
  let skipped = 0;
  for (const f of files) {
    const slug = basename(f, '.mdx');
    const out = join(OG_DIR, `${slug}.jpg`);
    if (!force && existsSync(out)) {
      skipped++;
      continue;
    }
    const raw = await readFile(join(POSTS_DIR, f), 'utf-8');
    const { title, image } = parseFrontmatter(raw);
    if (!title) {
      console.log(`  pulando ${slug} (sem título)`);
      continue;
    }
    await buildCard({ slug, title, image });
    console.log(`  og: ${slug}.jpg${image ? '' : ' (sem produto — só marca)'}`);
    ok++;
  }
  console.log(`\n${ok} cartão(ões) gerado(s), ${skipped} já existente(s) pulado(s). Use --force para regenerar todos.`);
}

main().catch((e) => {
  console.error('Erro:', e.message);
  process.exit(1);
});
