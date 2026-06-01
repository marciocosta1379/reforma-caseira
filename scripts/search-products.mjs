import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const IMAGES_DIR = join(ROOT, 'public', 'images', 'produtos');

function parseArgs() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log(`
Uso: node scripts/search-products.mjs --json '<JSON dos produtos>'

Este script recebe um array JSON de produtos (gerado pelo Claude Code via pesquisa web)
e baixa as imagens, salva em public/images/produtos/ em WebP.

Formato do JSON esperado:
[
  {
    "id": "MLB12345",
    "name": "Nome do produto",
    "brand": "Marca",
    "price": 299.90,
    "image": "https://url-da-imagem.jpg",
    "affiliateUrl": "https://mercadolivre.com.br/...",
    "soldQuantity": 500
  }
]

Dica: O Claude Code pode gerar esse JSON automaticamente ao pesquisar produtos
no Mercado Livre via WebSearch e WebFetch.
`);
    process.exit(0);
  }

  let jsonData = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--json' && args[i + 1]) {
      jsonData = args[i + 1];
      i++;
    } else if (args[i] === '--file' && args[i + 1]) {
      return { file: args[i + 1] };
    }
  }

  if (jsonData) {
    return { products: JSON.parse(jsonData) };
  }

  console.error('Forneça --json \'[...]\' ou --file products.json');
  process.exit(1);
}

async function downloadImage(imageUrl, productId) {
  if (!existsSync(IMAGES_DIR)) {
    await mkdir(IMAGES_DIR, { recursive: true });
  }

  const outPath = join(IMAGES_DIR, `${productId}.webp`);

  if (existsSync(outPath)) {
    console.log(`  Imagem já existe: ${productId}.webp (pulando)`);
    return `/images/produtos/${productId}.webp`;
  }

  try {
    const res = await fetch(imageUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) return null;

    const buffer = Buffer.from(await res.arrayBuffer());
    await sharp(buffer)
      .resize(640, 640, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(outPath);

    return `/images/produtos/${productId}.webp`;
  } catch (err) {
    console.error(`  Falha ao baixar imagem de ${productId}: ${err.message}`);
    return null;
  }
}

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function main() {
  const opts = parseArgs();

  let products;
  if (opts.file) {
    const { readFile } = await import('fs/promises');
    products = JSON.parse(await readFile(opts.file, 'utf-8'));
  } else {
    products = opts.products;
  }

  console.log(`Processando ${products.length} produtos...\n`);

  for (const product of products) {
    if (!product.id) {
      product.id = slugify(product.name).substring(0, 30);
    }

    console.log(`  ${product.name}`);

    if (product.image && product.image.startsWith('http')) {
      const localPath = await downloadImage(product.image, product.id);
      if (localPath) {
        product.image = localPath;
        console.log(`    -> ${localPath}`);
      }
    }

    if (!product.pros) product.pros = [];
    if (!product.cons) product.cons = [];
    if (!product.rating) product.rating = null;
  }

  const outFile = join(ROOT, 'scripts', `products-${Date.now()}.json`);
  await writeFile(outFile, JSON.stringify(products, null, 2), 'utf-8');

  console.log(`\n${products.length} produtos salvos em: ${outFile}`);
  console.log('\nPróximo passo:');
  console.log(`  node scripts/scaffold-post.mjs --data "${outFile}" --slug "melhores-xxx"`);
}

main().catch((err) => {
  console.error('Erro:', err.message);
  process.exit(1);
});
