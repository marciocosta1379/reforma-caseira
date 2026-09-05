---
name: lote-semanal
description: Gera os 10 posts da semana para o Blog Reforma Caseira (7 na trilha da manhã + 3 na trilha da tarde) com APROVAÇÃO DO USUÁRIO EM ETAPAS. Use quando o usuário digitar /lote-semanal, pedir "gerar a semana" ou "criar os posts da semana". Nicho: ferramentas, reforma e DIY.
---

# Skill: Lote Semanal de Posts — Reforma Caseira

Reviews e comparativos de ferramentas e materiais de reforma, com **supervisão humana em cada
etapa**. O usuário provoca; o agente sugere; o usuário aprova; só no fim libera o agendamento.

## ⛔ Regra-mãe: NUNCA pule um gate

O fluxo tem **3 portões de aprovação**. Em cada um, **pare e espere o "ok" explícito**.
**Nunca** mude `draft:false`, **nunca** commite e **nunca** agende sem a liberação final.

---

## Fluxo

### 0. Gatilho

`/lote-semanal [data da segunda]` ou "vamos gerar a semana". Calcule as datas.

⚠️ **Cadência desde 05/09/2026: 10 posts por semana.**

| Trilha | Dias | Hora | `pubDate` |
|---|---|---|---|
| Manhã | seg a dom (7) | 07h | `2026-09-14` |
| Tarde | ter, qui, sáb (3) | 18h | `2026-09-15T18:00:00-03:00` |

A trilha da tarde do Reforma Caseira é **sempre passo a passo**. O `publish-scheduled.mjs` compara
o timestamp completo, então basta a hora no `pubDate`. Quem dispara de verdade é o **n8n**
(dois triggers: 07h e 18h, timezone America/Sao_Paulo).

### Gate 1 — TEMAS (aprovação)

Sugira **10 temas** com data, trilha e tipo. Tabela. **Pare e espere aprovação.**

| Trilha | Tipo | Peso |
|---|---|---|
| Manhã (7) | Listicle "Top N", Comparativo "X vs Y", Review individual | tráfego + conversão |
| Tarde (3) | **Passo a passo** | autoridade |

**De onde saem os temas** (⚠️ produto em voga, não data em voga):

- **Mais vendidos** — Amazon (`/gp/bestsellers/...` via `curl`, funciona), Mercado Livre, Shopee.
- **Trends** — Google Shopping/Trends, YouTube (Mestre dos Reparos, Marceneiro Curioso), X.
- ⚠️ **Antes de propor, varra `src/content/posts/` para não repetir tema já publicado.**

### Gate 2 — TÍTULOS (aprovação)

Títulos finais dos 10 posts. **Pare e espere aprovação.**

⚠️ **Comprimentos (o Bing Webmaster acusa curto demais como erro de SEO):**

- **Título: 40 a 70 caracteres.**
- **Descrição meta: 120 a 160 caracteres.** O schema zod corta acima de 160 — valide antes.
- **Direto ao produto/tarefa**, sem framing abstrato: *"Rejunte epóxi ou cimentício: qual usar em
  cada área"*, não *"a arte de finalizar um ambiente"*.

### Passo 3 — Pesquisa + esqueleto (sem aprovação, é trabalho)

#### 3.1 — Links de afiliado

**Amazon (hoje é a loja principal do lote):** link do **SiteStripe** logado na amazon.com.br, ou
monte `https://www.amazon.com.br/dp/<ASIN>?tag=reformacaseira-20`. **Preço OCULTO** (regra Amazon).

**Mercado Livre:** o ML bloqueia acesso automatizado por WebFetch, `curl` e pela própria API
oficial (redirect `gz/account-verification`). O que funciona é **Chrome de verdade via CDP** —
abra o Chrome com `--remote-debugging-port=9222 --user-data-dir=<pasta temp>` e use o script CDP
do Nerd Caseiro (`E:/Site_afiliado_3/scripts/ml-cdp.mjs`) para ler nome, preço, nota e imagem.

