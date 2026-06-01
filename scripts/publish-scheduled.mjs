import { readdir, readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const POSTS_DIR = join(ROOT, 'src', 'content', 'posts');

async function main() {
  const now = new Date();
  const files = await readdir(POSTS_DIR);
  const mdxFiles = files.filter((f) => f.endsWith('.mdx') || f.endsWith('.md'));

  let published = 0;

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
    published++;
  }

  if (published === 0) {
    console.log('Nenhum post agendado para publicar hoje.');
    return;
  }

  console.log(`\n${published} post(s) publicado(s). Fazendo deploy...`);
  execSync('npm run deploy', { cwd: ROOT, stdio: 'inherit' });
}

main().catch((err) => {
  console.error('Erro:', err.message);
  process.exit(1);
});
