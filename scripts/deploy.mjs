import { Client } from 'basic-ftp';
import { resolve, join, relative, extname, posix } from 'path';
import { readdir, readFile, writeFile, mkdtemp, rm } from 'fs/promises';
import { createHash } from 'crypto';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { config } from 'dotenv';

// Deploy FTP incremental e à prova de queda.
//
// A Hostinger derruba a sessão FTP no meio de uploads longos (ECONNRESET / timeout no
// modo passivo — foi o que parou a publicação da rede em 24-25/09/2026). Por isso:
//  1. Manifesto de hashes no servidor (.deploy-manifest.json): só sobe o que mudou —
//     num dia normal são poucos HTML, não o dist/ inteiro.
//  2. Upload arquivo a arquivo: se a conexão cai, reconecta e continua de onde parou.
//  3. Ordem segura: assets → HTML → sitemap/rss. Um deploy interrompido nunca deixa
//     HTML novo apontando para asset que ainda não subiu.
//  4. O manifesto é gravado mesmo em falha, com o que já subiu: a próxima execução retoma.

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

config({ path: join(ROOT, '.env'), quiet: true });

const { HOSTINGER_FTP_HOST, HOSTINGER_FTP_USER, HOSTINGER_FTP_PASS, HOSTINGER_FTP_DIR } = process.env;

if (!HOSTINGER_FTP_HOST || !HOSTINGER_FTP_USER || !HOSTINGER_FTP_PASS) {
  console.error('Credenciais FTP ausentes. Preencha o arquivo .env com:');
  console.error('  HOSTINGER_FTP_HOST, HOSTINGER_FTP_USER, HOSTINGER_FTP_PASS');
  console.error('\nVeja .env.example para referência.');
  process.exit(1);
}

const SITE_URL = 'https://reformacaseira.com.br';
const DIST_DIR = join(ROOT, 'dist');
const REMOTE_DIR = HOSTINGER_FTP_DIR || '/public_html';
// Contas FTP "presas" ao domínio já logam dentro do docroot. Nesses casos use
// HOSTINGER_FTP_DIR=. (ou vazio) para NÃO navegar à raiz absoluta (restrita) — fica no dir de login.
const stayInLoginDir = REMOTE_DIR === '.' || REMOTE_DIR === '';

const MANIFEST = '.deploy-manifest.json';
const MAX_RETRIES = Number(process.env.DEPLOY_MAX_RETRIES) || 8; // por arquivo (DEPLOY_MAX_RETRIES=1 no PC: não insistir e não bloquear o IP)
const MAX_RECONNECTS = Number(process.env.DEPLOY_MAX_RECONNECTS) || 40; // no deploy inteiro — acima disso o servidor está fora, desiste

async function listFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(full)));
    else out.push(full);
  }
  return out;
}

// 0 = assets, 1 = páginas, 2 = índices (sitemap/rss/robots) — nessa ordem
function uploadPhase(rel) {
  const ext = extname(rel);
  if (ext === '.html') return 1;
  if (['.xml', '.txt'].includes(ext) && !rel.includes('/')) return 2;
  return 0;
}

const client = new Client(60_000);
let baseDir = '';
let reconnects = 0;

async function connect() {
  client.close();
  await client.access({
    host: HOSTINGER_FTP_HOST,
    user: HOSTINGER_FTP_USER,
    password: HOSTINGER_FTP_PASS,
    secure: true,
    secureOptions: { rejectUnauthorized: false },
  });
  if (!stayInLoginDir) await client.ensureDir(REMOTE_DIR);
  baseDir = (await client.pwd()).replace(/\/$/, '');
}

// Executa uma operação FTP; se a conexão cair, reconecta com backoff e tenta de novo.
async function withRetry(label, fn) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      // 5xx do FTP (ex.: 550 arquivo não existe) é resposta definitiva, não queda de conexão
      const permanent = typeof err.code === 'number' && err.code >= 500 && err.code < 600;
      if (permanent || attempt >= MAX_RETRIES || reconnects >= MAX_RECONNECTS) throw err;
      reconnects++;
      const wait = Math.min(2000 * 2 ** (attempt - 1), 30_000);
      console.warn(`  ${label}: ${err.message} — reconectando em ${wait / 1000}s (${attempt}/${MAX_RETRIES})`);
      await new Promise((r) => setTimeout(r, wait));
      try {
        await connect();
      } catch (e) {
        console.warn(`  reconexão falhou: ${e.message}`);
      }
    }
  }
}

