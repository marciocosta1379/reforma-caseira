---
name: lote-semanal
description: Gera 5 posts (segunda a sexta) para o Blog Reforma Caseira em sequência. Use quando o usuário digitar /lote-semanal seguido da semana e temas, ou pedir explicitamente para "gerar a semana" ou "criar os posts da semana". Cada post é uma listicle, comparativo ou review baseado no mix editorial 60/20/20.
---

# Skill: Lote Semanal de Posts

## Quando usar

Quando o usuário pedir para gerar os 5 posts da próxima semana (segunda a sexta) em lote. Exemplos:

- `/lote-semanal 2026-06-08 parafusadeiras-baratas furadeiras-impacto serras-tico-tico lixadeiras parafusadeiras-pro`
- "vamos gerar a semana de 8/jun com esses temas..."
- "cria os posts pra próxima semana"

Se o usuário não passar temas, sugira 5 baseados em buscas atuais no painel ML.

## Estratégia editorial (60/20/20)

Para cada semana de 5 posts:
- **3 listicles** (Top N) — segunda, quarta, sexta — tráfego alto, múltiplos pontos de saída
- **1 comparativo** (X vs Y) — terça — alta conversão
- **1 review individual** — quinta — autoridade + nicho

Adapte se o usuário preferir mais comparativos ou reviews.

## Fluxo passo-a-passo

### Passo 0 — Confirmar com o usuário

Antes de começar, confirme:
1. Quais são as 5 datas (calcule seg-sex a partir da data fornecida)
2. Quais são os 5 temas
3. Qual tipo (listicle/comparativo/review) para cada

Apresente em formato de tabela. Só prossiga após confirmação.

### Passo 1 — Coletar link de afiliado ML (MÉTODO CANÔNICO — testado)

⚠️ **NUNCA gere link a partir de uma URL de BUSCA** (`lista.mercadolivre.com.br/...`) nem do Link
Builder com URL de busca — isso aponta pro resultado de busca, não pro produto. **Sempre use a
PÁGINA DO PRODUTO específico.**

Via Claude in Chrome, use **`javascript_tool`** (NÃO screenshots/`read_page`: páginas do ML penduram
no `document_idle` e estouram). Para cada produto (listicle 5-7, comparativo 2-3, review 1):

1. **Achar o produto:** navegue numa busca (`lista.mercadolivre.com.br/<query>`) e pegue o **1º
   resultado ORGÂNICO** (pule patrocinados: href com `click1`/`mclics`). URL limpa do produto:
   `/p/MLB\d+`, `produto.mercadolivre.com.br/MLB-\d+` ou `/up/MLBU\d+` (corte `?`/`#`).
2. **Navegue para a página do produto** e num único `javascript_tool` colete:
   - **Preço:** `document.querySelector('[itemprop="price"]')?.getAttribute('content')` (confiável;
     NÃO leia carrossel/parcela "12x" — dá valor errado).
   - **Imagem:** `[...document.querySelectorAll('figure img,[class*="gallery"] img')].find(i=>/mlstatic/.test(i.src))`
     (para baixar em alta use a variante `D_Q_NP_2X_..._-E.webp`).
   - **Link de afiliado:** clique `document.querySelector('.generate_link_button')` e leia o
     `meli.la/CODE` novo que aparece no DOM:
     ```js
     const before = new Set([...document.body.innerText.matchAll(/meli\.la\/([A-Za-z0-9]+)/g)].map(m=>m[1]));
     document.querySelector('.generate_link_button').click();
     // poll a cada 500ms por um meli.la/CODE que não estava em `before`
     ```
   Esse `meli.la/CODE` é o `affiliateUrl`.

