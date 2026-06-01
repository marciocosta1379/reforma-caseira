import { readdir, readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const POSTS_DIR = join(ROOT, 'src', 'content', 'posts');

config({ path: join(ROOT, '.env') });

const { ML_APP_ID, ML_SECRET_KEY } = process.env;

if (!ML_APP_ID || !ML_SECRET_KEY) {
  console.error('ML_APP_ID e ML_SECRET_KEY não encontrados no .env');
  process.exit(1);
}

// ── Auth ─────────────────────────────────────────────────────────────────────

async function getAccessToken() {
  const res = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: ML_APP_ID,
      client_secret: ML_SECRET_KEY,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Falha ao obter token: ${res.status} ${body}`);
  }

  const data = await res.json();
  return data.access_token;
}

// ── Resolução de shortlink meli.la ────────────────────────────────────────────

const shortlinkCache = new Map();

async function resolveShortlink(url) {
  if (!url.includes('meli.la')) return url;
  if (shortlinkCache.has(url)) return shortlinkCache.get(url);

  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    const resolved = res.url;
    shortlinkCache.set(url, resolved);
    return resolved;
  } catch {
    return url;
  }
}

function extractItemId(url) {
  const match = url.match(/MLB[-_]?(\d+)/i);
  return match ? `MLB${match[1]}` : null;
}

// ── ML API ───────────────────────────────────────────────────────────────────

async function fetchItemPrice(itemId, token) {
  const res = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`ML API ${res.status} para ${itemId}`);

  const data = await res.json();
  return data.price ?? null;
}

// ── Frontmatter parser ────────────────────────────────────────────────────────

function updatePriceInContent(content, productName, newPrice) {
  const rounded = Math.round(newPrice * 100) / 100;

  // Encontra o bloco do produto e atualiza o price dentro dele
  // Estratégia: localiza `name: 'NOME'` e na sequência atualiza `price: NUMERO`
  const escapedName = productName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `(  - name: '${escapedName}'[\\s\\S]*?\\n)(  price: [\\d.]+)`,
    'm'
  );

  if (pattern.test(content)) {
    return content.replace(pattern, `$1  price: ${rounded}`);
  }

  // Tenta com aspas duplas
  const patternDouble = new RegExp(
    `(  - name: "${escapedName}"[\\s\\S]*?\\n)(  price: [\\d.]+)`,
    'm'
  );
  if (patternDouble.test(content)) {
    return content.replace(patternDouble, `$1  price: ${rounded}`);
  }

  return null;
}

function updateUpdatedDate(content) {
  const today = new Date().toISOString().split('T')[0];
  if (/^updatedDate:/m.test(content)) {
    return content.replace(/^updatedDate:.*$/m, `updatedDate: ${today}`);
  }
  // Insere após pubDate se não existir
  return content.replace(/^(pubDate:.*$)/m, `$1\nupdatedDate: ${today}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log('🔑 Obtendo token ML...');
  const token = await getAccessToken();
  console.log('✓ Token obtido\n');

  const files = (await readdir(POSTS_DIR)).filter(
    (f) => f.endsWith('.mdx') || f.endsWith('.md')
  );

  let totalChanged = 0;
  let totalChecked = 0;
  const report = [];

  for (const file of files) {
    const filePath = join(POSTS_DIR, file);
    let content = await readFile(filePath, 'utf-8');

    // Extrai frontmatter
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) continue;

    // Encontra todos os blocos de produto
    const productBlocks = [...fmMatch[1].matchAll(
      /- name: ['"](.+?)['"]\n(?:[\s\S]*?)  affiliateUrl: ['"](.+?)['"]/g
    )];

    if (productBlocks.length === 0) continue;

    console.log(`📄 ${file} — ${productBlocks.length} produto(s)`);
    let fileChanged = false;

    for (const [, name, affiliateUrl] of productBlocks) {
      totalChecked++;

      // Extrai preço atual do frontmatter
      const priceMatch = content.match(
        new RegExp(`name: ['"]${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"][\\s\\S]*?price: ([\\d.]+)`)
      );
      const currentPrice = priceMatch ? parseFloat(priceMatch[1]) : null;

      // Resolve link e busca preço atual
      let itemId = extractItemId(affiliateUrl);
      if (!itemId) {
        const resolved = await resolveShortlink(affiliateUrl);
        itemId = extractItemId(resolved);
      }

      if (!itemId) {
        console.log(`  ⚠️  ${name} — não foi possível extrair item ID`);
        continue;
      }

      let newPrice;
      try {
        newPrice = await fetchItemPrice(itemId, token);
      } catch (err) {
        console.log(`  ⚠️  ${name} — erro: ${err.message}`);
        continue;
      }

      if (newPrice === null) {
        console.log(`  ❌ ${name} — produto não encontrado (${itemId})`);
        continue;
      }

      if (currentPrice === null || Math.abs(newPrice - currentPrice) < 0.01) {
        console.log(`  ✓  ${name} — R$ ${newPrice.toFixed(2)} (sem mudança)`);
        continue;
      }

      const diff = newPrice - currentPrice;
      const diffStr = diff > 0 ? `+R$ ${diff.toFixed(2)}` : `-R$ ${Math.abs(diff).toFixed(2)}`;
      console.log(`  💰 ${name} — R$ ${currentPrice.toFixed(2)} → R$ ${newPrice.toFixed(2)} (${diffStr})`);

      if (!dryRun) {
        const updated = updatePriceInContent(content, name, newPrice);
        if (updated) {
          content = updated;
          fileChanged = true;
          totalChanged++;
          report.push({ file, name, oldPrice: currentPrice, newPrice });
        }
      } else {
        totalChanged++;
        report.push({ file, name, oldPrice: currentPrice, newPrice });
      }
    }

    if (fileChanged) {
      content = updateUpdatedDate(content);
      await writeFile(filePath, content, 'utf-8');
      console.log(`  💾 ${file} atualizado\n`);
    }
  }

  console.log(`\n────────────────────────────────────`);
  console.log(`✅ Verificados: ${totalChecked} produtos`);
  console.log(`📝 Atualizados: ${totalChanged} preços`);

  if (dryRun && totalChanged > 0) {
    console.log(`\n(modo --dry-run: nenhum arquivo foi modificado)`);
  }

  if (totalChanged > 0 && !dryRun) {
    console.log(`\n🚀 Fazendo deploy...`);
    execSync('npm run deploy', { cwd: ROOT, stdio: 'inherit' });
  } else if (totalChanged === 0) {
    console.log(`\nNenhum deploy necessário.`);
  }
}

main().catch((err) => {
  console.error('Erro:', err.message);
  process.exit(1);
});
