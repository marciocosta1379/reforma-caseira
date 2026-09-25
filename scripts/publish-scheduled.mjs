import { readdir, readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

// Publicação agendada, em duas fases que o workflow roda separadas:
//   --no-deploy    só troca draft:true → false nos posts vencidos (o workflow commita em seguida)
//   --deploy-only  confere no site AO VIVO se os posts recentes respondem 200; o que faltar
//                  (publicado agora OU que falhou numa execução anterior) dispara deploy,
//                  e no fim verifica de novo. Se ainda faltar, sai com erro (o n8n alerta).
// Sem flag, faz as duas coisas (uso local: `npm run publish-scheduled`).
//
// O commit vem ANTES do deploy de propósito: se o FTP cair, o estado dos posts já está no
// repo e qualquer disparo seguinte (redisparo do n8n, cron, próxima rodada) completa o deploy.

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const POSTS_DIR = join(ROOT, 'src', 'content', 'posts');

const SITE_URL = 'https://reformacaseira.com.br';
const INDEXNOW_KEY = '6c2beb8606394af3a7e4fb5d28e66d6d';
const SITE_HOST = 'reformacaseira.com.br';

const LOOKBACK_DAYS = 14; // janela de posts conferidos no site ao vivo
const DEPLOY_ATTEMPTS = 3;

const args = new Set(process.argv.slice(2));
const doFlip = !args.has('--deploy-only');
const doDeploy = !args.has('--no-deploy');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Avisa o IndexNow (Bing, Yandex, etc.) sobre URLs novas/atualizadas
async function pingIndexNow(slugs) {
  const urlList = [`${SITE_URL}/`, ...slugs.map((s) => `${SITE_URL}/posts/${s}/`)];
  try {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: SITE_HOST,
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

async function readPosts() {
  const files = (await readdir(POSTS_DIR)).filter((f) => f.endsWith('.mdx') || f.endsWith('.md'));
  const posts = [];
  for (const file of files) {
    const path = join(POSTS_DIR, file);
    const content = await readFile(path, 'utf-8');
    // \r?\n: no Windows (core.autocrlf) os arquivos vêm com CRLF
    const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1];
    if (!fm) continue;
    const pubDate = new Date(fm.match(/^pubDate:\s*(.+?)\s*$/m)?.[1]);
    if (isNaN(pubDate.getTime())) continue;
    posts.push({
      file,
      path,
      content,
      slug: file.replace(/\.mdx?$/, ''),
      pubDate,
      draft: /^draft:\s*true\s*$/m.test(fm),
    });
  }
  return posts;
}

async function flipDrafts(posts, now) {
  const flipped = [];
  for (const post of posts) {
    if (!post.draft || post.pubDate > now) continue;
    console.log(`Publicando: ${post.file} (agendado para ${post.pubDate.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })})`);
    await writeFile(post.path, post.content.replace(/^draft:\s*true(\s*)$/m, 'draft: false$1'), 'utf-8');
    post.draft = false;
    flipped.push(post.slug);
  }
  if (flipped.length === 0) console.log('Nenhum post agendado venceu agora.');
  return flipped;
}

async function isLive(slug) {
  // Query única para furar cache (LiteSpeed/CDN) e não receber um 404 guardado
  const url = `${SITE_URL}/posts/${slug}/?v=${Date.now()}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20_000) });
      return res.status === 200;
    } catch {
      await sleep(3000 * attempt); // erro de rede ≠ post ausente: tenta de novo
    }
  }
  return false;
}

async function missingOnSite(posts, now) {
  const since = now.getTime() - LOOKBACK_DAYS * 86_400_000;
  const recent = posts.filter((p) => !p.draft && p.pubDate <= now && p.pubDate.getTime() >= since);
  const results = await Promise.all(recent.map(async (p) => ((await isLive(p.slug)) ? null : p.slug)));
  return { checked: recent.length, missing: results.filter(Boolean) };
}

async function ensureLive(posts, now) {
  const { checked, missing } = await missingOnSite(posts, now);
  console.log(`Conferidos ${checked} post(s) dos últimos ${LOOKBACK_DAYS} dias no site ao vivo.`);
  if (missing.length === 0) {
    console.log('Tudo no ar — nada para publicar.');
    return;
  }
  console.log(`Fora do ar (${missing.length}): ${missing.join(', ')}`);

  let deployed = false;
  for (let attempt = 1; attempt <= DEPLOY_ATTEMPTS && !deployed; attempt++) {
    // Build uma vez; nas retentativas só o FTP (que retoma pelo manifesto)
    const cmd = attempt === 1 ? 'npm run deploy' : 'node scripts/deploy.mjs';
    console.log(`\nDeploy — tentativa ${attempt}/${DEPLOY_ATTEMPTS}: ${cmd}`);
    try {
      execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
      deployed = true;
    } catch {
      if (attempt < DEPLOY_ATTEMPTS) await sleep(30_000 * attempt);
    }
  }
  if (!deployed) throw new Error(`deploy falhou ${DEPLOY_ATTEMPTS}x; posts fora do ar: ${missing.join(', ')}`);

  // Verificação final: o post tem de responder 200 no domínio, não basta o FTP dizer ok
  await sleep(5000);
  const still = (await Promise.all(missing.map(async (s) => ((await isLive(s)) ? null : s)))).filter(Boolean);
  if (still.length > 0) throw new Error(`deploy terminou mas continuam fora do ar: ${still.join(', ')}`);

  console.log(`\n✓ ${missing.length} post(s) confirmado(s) no ar.`);
  await pingIndexNow(missing);
}

async function main() {
  const now = new Date();
  const posts = await readPosts();
  if (doFlip) await flipDrafts(posts, now);
  if (doDeploy) await ensureLive(posts, now);
}

main().catch((err) => {
  console.error('Erro:', err.message);
  process.exit(1);
});