**Pegadinhas (observadas na prática):**
- O **filtro de privacidade** bloqueia retornar strings com cookie/query-string — retorne **só o CODE**, nunca URLs com `?...`.
- O **clipboard fica bloqueado** — leia o `meli.la` do DOM, não de `navigator.clipboard`.
- O código é **determinístico por produto+conta** (regerar o mesmo produto dá o mesmo código).
- Páginas que não carregam (título "(1)"/vazio) → pegue outro produto.
- **UTM no `meli.la` é OK** (o `AffiliateButton` anexa `utm_source=reformacaseira...`).

### Passo 2 — Pesquisa externa para análise fidedigna

Para cada produto, fazer **WebSearch** com queries como:
- `"[nome do produto]" review opinião`
- `"[nome do produto]" vs [concorrente]`
- `"[modelo específico]" specs ficha técnica`

Fontes confiáveis para ferramentas no Brasil:
- **Tudo Construção** (tudoconstrucao.com.br)
- **Maquifer** (maquifer.com.br)
- **Tools Brasil** / **TB Ferramentas**
- **Reclame Aqui** — para detectar problemas reais
- **YouTube** — canais como "Marcenaria Madeireira", "Marceneiro Curioso", "Mestre dos Reparos"
- **Sites oficiais** das marcas (Bosch, DeWalt, Black+Decker, Tramontina, WAP)

Coletar:
- **Specs técnicas reais** (potência em W, voltagem, RPM, peso, autonomia)
- **Prós** mencionados por múltiplas fontes
- **Contras** mencionados por múltiplas fontes
- **Comparação com modelos similares**

**Regra de ouro**: nunca invente specs ou opiniões. Se não encontrar info confiável, deixe genérico ou pesquise mais.

### Passo 3 — Baixar imagens dos produtos

Montar JSON com os produtos coletados e rodar:

```bash
node scripts/search-products.mjs --file scripts/products-[slug].json
```

Estrutura do JSON:
```json
[
  {
    "id": "MLB12345678",
    "name": "Nome do Produto",
    "brand": "Bosch",
    "price": 299.90,
    "rating": 4.7,
    "soldQuantity": 5000,
    "image": "https://http2.mlstatic.com/D_NQ_NP_...jpg",
    "affiliateUrl": "https://meli.la/XXXXXXX"
  }
]
```

O script baixa as imagens em WebP para `public/images/produtos/[id].webp` e gera arquivo final em `scripts/products-[timestamp].json`.

### Passo 4 — Gerar esqueleto MDX

Para cada post:

```bash
node scripts/scaffold-post.mjs \
  --data scripts/products-[timestamp].json \
  --slug "[slug-do-post]" \
  --category [categoria-válida] \
  --title "[Título de até 70 caracteres]"
```

Categorias válidas: `furadeiras`, `parafusadeiras`, `serras`, `lixadeiras`, `medicao`, `ferramentas-manuais`, `jardinagem`, `organizacao`, `guias`

### Passo 5 — Editar frontmatter com data agendada

Após o scaffold, **EDITAR** o arquivo MDX criado para:
- Definir `pubDate: YYYY-MM-DD` com a data agendada do post
- Manter `draft: true` (será publicado automaticamente pelo workflow)
- Definir `author: 'Márcio Costa'` (autor nomeado para E-E-A-T)
- Adicionar array `faq` no frontmatter espelhando a seção "Perguntas frequentes" do corpo (gera FAQPage schema automático). Texto PLANO, sem markdown. Exemplo:
  ```yaml
  faq:
    - question: 'Pergunta exata da seção FAQ?'
      answer: 'Resposta em texto plano, igual ao conteúdo visível.'
  ```
  **Importante:** o texto do `faq` DEVE espelhar o conteúdo visível (exigência do Google) — não invente Q&A que não está no corpo.

### Passo 5b — Escolher os 3 posts em destaque da semana

A home mostra no máximo **3 posts** na seção "⭐ Em destaque" (campo `featured: true` no frontmatter; padrão é `false`).

**A cada lote semanal, escolher os 3 posts da semana com MAIOR apelo** e marcar `featured: true` neles. Deixar os outros 2 como `featured: false`.

