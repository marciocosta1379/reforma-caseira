import { Client } from 'basic-ftp';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

config({ path: join(ROOT, '.env') });

const { HOSTINGER_FTP_HOST, HOSTINGER_FTP_USER, HOSTINGER_FTP_PASS, HOSTINGER_FTP_DIR } = process.env;

if (!HOSTINGER_FTP_HOST || !HOSTINGER_FTP_USER || !HOSTINGER_FTP_PASS) {
  console.error('Credenciais FTP ausentes. Preencha o arquivo .env com:');
  console.error('  HOSTINGER_FTP_HOST, HOSTINGER_FTP_USER, HOSTINGER_FTP_PASS');
  console.error('\nVeja .env.example para referência.');
  process.exit(1);
}

const DIST_DIR = join(ROOT, 'dist');
const REMOTE_DIR = HOSTINGER_FTP_DIR || '/public_html';

async function main() {
  const client = new Client();
  client.ftp.verbose = false;

  try {
    console.log(`Conectando a ${HOSTINGER_FTP_HOST}...`);
    await client.access({
      host: HOSTINGER_FTP_HOST,
      user: HOSTINGER_FTP_USER,
      password: HOSTINGER_FTP_PASS,
      secure: true,
      secureOptions: { rejectUnauthorized: false },
    });

    console.log(`Conectado. Enviando dist/ para ${REMOTE_DIR}...`);
    await client.ensureDir(REMOTE_DIR);
    await client.clearWorkingDir();
    await client.uploadFromDir(DIST_DIR, REMOTE_DIR);

    console.log('Deploy concluído com sucesso!');
    console.log(`Site ao vivo em: https://reformacaseira.com.br`);
  } catch (err) {
    console.error('Erro no deploy:', err.message);
    process.exit(1);
  } finally {
    client.close();
  }
}

main();