- **Todo preço extraído é provisório — confirme com o usuário antes de publicar.**
- ⚠️ O link curto `meli.la/CODE` resolve para a **página do perfil "Rede Caseira"**, não para o
  produto. É o comportamento do programa e o usuário optou por usar assim mesmo. Para **baixar a
  imagem**, use a URL longa do produto, não o `meli.la`.

**Hotmart:** reaproveite os links de curso já cadastrados (ver memória `hotmart-cursos-afiliados-rede`).

⚠️ **NUNCA invente link.** Se não conseguir o link real, escreva `[TODO: link real]` e avise o usuário.

#### 3.2 — Pesquisa externa (≥2 fontes)

Specs reais (potência em W, voltagem, RPM, peso, autonomia), prós e contras citados por múltiplas
fontes. Fontes: sites oficiais das marcas (Bosch, DeWalt, Black+Decker, Tramontina, WAP), Tudo
Construção, Maquifer, Reclame Aqui, YouTube BR. **Regra de ouro: nunca invente specs.**

⚠️ **Protocolo de passo a passo** (ver `CLAUDE.md`): o autor **não executa a obra para o post**.
Procedimento vem de **fonte primária** — manual do fabricante, norma, ficha técnica do material —
com a fonte citada. Sem primeira pessoa falsa ("fiz aqui em casa"). **Fique no reversível e de
baixo risco**: elétrica, hidráulica de parede, gás e trabalho em altura → orientar a chamar
profissional.

#### 3.3 — Baixar imagens (WebP local)

JSON com os produtos → `node scripts/search-products.mjs --file scripts/products-<slug>.json`
(salva em `public/images/produtos/<id>.webp`).

- ⚠️ **A URL da imagem só pode vir do MESMO item da MESMA busca** — nunca de contexto anterior.
- O script **não sobrescreve arquivo existente**: se o `id` repetir, apague o `.webp` antes.
- Confira tamanhos: **< 2KB = imagem quebrada → remova**.
- **Imagem de referência não-produto:** use **Wikimedia Commons** (a API exige header
  `User-Agent`), **cheque a licença** e **credite no post**. Diagrama próprio: SVG inline com
  `@media (prefers-color-scheme: dark)`.

#### 3.4 — Scaffold + frontmatter

```bash
node scripts/scaffold-post.mjs --data scripts/products-<ts>.json --slug "<slug>" --category <cat> --title "<título>"
```

Categorias: `furadeiras | parafusadeiras | serras | lixadeiras | medicao | ferramentas-manuais | jardinagem | organizacao | guias`.

⚠️ Neste repo o produto usa **`affiliateUrl`** (string), não o array `stores` dos outros dois sites.

Frontmatter: `pubDate` (com hora nos posts de 18h), `author: 'Márcio Costa'`, `faq` espelhando a
seção FAQ em **texto plano** (exigência do Google: não invente Q&A que não está no corpo),
`featured: true` nos 2-3 de maior apelo (a home mostra no máximo 3).

Critérios de destaque: listicles > comparativos de marca conhecida > reviews de nicho; priorize
faixa de preço acessível e categorias de maior procura.

#### 3.5 — ⚠️ VERIFICAR ESTOQUE (obrigatório, antes do Gate 3)

Produto fora de estoque queima o clique. **Cheque todos** antes de apresentar:

```bash
curl -s -A "Mozilla/5.0" "https://www.amazon.com.br/dp/SEU_ASIN" | grep -o 'id="availability".\{0,120\}'
```

Sinal de compra possível: texto de disponibilidade positivo **e** presença de
`id="add-to-cart-button"`. Caso ambíguo → confirme no Browser pane. Sem estoque → **troque o
produto** (e apague a imagem órfã).

### Gate 3 — TEXTO (aprovação)