Critérios de apelo (em ordem de peso):
1. **Listicles "Top N"** — atraem mais cliques (títulos com número + benefício)
2. **Faixa de preço acessível / "custo-benefício"** — maior público
3. **Categorias de maior procura** (furadeiras, parafusadeiras, serras)
4. **Comparativos de marcas conhecidas** (Bosch, DeWalt, Makita) — alta intenção

Evitar deixar em destaque os reviews de nicho ou produtos muito caros (apelo menor). Na dúvida, priorizar os listicles sobre os reviews individuais.

### Passo 6 — Preencher os [TODO]s com conteúdo de qualidade

Estrutura por tipo de post:

**Listicle (Top N):**
- Introdução (200-300 palavras): problema, metodologia, para quem é
- Seção "Como avaliamos": critérios objetivos
- Tabela comparativa (componente `<ComparisonTable>` com `price`)
- Para cada produto (150-300 palavras):
  - **Imagem inline no corpo:** logo após o `## N. Produto`, insira `![Nome](/images/produtos/<id>.webp)`. Não basta a foto no card do rodapé — o leitor quer ver o produto na seção que está lendo.
  - Preço, vendidos
  - Análise baseada nos reviews reais pesquisados
  - 2-3 prós reais (de fontes externas)
  - 2-3 contras reais (de fontes externas)
  - Veredicto + para quem indica
  - Botão `<AffiliateButton href="meli.la/XXX" source="slug" />`
- Seção "Como escolher" (3-4 perguntas decisórias)
- FAQ (3-5 perguntas frequentes do nicho)
- **Total: 2000-3000 palavras**

**Comparativo (X vs Y):**
- Introdução (200-300 palavras): contexto da comparação
- Tabela comparativa lado a lado
- Análise de cada produto (300-400 palavras)
- Seção "Em quais cenários cada um ganha"
- Veredicto final por perfil de usuário
- **Total: 1500-2500 palavras**

**Review individual:**
- Introdução com contexto e expectativas
- Specs técnicas detalhadas
- Análise de uso real (baseada em fontes externas)
- Prós e contras detalhados
- Comparação com 2-3 alternativas
- Veredicto + para quem é/não é
- **Total: 1500-2500 palavras**

### Passo 7 — Apresentar lote completo ao usuário

Quando os 5 posts estiverem prontos, gere um relatório:

```
LOTE SEMANAL — Semana de DD/MM a DD/MM

Segunda DD/MM — [Listicle] [Título]
  ✓ src/content/posts/[slug].mdx
  ✓ 5 produtos, X palavras, links de afiliado OK

Terça DD/MM — [Comparativo] [Título]
  ✓ src/content/posts/[slug].mdx
  ✓ ...

[etc para todos os 5]

Próximos passos:
1. Revisar cada post em src/content/posts/
2. Ajustar tom/correções
3. Quando aprovado, eu mudo draft: false e commito
4. Os posts serão publicados automaticamente nas datas agendadas
```

**NÃO commitar nem mudar draft:false sem aprovação do usuário.**

## Diretrizes de tom

- **Honesto**: sempre apontar pontos negativos reais quando existirem
- **Técnico mas acessível**: explica termos sem ser jargão pesado
- **Direto**: sem enrolação no começo, vai ao ponto rápido
- **Brasileiro**: usar "R$" e formatação brasileira de preços
- **Sem hipérbole**: evitar "incrível", "melhor de todos", "imperdível"
- **Sempre disclaimer**: posts já incluem `<AffiliateDisclosure />` automaticamente pelo template

## Erros comuns a evitar

- Inventar specs técnicas — sempre pesquise antes
- Copiar texto de reviews existentes — reescreva com suas próprias palavras
- Não baixar a imagem — sempre rodar `search-products.mjs` antes
- Esquecer de definir `pubDate` correto — cada post precisa da data agendada
- Mudar `draft: false` sem aprovação do usuário
- Usar UTM diferente de `reformacaseira` (o componente AffiliateButton já cuida disso)
