import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const POSTS_DIR = join(__dirname, 'src', 'content', 'posts');

// Lê a data real de cada post (updatedDate ?? pubDate) do frontmatter dos MDX,
// para o sitemap sair com <lastmod> por página em vez de "tudo mudou hoje".
function buildLastmodMap() {
  const map = {};
  let files = [];
  try {
    files = readdirSync(POSTS_DIR).filter((f) => f.endsWith('.mdx'));
  } catch {
    return map;
  }
  for (const file of files) {
    const slug = file.replace(/\.mdx$/, '');
    const raw = readFileSync(join(POSTS_DIR, file), 'utf-8');
    const fm = raw.split(/^---\s*$/m)[1] || '';
    const pub = fm.match(/^pubDate:\s*['"]?(\d{4}-\d{2}-\d{2})/m)?.[1];
    const upd = fm.match(/^updatedDate:\s*['"]?(\d{4}-\d{2}-\d{2})/m)?.[1];
    const date = upd || pub;
    if (date) map[slug] = `${date}T00:00:00Z`;
  }
  return map;
}

const lastmodBySlug = buildLastmodMap();

export default defineConfig({
  site: 'https://reformacaseira.com.br',
  integrations: [
    mdx(),
    sitemap({
      serialize(item) {
        const m = item.url.match(/\/posts\/([^/]+)\/?$/);
        if (m && lastmodBySlug[m[1]]) {
          item.lastmod = new Date(lastmodBySlug[m[1]]).toISOString();
        }
        return item;
      },
    }),
  ],
  build: {
    format: 'directory',
  },
  trailingSlash: 'always',
  image: {
    service: { entrypoint: 'astro/assets/services/sharp' },
  },
});