Preencha os `[TODO]`s, gere os cartões OG (`npm run og`), rode `npm run build` para validar o
schema, e **apresente ao usuário**. Mantenha `draft: true`. **Pare e espere aprovação.**

⚠️ **Entregue o link do localhost de CADA artigo** (`http://localhost:4321/posts/<slug>/`) — o
usuário revisa no navegador, artigo por artigo, não no terminal. Suba o dev server antes.

#### Imagem no corpo — regra atual

**Coloque a imagem onde o produto é citado no texto**, junto do argumento que o justifica.

- ❌ **Não** use bloco rígido `## N. Produto` + imagem em todo produto: fica monótono e previsível.
- ✅ Nem todo produto precisa de seção numerada — só quando o texto comporta.
- ✅ Mas **todo produto citado no corpo leva a imagem ali**, não só no card do rodapé.

#### Coerência produto ↔ texto (as duas metades da mesma regra)

- **Citou como necessário, tem que vender.** Se o texto diz que algo é preciso ter (bico
  aplicador, fita crepe, chave de grifo, EPI), esse item **entra na lista de produtos com botão**.
- **O que a tese rejeita, sai da lista.** Se o post argumenta contra um item, ele **não pode**
  aparecer no frontmatter, na tabela comparativa nem no corpo — varra os **três** lugares.

#### Estrutura por tipo

- **Listicle (Top N):** intro (200-300 pal.) → "Como avaliamos" → `<ComparisonTable>` → produtos
  (imagem + 150-300 pal.: análise de fontes reais, 2-3 prós, 2-3 contras, veredicto,
  `<AffiliateButton>`) → "Como escolher" → FAQ. **2000-3000 pal.**
- **Comparativo (X vs Y):** intro → tabela lado a lado → análise de cada (300-400 pal.) → "em quais
  cenários cada um ganha" → veredicto por perfil. **1500-2500 pal.**
- **Review individual:** intro → specs → uso real (fontes) → prós/contras → 2-3 alternativas →
  veredicto. **1500-2500 pal.**
- **Passo a passo:** o problema → materiais e ferramentas (com `<AffiliateButton>`) → passo a passo
  numerado, com a fonte do procedimento → erros comuns → quando chamar profissional → FAQ.

⚠️ **Aprofunde o tema antes do produto.** Explique o problema e **por que** aquele produto resolve.
Post que vai direto para a vitrine parece caça-níquel.

### Gate final — LIBERAÇÃO (usuário)

Só **após o "ok" final**: confirme as `pubDate` futuras (mantendo `draft: true`), apague imagens
órfãs de produtos descartados nas correções, `git add -A`, commite e **dê push**. O push é o que
efetivamente agenda — o `publish-scheduled` (n8n) vira `draft:false` na data e hora.

```bash
git -C E:/Site pull --rebase --autostash
```

O repo local costuma estar atrás dos commits automáticos de publicação — rebase antes de commitar.

## Diretrizes de tom

- **Honesto**: sempre apontar pontos negativos reais quando existirem.
- **Técnico mas acessível**: explica termos sem jargão pesado.
- **Direto**: sem enrolação no começo.
- **Brasileiro**: "R$" e formatação brasileira.
- **Sem hipérbole**: evitar "incrível", "melhor de todos", "imperdível".
- **Não sugerir nem vincular redes sociais** — o usuário não quer perfis sociais nos sites.
- **Endosso pessoal ("indicação do Reforma Caseira", "o que usamos aqui") só entra quando o
  usuário autorizar explicitamente** — é a experiência dele, não do agente.

## Erros a evitar

- Pular um gate / commitar ou agendar sem aprovação.
- Inventar specs ou links; alegar execução que não houve.
- Não checar estoque; deixar produto sem imagem no corpo.
- Recomendar item que o próprio texto desaconselha.
- Título/descrição curtos demais; esquecer `pubDate`, `faq` ou `npm run og`.
- Usar UTM diferente de `reformacaseira` (o `AffiliateButton` já cuida).
