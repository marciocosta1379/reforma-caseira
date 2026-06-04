# n8n — Trigger de publicação (Opção B)

Substitui o cron (instável) do GitHub Actions. O n8n agenda às **07h BRT**, dispara o
workflow `publish-scheduled.yml` via `workflow_dispatch`, confere o resultado e, se o
deploy FTP falhar, **redispara 1x** e avisa no **Telegram**.

O build, commit e deploy FTP continuam rodando no GitHub Actions (nada na VPS precisa de
repo, Node ou credenciais FTP).

## Setup (uma vez)

### 1. Criar o PAT no GitHub
- GitHub → Settings → Developer settings → **Personal access tokens (classic)**
- Scopes: **`repo`** e **`workflow`**
- Copiar o token (`ghp_...`)

### 2. Credencial no n8n — GitHub
- Credentials → New → **Header Auth**
- Nome do header: `Authorization`
- Valor: `Bearer ghp_...` (cole o token com o prefixo `Bearer `)
- Salvar como **"GitHub PAT (Bearer)"**

### 3. Credencial no n8n — Telegram
- Crie um bot com o **@BotFather** → copie o token
- Credentials → New → **Telegram API** → cole o token → salve como **"Telegram Bot"**
- Descubra seu chat id: mande uma msg pro bot e acesse
  `https://api.telegram.org/bot<TOKEN>/getUpdates` → campo `chat.id`

### 4. Importar a workflow
- n8n → Import from File → `publish-trigger.workflow.json`
- Nos nós HTTP, selecione a credencial **"GitHub PAT (Bearer)"**
- No nó **Alertar no Telegram**, selecione a credencial e troque `REPLACE_CHAT_ID` pelo seu chat id
- Confirme o timezone da workflow = **America/Sao_Paulo** (Settings da workflow)
- **Ativar** a workflow

## Desligar o cron antigo (opcional)
Depois de validar o n8n, dá pra remover o bloco `schedule:` do
`.github/workflows/publish-scheduled.yml` (mantendo o `workflow_dispatch:`) pra não
ter duas execuções/dia. **Não remova** o `workflow_dispatch` — é o que o n8n chama.

## Testar agora
Na workflow, clique **Execute Workflow** (ou no nó schedule → Execute). Deve disparar
um run no GitHub Actions e, ~3 min depois, confirmar sucesso.

## ⚠️ Pegadinha do cron (rodava manual mas não sozinho)
O Schedule Trigger do n8n usa cron de **6 campos, começando por SEGUNDOS**:
`[Segundo] [Minuto] [Hora] [Dia] [Mês] [Dia da semana]`.

- ✅ Correto para 07:00 BRT: **`0 0 7 * * *`**
- ❌ Errado (cron Unix de 5 campos): `0 7 * * *` — o parser lê errado e o agendamento não dispara.

Se mexer no fluxo e o disparo automático parar: confira a expressão (6 campos), o
Timezone da workflow (`America/Sao_Paulo`) e **desative/reative** o toggle pra
re-registrar o agendamento. O "Execute Workflow" funciona mesmo inativo — não serve
como prova de que o agendamento está ok.
