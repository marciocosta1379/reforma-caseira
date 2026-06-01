# Reforma Caseira — Site de Reviews com Afiliado ML

## Projeto

Site estático em **Astro 4** com MDX, hospedado na Hostinger (FTP). Monetizado via programa de afiliados do Mercado Livre. Nicho: ferramentas elétricas/manuais para reformas, marcenaria amadora e DIY doméstico.

Domínio: `reformacaseira.com.br`

## Comandos

```bash
npm run dev          # Dev server em localhost:4321
npm run build        # Gera dist/
npm run deploy       # Build + upload FTP para Hostinger
npm run search       # Busca produtos no ML (alias de search-products.mjs)
npm run scaffold     # Gera MDX a partir de JSON de produtos
npm run publish-scheduled  # Publica posts agendados com pubDate <= hoje
```

## Workflow para criar um novo post

Quando o usuário pedir algo como "crie um post sobre serras tico-tico até R$ 500":

### Passo 1 — Buscar produtos no painel de afiliados ML (via Chrome)

1. Abrir o painel de afiliados: `https://www.mercadolivre.com.br/afiliados/hub`
2. Usar o campo "Busque produtos" para pesquisar (ex: "serra tico-tico")
3. Para cada produto relevante:
   a. Coletar do card: **nome**, **preço**, **rating**, **vendidos**, **% ganhos**
   b. Clicar **Compartilhar** → **Copiar link** → ler clipboard via JS:
      ```js
      navigator.clipboard.readText().then(t => window.__clipResult = t);
      // depois: window.__clipResult → "https://meli.la/XXXXXX"
      ```
   c. O link `meli.la/XXXXX` é o link de afiliado oficial rastreável
   d. Coletar URL da imagem do produto (src do `<img>` no card)
4. Montar array JSON com todos os produtos coletados

### Passo 2 — Baixar imagens e montar JSON

```bash
node scripts/search-products.mjs --file scripts/products-xxx.json
```
Ou passar o JSON inline via `--json`. Isso baixa as imagens em WebP para `public/images/produtos/`.

### Passo 3 — Gerar esqueleto do post

```bash
node scripts/scaffold-post.mjs --data scripts/products-XXXXX.json --slug "melhores-serras-tico-tico" --category serras --title "As 7 melhores serras tico-tico até R$ 500"
```
Cria `src/content/posts/melhores-serras-tico-tico.mdx` com `draft: true` e marcações `[TODO]`.

### Passo 4 — Preencher os [TODO]s

Ler o arquivo e escrever as análises de cada produto. Cada seção deve ter 150-300 palavras com prós, contras e veredicto. Pesquisar specs reais dos produtos via web quando necessário.

### Passo 5 — Publicar

- Para publicar imediatamente: mudar `draft: false` no frontmatter e rodar `npm run deploy`.
- Para agendar: manter `draft: true`, definir `pubDate` no futuro. O script `publish-scheduled` cuida do resto.

### Formato do link de afiliado

Os links de afiliado do ML são shortlinks gerados pelo painel: `https://meli.la/XXXXXXX`
**NÃO é possível gerar programaticamente** — precisam ser copiados do painel via Chrome.
O username do afiliado é **MJLCOSTA**.

## Categorias válidas

`furadeiras` | `parafusadeiras` | `serras` | `lixadeiras` | `medicao` | `ferramentas-manuais` | `jardinagem` | `organizacao` | `guias`

## Componentes disponíveis nos posts MDX

```mdx
import AffiliateButton from '../../components/AffiliateButton.astro';
import ComparisonTable from '../../components/ComparisonTable.astro';
import ProsCons from '../../components/ProsCons.astro';
import ProductCard from '../../components/ProductCard.astro';
```

- `<AffiliateButton href="..." source="slug-do-post" />` — botão amarelo "Ver no Mercado Livre"
- `<ComparisonTable rows={[...]} source="slug" />` — tabela comparativa
- `<ProsCons pros={[...]} cons={[...]} />` — box verde/vermelho
- `<ProductCard name="..." affiliateUrl="..." ... />` — card completo de produto

## Regras editoriais

- Todo post DEVE ter `<AffiliateDisclosure />` (já incluído automaticamente pelo template `[...slug].astro`)
- Links de afiliado usam `rel="sponsored nofollow noopener noreferrer"`
- UTM source é sempre `reformacaseira`
- Títulos têm máximo 70 caracteres
- Descrições meta têm máximo 160 caracteres
- Posts saem com `draft: true` por padrão — mudar para `false` para publicar

## Estrutura de pastas

- `src/content/posts/` — arquivos MDX dos posts
- `src/pages/` — páginas estáticas e templates
- `src/components/` — componentes reutilizáveis
- `src/layouts/` — BaseLayout com SEO
- `src/config/site.ts` — configurações globais do site
- `scripts/` — automação (busca, scaffold, deploy, publicação)
- `public/images/produtos/` — imagens dos produtos em WebP

## Credenciais

Estão em `.env` (não comitar). Ver `.env.example` para referência.
