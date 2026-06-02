import { readdir, readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const POSTS_DIR = join(ROOT, 'src', 'content', 'posts');

const SITE_URL = 'https://reformacaseira.com.br';
const INDEXNOW_KEY = '6c2beb8606394af3a7e4fb5d28e66d6d';

// Avisa o IndexNow (Bing, Yandex, etc.) sobre URLs novas/atualizadas
async function pingIndexNow(slugs) {
  const urlList = [`${SITE_URL}/`, ...slugs.map((s) => `${SITE_URL}/posts/${s}/`)];
  try {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: 'reformacaseira.com.br',
        key: INDEXNOW_KEY,
        keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
        urlList,
      }),
    });
    console.log(`IndexNow: HTTP ${res.status} — ${urlList.length} URL(s) enviada(s) ao Bing.`);
  } catch (err) {
    console.error('IndexNow falhou (ignorado):', err.message);
  }
}

async function main() {
  const now = new Date();
  const files = await readdir(POSTS_DIR);
  const mdxFiles = files.filter((f) => f.endsWith('.mdx') || f.endsWith('.md'));

  const publishedSlugs = [];

  for (const file of mdxFiles) {
    const filePath = join(POSTS_DIR, file);
    const content = await readFile(filePath, 'utf-8');

    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) continue;

    const frontmatter = frontmatterMatch[1];

    const isDraft = /^draft:\s*true$/m.test(frontmatter);
    if (!isDraft) continue;

    const pubDateMatch = frontmatter.match(/^pubDate:\s*(.+)$/m);
    if (!pubDateMatch) continue;

    const pubDate = new Date(pubDateMatch[1].trim());
    if (isNaN(pubDate.getTime()) || pubDate > now) continue;

    console.log(`Publicando: ${file} (agendado para ${pubDate.toLocaleDateString('pt-BR')})`);

    const updated = content.replace(/^draft:\s*true$/m, 'draft: false');
    await writeFile(filePath, updated, 'utf-8');
    publishedSlugs.push(file.replace(/\.mdx?$/, ''));
  }

  if (publishedSlugs.length === 0) {
    console.log('Nenhum post agendado para publicar hoje.');
    return;
  }

  console.log(`\n${publishedSlugs.length} post(s) publicado(s). Fazendo deploy...`);
  execSync('npm run deploy', { cwd: ROOT, stdio: 'inherit' });

  await pingIndexNow(publishedSlugs);
}

main().catch((err) => {
  console.error('Erro:', err.message);
  process.exit(1);
});