async function readRemoteManifest(tmp) {
  const local = join(tmp, MANIFEST);
  try {
    await withRetry(MANIFEST, () => client.downloadTo(local, `${baseDir}/${MANIFEST}`));
    return JSON.parse(await readFile(local, 'utf-8'));
  } catch (err) {
    if (err.code === 550) return null; // primeiro deploy com manifesto
    throw err;
  }
}

// Sem manifesto (primeira vez): usa o tamanho no servidor para não reenviar as imagens todas.
const sizeCache = new Map();
async function remoteSize(remoteDir, name) {
  if (!sizeCache.has(remoteDir)) {
    try {
      const list = await withRetry(`LIST ${remoteDir}`, () => client.list(remoteDir));
      sizeCache.set(remoteDir, new Map(list.filter((f) => f.isFile).map((f) => [f.name, f.size])));
    } catch (err) {
      if (err.code !== 550) throw err;
      sizeCache.set(remoteDir, new Map());
    }
  }
  return sizeCache.get(remoteDir).get(name);
}

async function main() {
  const files = await listFiles(DIST_DIR);
  const local = {};
  for (const file of files) {
    const rel = relative(DIST_DIR, file).split('\\').join('/');
    const buf = await readFile(file);
    local[rel] = { hash: createHash('sha1').update(buf).digest('hex'), size: buf.length, file };
  }

  console.log(`Conectando a ${HOSTINGER_FTP_HOST}...`);
  await withRetry('login', connect);
  console.log(`Conectado. Dir de login: ${baseDir}. ${files.length} arquivo(s) em dist/.`);

  const tmp = await mkdtemp(join(tmpdir(), 'deploy-'));
  const remote = await readRemoteManifest(tmp);
  const manifest = { ...(remote || {}) };

  const pending = [];
  for (const [rel, info] of Object.entries(local)) {
    if (remote) {
      if (remote[rel] !== info.hash) pending.push(rel);
      continue;
    }
    // Sem manifesto: texto sempre sobe; binário só se o tamanho mudou.
    const isText = ['.html', '.xml', '.txt', '.json', '.webmanifest', '.js', '.css'].includes(extname(rel));
    const dir = posix.dirname(rel) === '.' ? baseDir : `${baseDir}/${posix.dirname(rel)}`;
    if (isText || (await remoteSize(dir, posix.basename(rel))) !== info.size) pending.push(rel);
    else manifest[rel] = info.hash;
  }
  pending.sort((a, b) => uploadPhase(a) - uploadPhase(b));

  console.log(remote ? 'Manifesto remoto encontrado.' : 'Sem manifesto remoto — comparando por tamanho.');
  console.log(`${pending.length} arquivo(s) para enviar, ${files.length - pending.length} sem mudança.`);

  const ensured = new Set();
  let sent = 0;
  let failure = null;
  try {
    for (const rel of pending) {
      const dir = posix.dirname(rel) === '.' ? baseDir : `${baseDir}/${posix.dirname(rel)}`;
      await withRetry(rel, async () => {
        if (!ensured.has(dir)) {
          await client.ensureDir(dir);
          ensured.add(dir);
        }
        await client.uploadFrom(local[rel].file, `${baseDir}/${rel}`);
      });
      manifest[rel] = local[rel].hash;
      if (++sent % 50 === 0) console.log(`  ${sent}/${pending.length}...`);
    }
  } catch (err) {
    failure = err;
  } finally {
    // Grava o manifesto com o que de fato subiu — em falha, a próxima execução retoma daqui.
    try {
      const path = join(tmp, MANIFEST);
      await writeFile(path, JSON.stringify(manifest));
      await withRetry(MANIFEST, () => client.uploadFrom(path, `${baseDir}/${MANIFEST}`));
    } catch (err) {
      console.warn(`Não consegui gravar o manifesto: ${err.message}`);
    }
    await rm(tmp, { recursive: true, force: true });
  }

  if (failure) throw new Error(`${failure.message} (enviados ${sent}/${pending.length}; a próxima execução retoma)`);
  console.log(`Deploy concluído com sucesso! ${sent} enviado(s), ${reconnects} reconexão(ões).`);
  console.log(`Site ao vivo em: ${SITE_URL}`);
}

main()
  .catch((err) => {
    console.error('Erro no deploy:', err.message);
    process.exitCode = 1;
  })
  .finally(() => client.close());
