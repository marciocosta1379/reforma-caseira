import { getCollection } from 'astro:content';
import { SITE, AUTHOR, NETWORK } from '../config/site';
import type { APIContext } from 'astro';

// Gera /llms.txt (padrão llmstxt.org): um índice curado do site em Markdown,
// feito para motores generativos (ChatGPT, Gemini, Perplexity) consumirem.
// Regenera a cada build, então sempre reflete os posts publicados.

const humanize = (slug: string) =>
  slug.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export async function GET(context: APIContext) {
  const base = (context.site?.toString() ?? SITE.url).replace(/\/$/, '');
  const posts = (await getCollection('posts', ({ data }) => !data.draft)).sort(
    (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf()
  );

  const byCat: Record<string, typeof posts> = {};
  for (const p of posts) (byCat[p.data.category] ??= []).push(p);

  let out = `# ${SITE.name}\n\n`;
  out += `> ${SITE.tagline}\n\n`;
  out += `${SITE.description}\n\n`;
  out += `Autor: ${AUTHOR.name} (${AUTHOR.role}). ${AUTHOR.bio}\n\n`;

  out += `## Páginas principais\n\n`;
  out += `- [Sobre](${base}/sobre/): quem escreve, credenciais e a metodologia editorial\n`;
  out += `- [Categorias](${base}/categorias/): todos os temas do site\n`;
  out += `- [Contato](${base}/contato/)\n\n`;

  for (const [cat, list] of Object.entries(byCat)) {
    out += `## ${humanize(cat)}\n\n`;
    for (const p of list) {
      out += `- [${p.data.title}](${base}/posts/${p.slug}/): ${p.data.description}\n`;
    }
    out += `\n`;
  }

  out += `## Rede Caseira (mesmo autor)\n\n`;
  for (const n of NETWORK) out += `- [${n.name}](${n.url}): ${n.blurb}\n`;
  out += `\n`;

  return new Response(out, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
