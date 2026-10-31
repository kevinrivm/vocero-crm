> Fork em português do Brasil atualizado para o Vocero CRM **2.7.0**. Para usar as traduções deste fork, construa a imagem a partir deste código; a imagem oficial não contém estas alterações. O agente Nea usa versão independente (**2.0.2**).
> A base 2.7.0 inclui Aparência, Conta de mensagens do WhatsApp, importação de templates, fundo ilustrado e conexão oficial com Meta. Veja o [histórico completo](CHANGELOG.md) e a [configuração de idiomas](docs/idiomas.md).
> Ao atualizar da 2.5, aplique a migração oficial 0026 (`pnpm db:migrate` no desenvolvimento; automática no contêiner). O botão Conectar com Meta exige `META_APP_ID`, `META_EMBEDDED_CONFIG_ID` e `META_APP_SECRET`; sem essas variáveis, a conexão manual continua disponível. Veja o [guia oficial](docs/embedded-signup.md).

# Vocero CRM

[![CI](https://github.com/kevinrivm/vocero-crm/actions/workflows/ci.yml/badge.svg)](https://github.com/kevinrivm/vocero-crm/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**O CRM de WhatsApp open source para o seu agente de IA, com um Laboratório que o testa.**

Vocero é um CRM self-hosted e gratuito para negócios que vendem pelo WhatsApp:
caixa de entrada em tempo real, pipeline de vendas, o perfil e o conhecimento do
seu agente, e um **Laboratório** onde clientes simulados o avaliam antes de falar
com clientes reais. Uma instância = um negócio, no seu próprio servidor, com os
seus dados.

Vocero não traz agente: quem responde é o que você conecta ao lado.
[Nea](https://github.com/kevinrivm/nea-agent) (MIT) é o recomendado e sobe com o
mesmo `docker compose`; também é possível conectar o seu pelo
[contrato público](#-seu-agente-ao-lado-do-crm). Sem agente, o Vocero é um CRM
de caixa de entrada manual e você mesmo responde. O token de WhatsApp nunca sai
do CRM.

![Bandeja de Vocero CRM](docs/screenshots/bandeja.png)

<p align="center">
  <img src="docs/screenshots/laboratorio.png" width="49%" alt="Laboratório: relatório com score e achados" />
  <img src="docs/screenshots/pipeline.png" width="49%" alt="Pipeline kanban" />
</p>

> 🎬 **Vídeo-instalador oficial**: em breve no
> [canal do Kevin Belier](https://www.youtube.com/@KevinBelier)

## Para quem é?

- **Agências de IA/automação** que implementam CRM + agente para seus clientes:
  você faz o deploy de uma instância por cliente no VPS dele (o CRM e o Nea, ou
  o seu próprio agente), configura e entrega com evidência de qualidade (o
  relatório do Laboratório).
- **Negócios** que querem atender WhatsApp com IA sem entregar seus dados a um
  SaaS: tudo roda no seu servidor.

## Funcionalidades

### 🧪 Laboratório: o agente se testa sozinho

A peça central. Seis clientes simulados — o comprador decidido, o perguntão de
preços, o cliente irritado, o que pergunta o que você não sabe, o que exige um
humano e o que escreve "ke onda si benden pintura" — conversam contra o seu
agente REAL — o que você tem conectado: o CRM despacha para ele cada mensagem
simulada como se fosse de um cliente — em um **sandbox que nunca envia mensagens
reais**. Sem agente conectado, o Laboratório diz para conectar primeiro. Um juiz
LLM independente, com a chave de Ajustes → IA, avalia cada conversação e entrega:

- um **score 0–100** de quão preparado está o agente,
- **achados com evidências** (alucinações, lacunas do conhecimento, falhas de
  escalonamento, tom),
- **sugestões aplicáveis com um clique** ao knowledge base,
- e **histórico com delta**: rode de novo depois de cada mudança e veja se
  melhorou.

Pare de "torcer para o bot funcionar": meça.

### 💬 Caixa de entrada de WhatsApp em tempo real

Três colunas (conversas / thread / contato), mensagens recebidas em ≤2 segundos
sem recarregar, status enviado/entregue/lido, janela de 24 horas visível e
bloqueada corretamente (com envio de template aprovado quando está fechada),
respostas do agente marcadas como IA e handoff para humano com um clique. Os
anexos vão e vêm (imagem, áudio, vídeo, documento, localização e contato) com
prévia, e os arquivos ficam guardados no seu próprio servidor.

Se a conversa começou em um anúncio Click-to-WhatsApp, a caixa de entrada diz
qual foi: «Anúncio · título» na lista, um filtro «Anúncios», e no painel do
contato o criativo, o texto e o link do anúncio. Não pede flag nem credenciais:
o dado chega no mesmo webhook.

Em **Contatos** você pode **importar** uma lista que já tenha (um CSV com nome
e telefone com código de país): vê o que vai entrar antes de criar qualquer
coisa, não duplica ninguém e não enche seu pipeline. E pode marcar contatos
**«sem agente»** — ao importar ou um por um — para que seus clientes de sempre
sejam atendidos por você: as mensagens deles chegam à caixa de entrada e o
agente não responde.

Uma conversa pode ser **excluída** no painel do contato (visível para quem
administra o negócio): vão-se as mensagens, os anexos e o que o agente aprendeu
nela, e o contato fica na etapa dele, a menos que você peça para apagá-lo
também. Se a pessoa voltar a escrever, o agente começa do zero.

### 📊 Contatos e pipeline kanban

Cada pessoa que escreve é registrada sozinha e entra no pipeline (Novo → Em
conversa → Interessado → Cliente → Perdido, editável). Arraste cards, busque,
adicione notas, arquive.

### 🎯 Resultados

Uma tela para a reunião de segunda-feira: prospecos novos, negócios ganhos e
perdidos, dinheiro fechado e o funil dos que entraram, contra o período
anterior; se o agente responde, quão rápido e quando passa para um humano; de
qual origem e de qual **anúncio** chegam as conversas que terminam em venda
(com a miniatura do criativo), e o que está caindo hoje: leads em silêncio,
mensagens que não chegaram e janelas de 24 h prestes a fechar. Tudo sai dos
dados do próprio CRM: não pede para conectar nada, e o Laboratório não conta.
Não traz gasto publicitário nem ROI de anúncios, de propósito: esse dado não
vive no CRM. Com a agenda ligada, soma as consultas (realizadas, ausentes,
canceladas). Os dias são cortados no fuso horário da agenda; sem agenda
configurada, no de Cidade do México.

### 🤖 Seu agente, com SEU conhecimento

Na tela **Agente** você configura nome, tom, instruções e regras de escalonamento,
e dá conhecimento em pares pergunta/resposta e blocos livres. Tudo isso vive no
CRM e o agente lê de lá (`GET /api/bot/profile`): você edita em um único lugar.
A chave de IA também: você cola uma vez em Ajustes → IA e seu agente pensa
**através do CRM**, sem copiá-la para nenhum outro lugar.

O interruptor dessa tela decide se o CRM passa as conversas para o seu agente.
Só liga com um agente conectado e online; desligado, tudo fica na caixa de
entrada para o seu time.

### 🔌 Seu agente ao lado do CRM

Quem responde é um serviço à parte, no seu mesmo servidor:
[Nea](https://github.com/kevinrivm/nea-agent) (MIT; entende áudio, imagem e PDF,
escala para humano, agenda e faz follow-up) ou um cérebro seu. Conecta-se com
uma `BOT_API_KEY` pela API de serviço: seu agente conversa através do CRM, então
**o token de WhatsApp nunca sai daqui** e tudo fica na caixa de entrada como
qualquer outra conversa.

Com docker compose, o par sobe junto (a receita completa, com Coolify, está em
[`docs/migrar-a-2.0.md`](docs/migrar-a-2.0.md#el-par-crm--nea)):

```bash
# no seu .env: BOT_API_KEY, BRAIN_DISPATCH_URL=http://nea:8000/vocero/dispatch
# e BRAIN_HEALTH_URL=http://nea:8000/health
docker compose up -d
```

Enquanto a imagem 2.0 do Nea é publicada, o serviço fica atrás do perfil `nea`;
com o fechamento da 2.0 ele sobe sempre.

| Endpoint | Para quê |
|---|---|
| `GET /api/bot/context` | Quem é a pessoa, a etapa dela, se um humano assumiu a conversa e se a janela de 24 h continua aberta. Com a agenda ligada, também as consultas (`booking`): a próxima, a que já passou sem fechar e a última que fechou (cancelada, ausente ou realizada) |
| `POST /api/bot/messages` | Responder. Sai pelo mesmo caminho do composer e fica marcado como IA |
| `GET /api/bot/profile` | O perfil do agente e o knowledge base que você editou na app; em `llm`, por onde pensar e com qual modelo (`null` sem IA configurada) |
| `POST /api/bot/llm/{route}` | Pensar com a chave de Ajustes → IA. Compatível com OpenAI: aponte o `base_url` do seu SDK para aqui. Aceita `X-API-Key` ou `Authorization: Bearer`. Sem IA configurada, 402 `sin_credencial` |
| `PUT /api/bot/ficha` | Guardar o que o bot descobre do lead (chaves livres: cada negócio qualifica do seu jeito) |
| `POST /api/bot/stage` | Avançar o lead no pipeline: só para frente e para etapas abertas (as que o contexto traz em `lead.nextStages`). Ganhar ou perder um negócio é decisão de uma pessoa. Desliga-se na tela Agente («Mover de etapa») |
| `POST /api/bot/handoff` | Devolver a conversa a um humano |
| `POST /api/bot/typing` | Marcar como lido e mostrar "digitando…" |
| `GET /api/bot/media/{id}` | Baixar um anexo recebido sem tocar na Meta |
| `POST /api/bot/reset` | Reiniciar uma conversa de testes |
| `GET /api/bot/availability` | Com a agenda ligada: os horários para oferecer, que ficam registrados como oferecidos. Com `date=AAAA-MM-DD`, todos os horários livres desse dia; `query` diz até onde foi consultado |
| `POST` · `PATCH /api/bot/bookings` | Com a agenda ligada: reservar (201) ou mover (200) uma consulta, apenas em um horário que foi oferecido |

O contrato completo, com o dispatch e o aviso de esquecimento, está em
[`docs/openapi.json`](docs/openapi.json) (OpenAPI 3.1) e sua instância o serve
em `GET /api/bot/openapi.json`. Se vem da 1.x, o guia é
[`docs/migrar-a-2.0.md`](docs/migrar-a-2.0.md).

Os 409 vêm tipados (`ai_paused`, `window_closed`, `sandbox_violation`,
`message_limit`) para o seu bot saber quando se calar, mandar template ou
desistir. `message_limit` significa que o canal não aceita mais mensagens até
que o cliente escreva de novo (hoje, o teto de 10 do TikTok): não tente
novamente. O roteiro de testes está em
[`tests/e2e/us-bot-api.md`](tests/e2e/us-bot-api.md).

A API primeiro confere a chave e depois conta: com a chave válida cabem 1200
chamadas por minuto; sem chave ou com uma inválida, 30 por minuto do mesmo IP
respondem `401` e as seguintes `429` («Tentativas demais»). Quem inundar a API
sem chave não deixa o seu bot sem serviço.

**O CRM passa cada turno ao seu agente (o dispatch).** Seu agente não precisa
receber o webhook da Meta: com `BRAIN_DISPATCH_URL` (p. ex.
`http://nea:8000/vocero/dispatch`), a mesma `BOT_API_KEY` e o interruptor da
tela Agente ligado, a mensagem entra primeiro na caixa de entrada e o CRM faz ao
seu agente um `POST` assinado com o que o cliente escreveu desde a última
resposta, junto, depois de esperar o fim da sua rajada. Seu agente responde por
`POST /api/bot/messages`. É igual para WhatsApp, Instagram, Messenger e TikTok,
e não há segredo da Meta para copiar nem fila de reenvio para vigiar. Se seu
agente não recebe o turno (três tentativas), a conversa fica com uma pessoa e a
mensagem segue na caixa de entrada. O contrato do evento e da assinatura está em
[`specs/021-despacho-estandar/contracts/despacho.md`](specs/021-despacho-estandar/contracts/despacho.md)
e seu roteiro em [`tests/e2e/us-despacho.md`](tests/e2e/us-despacho.md).

Se o seu bot recebe os webhooks da Meta por um **override de callback da WABA**,
salvar a conexão em Configuração → WhatsApp (ou rotacionar o token) o respeita:
Vocero vê o override em `GET /{WABA}/subscribed_apps`, não re-assina a app — que
é exatamente o que o apagaria — e também não registra o próprio webhook no
número, porque este teria prioridade e deixaria seu bot surdo. A tela diz a qual
host o override está apontando e, se quiser que as mensagens voltem ao CRM (por
exemplo, ao migrar do Nea 1.x para o dispatch), oferece **Recuperar o webhook**:
remove esse override e deixa o do número aqui.

**Seu agente pensa pelo CRM.** `POST /api/bot/llm/{route}` repassa a chamada tal
qual ao provedor de Ajustes → IA com a chave guardada e devolve a resposta dele.
A chave não viaja ao seu agente: se o servidor do seu agente vazar, ela não
vaza junto. Se o provedor a rejeitar (401) ou ficar sem saldo (402), ela pausa
em Ajustes → IA e a tela avisa, igual a quando falha no CRM. O Nea o usa só
quando você não definir `LLM_API_KEY`; com ela, pensa com o próprio provedor.

Acima da tela **Agente**, o card **«Quem responde aos seus clientes»** diz se
há um agente conectado: a última chamada dele à API, para quem se despacha,
quando chegou o último turno e se algum não chegou, e — com
`BRAIN_HEALTH_URL`, p. ex. `http://nea:8000/health` — se está online, sua
versão e seu modo. Sem agente, avisa que o Vocero funciona como caixa de
entrada manual (é um aviso, não um erro). Com o agente conectado e o
interruptor desligado, avisa que ninguém está respondendo.

### 📅 Agenda com vagas reais (opcional, desligada por padrão)

Ligue com `AGENDA=on` e o CRM sabe quando você está livre: define seu horário
em Ajustes → Agenda e seu agente oferece vagas concretas, reserva a que o
cliente escolher e deixa registrada junto à conversa dele. Duas garantias que
não se negociam: **só se reserva um horário que foi oferecido** (nada de o
modelo inventar uma terça às 10) e **nunca se confirma uma consulta que não foi
criada** — se a vaga se ocupou no meio da conversa, a resposta traz alternativas
atualizadas em vez de uma promessa falsa.

As consultas aparecem na aba **Consultas** como um calendário: Dia, Semana,
Mês e Lista, sempre no fuso horário do negócio mesmo abrindo o CRM de outro
lugar. Toca numa consulta e no painel dela você abre a conversa, reagenda,
marca realizada ou «não compareceu», ou cancela; toca numa vaga vazia da grade
e bloqueia aquele horário.

Como a reunião é entregue, você escolhe com um **conector**:

| Conector | O que faz | Precisa de |
|---|---|---|
| **Link fixo** (padrão) | Distribui sua sala de sempre | Nada |
| **Zoom** | Uma reunião por consulta; mover move, cancelar apaga | Sua app Server-to-Server |
| **Google Calendar + Meet** | Um evento no seu calendário com link de Meet | Sua app do Google Cloud |

Usa outra coisa? O contrato são quatro operações e está publicado: escreva seu
conector no seu fork seguindo
[`docs/agenda-conectores.md`](docs/agenda-conectores.md). E se o seu provedor
cair, a consulta **é agenciada igual** com o link pendente de tentativa nova:
um terceiro caído não custa a conversão.

### 📈 Conversões de anúncios (opcional, desligada por padrão)

Se você anuncia com **Click-to-WhatsApp**, a Meta sabe quais conversas começaram
de um anúncio, mas não quais funcionaram: sem ninguém para contar, ela otimiza
para o público mais barato de fazer escrever, que raramente é o que compra.

Ligue com `ATRIBUCION=on`, cole seu dataset em Ajustes → Anúncios (o token é
reaproveitado da sua conexão de WhatsApp) e diga qual etapa do SEU pipeline
significa "lead qualificado". A partir daí o CRM reporta à Meta o lead
qualificado e a venda fechada — com o valor — pela **Conversions API**, e uma
tabela de atividade diz o que foi enviado, com qual acuse de recibo e, quando
não saiu, por quê.

Não se pede nada ao usuário que o CRM já não saiba: a venda pende da etapa
ganha que você já tem, e tudo dispara da mesma porta que move leads, então o
relatório é igual não importa quem arraste o card. Se a Meta cair, o lead é
movido igual: uma conversão jamais vale um movimento bloqueado. As pegadinhas
da Meta que custam descobrir estão só em
[`docs/atribucion-capi.md`](docs/atribucion-capi.md).

O que **não** precisa da flag: saber de qual anúncio chegou cada conversa. A
caixa de entrada marca («Anúncio · título», com filtro) e o painel do contato e
a gaveta do negócio mostram o criativo, o texto e o link do anúncio, em
qualquer instância que receba um clique de anúncio.

### 🎨 Sua marca, no claro e no escuro

Em Configuração → Marca você põe no CRM o nome do negócio, a cor e o logo; o
logo aparece na barra lateral, no login e na aba do navegador. A barra lateral
é azul-marinho nos dois temas, e cada um escolhe claro ou escuro no navegador.
No escuro, a página, a barra e o que flutua por cima se distinguem, e o texto
passa contraste AA. Com uma cor própria, os tons derivados e a tinta dos botões
são calculados sozinhos para serem legíveis.

### 📄 Templates · 👥 Multiusuário · 🔐 Self-hosted

Templates com várias variáveis `{{1}}…{{n}}` e aprovação da Meta sincronizada;
contas de time criadas pelo proprietário (o registro público fecha após a
primeira organização); token de WhatsApp cifrado em repouso (AES-256-GCM),
webhook autenticado em duas camadas e zero dependências de runtime além da
Meta e do seu provedor LLM opcional.

## Requisitos

- Um VPS com Docker (2 GB de RAM bastam para rodar a imagem publicada) — com
  ou sem [Coolify](https://coolify.io). A imagem é `linux/amd64`; num VPS ARM
  você compila a partir do código, o que leva alguns minutos e pede mais
  memória.
- Um domínio apontando para o VPS (a Meta exige **https** para webhooks).
- Um número de WhatsApp na Cloud API da Meta (ver
  [Conexão](#conexão-do-número-de-whatsapp)).
- Opcional: uma API key do [OpenRouter](https://openrouter.ai) (ou qualquer
  provedor compatível) para o seu agente e o juiz do Laboratório.
- Opcional: um agente ao lado do CRM ([Nea](https://github.com/kevinrivm/nea-agent)
  ou outro). Sem ele, o Vocero funciona como caixa de entrada manual.

## Instalação (~15 minutos)

Cada versão é publicada como imagem Docker:
`ghcr.io/kevinrivm/vocero-crm:<versão>` (p. ex. `2.7.0`). Instalar a partir da
imagem é o caminho recomendado: seu servidor baixa a imagem em vez de
compilá-la. Compilar do código continua funcionando, e é o que você precisa num
VPS ARM ou se o seu fork muda o código.

### 0. Aponte seu domínio

Crie um registro **A** de `crm.seudominio.com` para o IP do VPS e espere
resolver.

### Rota A — Coolify guiado por IA (recomendada)

Abra seu assistente de IA (p. ex. Claude Code com o MCP do Coolify), passe o
arquivo [`INSTALL-IA.md`](INSTALL-IA.md) e responda 3 perguntas (domínio, token
do OpenRouter opcional, caminho). O assistente cria o banco de dados e uma app
do tipo «Docker Image» com a imagem da versão, monta nela o volume `/data`,
gera os segredos e verifica o healthcheck. O mesmo guia traz a variante que
compila a partir do repositório.

### Rota B — docker compose

```bash
git clone https://github.com/kevinrivm/vocero-crm.git vocero && cd vocero
pnpm install && pnpm init-env --domain crm.seudominio.com   # cria .env com os segredos já gerados
pnpm doctor                                                 # confere o .env antes de subir
docker compose up -d
```

`pnpm init-env` cria o `.env` a partir de `.env.example` com todos os segredos
gerados (nunca sobrescreve um existente); sem `--domain` deixa
`DOMAIN=localhost` para testar na mesma máquina. Precisa de Node 22 e pnpm
(`corepack enable`); sem eles no VPS, `cp .env.example .env` e preencha à mão
(cada variável traz seu comando `openssl`). `pnpm doctor` valida as variáveis
com o mesmo esquema do arranque, testa o banco de dados, o diretório de anexos
e, se já houver um número conectado, o token de WhatsApp: cada ✗ sai com o
comando que a conserta, e nunca imprime um segredo.

`docker-compose.yml` declara as duas coisas: a imagem publicada (`image`) e o
código (`build: .`). Sem `pull_policy`, a
[especificação do Compose](https://docs.docker.com/reference/compose-file/build/#using-build-and-image)
diz o que acontece: tenta primeiro baixar a imagem e só compila a partir do
código se não a encontrar nem no registro nem na sua máquina. Então:

- `docker compose up -d` roda a imagem publicada da versão fixada no compose.
  Para outra versão publicada, `VOCERO_CRM_VERSION=X.Y.Z` no seu `.env`.
- `docker compose up -d --build` compila a partir da sua cópia do código. É o
  que você precisa num VPS ARM e num fork com mudanças próprias; no fork, use
  sempre: o que você compila fica com o mesmo nome de imagem, e sem `--build` o
  Compose pode rodar a oficial em vez das suas mudanças.

O Caddy emite o certificado HTTPS sozinho. Verifique com
`https://crm.seudominio.com/api/health` → `{"ok":true,"version":"2.7.0",…}`.

### Outras plataformas: Render, Fly e Railway

Há um manifest por plataforma na raiz do repo. Os três rodam a mesma imagem
publicada, montam `/data` e monitoram `/api/health`; cada um declara o que a
plataforma permite declarar e documenta, em comentários, o que fica de mão. A
imagem vem fixada à versão (um teste o exige). Verifique igual ao de cima:
`curl -s https://<sua-url>/api/health` →
`{"ok":true,"version":"2.7.0",…,"mediaWritable":true}`.

**Render** — [`render.yaml`](render.yaml) é um Blueprint completo: serviço web
a partir da imagem, Postgres gerenciado, disco de 1 GB em `/data`, healthcheck
e variáveis obrigatórias; `BETTER_AUTH_SECRET` e `ENCRYPTION_KEY` são geradas
pelo Render (256 bits em base64: exatamente os 32 bytes que a chave pede) e
`APP_BASE_URL` sai da URL `.onrender.com` do serviço. Aplica-se com **New →
Blueprint** sobre o seu fork ou com o botão abaixo. Fica de mão:
`META_WEBHOOK_VERIFY_TOKEN` quando o Render pedir (`openssl rand -hex 32`: o
Render gera base64, com `/`, e o token é um segmento da URL do webhook), o
token do OpenRouter e, com domínio próprio, `APP_BASE_URL`. O disco exige plano
pago (`starter` + `basic-256mb`; o plano `free` expira em 30 dias).

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/kevinrivm/vocero-crm)

**Fly.io** — [`fly.toml`](fly.toml) declara imagem, volume `/data`, porta
3000, healthcheck, tamanho da máquina e as variáveis não secretas; o Fly não
deixa pôr no arquivo nem segredos nem o banco. Fica de mão, uma vez, com os
comandos exatos escritos no próprio `fly.toml`: `fly apps create`,
`fly volumes create`, `fly postgres create` + `fly postgres attach` (deixa a
`DATABASE_URL`), `fly secrets set` com os três segredos e
`fly deploy --ha=false`. Esse Postgres é o não gerenciado (barato; o Fly já não
o mantém): o gerenciado é `fly mpg create` + `fly mpg attach`. A máquina não
desliga sozinha de propósito: o dispatch ao seu agente e o Laboratório rodam
dentro do processo.

**Railway** — [`railway.toml`](railway.toml) só pode declarar o build
(Dockerfile), o healthcheck e a política de reinício; o banco, o volume, o
domínio e as variáveis são criados pela CLI, com os comandos exatos escritos no
próprio arquivo (`railway add --database postgres`,
`railway volume add --mount-path /data`, `railway domain --port 3000`,
`railway variable set …`, `railway up`). Para a imagem publicada sem build:
`railway add --image ghcr.io/kevinrivm/vocero-crm:2.7.0`, e então o healthcheck
é fixado no painel. O Railway declarou obsoleto esse formato em favor do seu
Infrastructure as Code (`.railway/railway.ts`); continua lendo-o até
2026-12-01.

### Anexos em um bucket (opcional)

Por padrão, os anexos, o logo e o ícone vivem no volume de `/data`. Se sua
plataforma não tem disco persistente, ou se prefere guardá-los à parte, mande
para um bucket S3-compatible **seu** com `MEDIA_STORE=bucket` e as
`MEDIA_BUCKET_*` (guia em [`.env.example`](.env.example)):

- **MinIO no mesmo servidor**: `docker compose --profile bucket up -d` sobe o
  MinIO e cria o bucket; `MEDIA_BUCKET_ENDPOINT=http://minio:9000`.
- **R2, S3, Backblaze, Tigris…**: o endpoint, a região e uma chave com
  permissão de escrita no bucket.

O que chega de novo vai ao bucket e o que já estava no volume continua sendo
lido de lá: não é preciso migrar nada, e tirar a flag não deixa nada ilegível.
Se o bucket recusar uma escrita, o arquivo é guardado no volume (não se perde)
e `/api/health` (`mediaWritable: false`) e `pnpm doctor` avisam. O Vocero
assina as requisições ele mesmo: não traz o SDK da AWS.

Vercel e similares continuam de fora: com o bucket já não dependem do disco,
mas restam o trabalho em segundo plano (o dispatch, o Laboratório), o SSE em
memória e as migrações no arranque.

### Atualizar

Antes, leia em [`CHANGELOG.md`](CHANGELOG.md) a seção «Atualizar desde…» (ou
“Updating from…”) da versão nova. Com docker compose: `git pull` e
`docker compose up -d` (com `--build` se o seu fork tem mudanças próprias). No
Coolify: mude a tag da imagem para a versão nova e faça o redeploy; se compila
a partir do repositório, redeploy. Com os manifests: mude a tag da imagem no
arquivo (Render sincroniza o Blueprint; Fly, `fly deploy`; Railway compila a
partir do código: `git pull` e `railway up`). As migrações rodam sozinhas no
arranque.

### Primeiro arranque

1. Entre e **registre-se**: o primeiro registro cria sua organização e fecha o
   registro público.
2. A primeira coisa que você vê é o **Guia de início**: configure o agente,
   vincule seu provedor de IA, conecte seu número de WhatsApp e, opcional,
   **conecte seu agente** (Nea ou outro; o endereço dele vai nas variáveis de
   ambiente, o passo leva à receita e se marca sozinho quando o agente responde
   ao `/health`). Com a agenda ligada (`AGENDA=on`), mais um para seus
   horários. Cada botão leva à tela que toca e, ao voltar, você vê seu
   progresso; cada passo se marca só quando a peça realmente funciona. Com um
   agente conectado aparece **Ligar**: até lá ninguém responde aos clientes, e
   as mensagens que chegarem você atende da Caixa de entrada. Sem agente, o
   guia avisa que o Vocero funciona como caixa de entrada manual.
3. Enquanto faltar um passo — ou houver um agente conectado e ele seguir
   desligado —, entrar na app leva ao guia (ele também está no menu, só para o
   proprietário). Se não conectar agente, com os demais passos prontos você
   entra direto na Caixa de entrada. O guia não prende ninguém: pelo menu você
   vai a qualquer tela a qualquer momento.
4. Opcional: na Caixa de entrada, toque **"Carregar dados de demonstração"**
   para explorar com a **Ferretería El Martillo** (contatos, conversas,
   pipeline, um knowledge base com lacunas de propósito e uma rodada de
   Laboratório de exemplo — rode o Laboratório e veja como elas são
   encontradas). A demo deixa o agente configurado (passo 1 pronto); a chave de
   IA e o número continuam sendo seus.

## Conexão do número de WhatsApp

O Vocero **consome** um token da WhatsApp Cloud API — não implementa o Embedded
Signup. Há duas formas de obtê-lo:

### Modo direto (o negócio tem sua própria app da Meta)

1. Crie uma app em [developers.facebook.com](https://developers.facebook.com)
   com o produto WhatsApp e vincule seu número.
2. Crie um **usuário de sistema** (Business Settings → System users) com acesso
   à WABA e gere um token permanente com permissões
   `whatsapp_business_messaging` e `whatsapp_business_management`.
3. No Vocero: **Configuração → WhatsApp** → cole WABA ID + Phone Number ID +
   token → **Testar conexão** → Salvar. Ao salvar, o Vocero **registra o
   webhook na Meta para você** (override no nível do número, com handshake
   incluído) e confirma na tela. Se a Meta recusar, a conexão fica salva
   igual, o aviso diz por quê (quase sempre o token não tem
   `whatsapp_business_management`) e o botão **«Registrar na Meta»** do card do
   webhook tenta de novo sem precisar colar o token outra vez.
4. Só se a sua app ainda não tiver nenhum webhook configurado (o Vocero
   avisa): no painel da Meta (WhatsApp → Configuration → Webhook) cole a **URL
   do webhook** e o **verify token** que o Vocero mostra, e assine o campo
   `messages` (e `message_template_status_update` se usará templates). É uma
   única vez por app.
5. Recomendado: adicione `META_APP_SECRET` (App Secret da sua app) às variáveis
   da instância para a verificação de assinatura de cada evento.

### Modo agência (Tech Provider) — para agências

Sua plataforma de agência já faz o Embedded Signup e guarda os tokens dos seus
clientes; a instância de Vocero do cliente só recebe o token dele. O webhook do
cliente conecta com o **override de callback por WABA**:

```text
   Meta (WABA do cliente)
        │  webhooks (override_callback_uri)
        ▼
   ┌────────────────────────────┐      ┌─────────────────────────────┐
   │  Instância Vocero          │      │  Backend da SUA agência     │
   │  (VPS do cliente)          │      │  (Embedded Signup + tokens) │
   │  /api/webhooks/wa/<token>  │      └──────────────┬──────────────┘
   └────────────▲───────────────┘                     │
                └────── token do cliente ─────────────┘
                        (colado no wizard)
```

**Checklist de 5 passos (a ordem importa):**

1. **Faça o deploy da instância primeiro** (Rota A ou B) — o webhook precisa
   estar online para o handshake do passo 3.
2. **Embedded Signup na SUA plataforma**: o cliente conecta o número dele no
   seu onboarding e seu backend guarda o token dele (troca de código → token).
3. **Cole as credenciais no wizard** da instância (WABA ID, Phone Number ID,
   token) → **Testar conexão** → **SALVAR**. Ao salvar, o Vocero **registra o
   override de callback no nível do número** para a própria instância (e o
   webhook encaminha cada mensagem pelo Phone Number ID guardado). Se seu
   backend já encaminha essa WABA para outro lugar, o Vocero respeita e não
   registra a do número.
4. **Só se preferir encaminhar pelo seu backend** (ou se o registro automático
   falhou), configure o override de callback no nível da WABA para a instância:

   ```http
   POST https://graph.facebook.com/v25.0/{WABA_ID_DO_CLIENTE}/subscribed_apps
   Authorization: Bearer {TOKEN_DO_CLIENTE}
   Content-Type: application/json

   {
     "override_callback_uri": "https://crm.cliente.com/api/webhooks/wa/{VERIFY_TOKEN}",
     "verify_token": "{VERIFY_TOKEN}"
   }
   ```

   A URL e o verify token exatos estão em **Configuração → WhatsApp** da
   instância. A Meta faz o handshake naquele momento (a URI precisa responder,
   senão devolve 422). Salvar a conexão de novo depois (p. ex. ao rotacionar o
   token) respeita esse override: o Vocero não re-assina uma WABA que já o tem.
5. **Registre o número** na Cloud API se ainda não estiver registrado
   (`POST /{PHONE_NUMBER_ID}/register`) e mande uma mensagem de teste para o
   número: deve aparecer na caixa de entrada em um ou dois segundos. As
   mensagens do cliente chegam direto à instância DELE, não ao seu backend.

> ⚠️ **Segurança**: a URL do webhook contém o verify token como segmento
> secreto — trate-a como uma senha (não publique nem mande por canais
> inseguros). No modo direto você pode adicionar a camada extra de assinatura
> com `META_APP_SECRET`.
>
> ℹ️ **Limitação conhecida da Meta**: os eventos de status de TEMPLATES
> (`message_template_status_update`) não seguem o override de callback — vão
> para a app dona. Por isso o Vocero também **sincroniza templates pela API de
> Graph** (botão "Sincronizar" em Configuração → Templates), assim o modo
> agência vê as aprovações igual.

## Canais opcionais: Instagram, Messenger e TikTok

WhatsApp é o canal pelo qual o Vocero existe e está sempre ligado. Os demais
viajam no mesmo código, **desligados por padrão**
([ADR-001](docs/adr-001-canales-opcionales.md)): uma instância que não os usa
não vê telas, webhooks nem variáveis deles. Ligam-se com uma variável de
deploy:

```bash
CHANNELS=whatsapp,instagram,messenger,tiktok   # os que quiser; whatsapp sempre vai
```

Com mais de um canal ligado, a Caixa de entrada mostra o distintivo de cada
conversa e permite filtrar por canal. O contato, o pipeline, a ficha e o agente
são os mesmos: um lead é um lead, escreva por onde escrever.

Seu agente escreve igual para todos os canais e o Vocero adapta na saída: no
Instagram, Messenger e TikTok, que não desenham os negritos do WhatsApp, o
texto dele chega sem asteriscos, com bullets e os links legíveis.

**Configuração → Estado** reúne todos os canais ligados: se estão conectados,
quando chegou a última mensagem de um cliente e, para os que chegam via
Zernio, como estão a conta e o webhook. É o primeiro lugar para olhar quando
«não chegam as mensagens».

### Conectar via Zernio (Instagram, Messenger ou TikTok)

[Zernio](https://zernio.com) é uma API unificada: você vincula lá suas redes,
com a sua própria conta, e uma única chave entrega todas. No Vocero é igual
para os três canais:

1. No Zernio vincule a rede (**Accounts → Connect**) e crie uma API key
   (**Settings → API Keys**; começa com `sk_` e é mostrada uma única vez).
2. No Vocero abra a tela do canal, escolha *Zernio*, cole a chave e toque
   **Testar e conectar**. Só o proprietário pode fazer isso.

Não é preciso copiar nenhum id nem dar de alta nada a mais no Zernio:

- **A conta o Vocero encontra** com essa chave. Se a chave tem várias contas
  daquela rede (uma agência), ele as oferece para escolher.
- **O webhook é dado de alta pelo Vocero** no seu Zernio, com o evento
  `message.received`, um segredo de assinatura que ele gera e **limitado às
  suas contas conectadas**. Um webhook do Zernio sem esse limite recebe as
  mensagens de todas as contas da chave. Os demais webhooks que você tiver no
  Zernio não são tocados.
- Se um dia o webhook for desativado ou faltar uma conta, **Configuração →
  Estado** avisa e repara com um botão.

Cada entrega é verificada com a assinatura do Zernio. Se você atualiza de uma
versão anterior e já tinha o webhook criado à mão, ele continua funcionando:
ao abrir **Estado** você verá se falta algo.

### Messenger (página do Facebook)

Duas formas de trazer as mensagens; escolhe-se em **Configuração → Messenger**.

**Com Zernio**: siga [Conectar via Zernio](#conectar-via-zernio-instagram-messenger-ou-tiktok)
a partir de **Configuração → Messenger**. A página e o nome dela saem do
Zernio.

**Com uma app própria da Meta**:

1. Em [developers.facebook.com](https://developers.facebook.com) crie (ou use)
   uma app com o produto **Messenger** e gere o **token de acesso da página**
   com a permissão `pages_messaging`. Anote o **ID da página**.
2. No Vocero, **Configuração → Messenger**: escolha *App própria da Meta*,
   cole o ID e o token e toque *Testar e salvar*.
3. Na app da Meta, **Messenger → Webhooks**: objeto `page`, campo `messages`,
   essa URL de callback e o token de verificação que a tela mostra. Assine a
   página na app.

Daí em diante, o que as pessoas escrevem para a página entra na caixa de
entrada como `Messenger`, com o nome do perfil, e o que você responder do
Vocero (você ou o agente) chega ao chat dela. Não há templates: 24 horas após a
última mensagem do cliente só uma pessoa pode responder, por até 7 dias (sai
com a etiqueta `HUMAN_AGENT` da Meta); a caixa de entrada avisa e diz quanto
falta. O agente não responde fora das 24 horas.
Hoje o canal é de texto: os anexos que mandarem aparecem como «📎 Imagem» para
você saber que chegaram, e os anexos de saída não existem.

Com app própria e sem App Review, a página só recebe mensagens de contas com
um papel na app; para atender o público é preciso aprovar `pages_messaging`.
Pelo Zernio esse trâmite já está resolvido do lado deles.

### Instagram (DMs do perfil profissional)

Duas formas de trazer as mensagens; escolhe-se em **Configuração → Instagram**.
A conta precisa ser profissional (de empresa ou criador). Não precisa de uma
página do Facebook vinculada: isso só o Messenger pede.

**Com Zernio**: siga [Conectar via Zernio](#conectar-via-zernio-instagram-messenger-ou-tiktok).

**Com uma app própria da Meta**:

1. Em [developers.facebook.com](https://developers.facebook.com) crie (ou use)
   uma app com o produto **Instagram** e gere o token da conta com as
   permissões `instagram_business_basic` e
   `instagram_business_manage_messages`. Anote o **ID da conta**.
2. No Vocero, **Configuração → Instagram**: escolha *App própria da Meta*,
   cole o ID e o token e toque *Testar e salvar*.
3. Na app da Meta, **Instagram → Webhooks**: objeto `instagram`, campo
   `messages`, com a URL de callback e o token de verificação que a tela
   mostra.

Entram na caixa de entrada as mensagens diretas; os comentários das
publicações, não. Não há templates: 24 horas após a última mensagem do cliente
só uma pessoa pode responder, por até 7 dias (etiqueta `HUMAN_AGENT`); o
agente, não. Sem App Review, uma app própria só recebe mensagens de perfis com
um papel na app. O detalhe do canal está em
[`specs/014-canal-instagram`](specs/014-canal-instagram/spec.md).

### TikTok (mensagens diretas de uma conta de negócio)

O TikTok não entrega mensagens a uma app própria: elas chegam por
[Zernio](https://zernio.com), com a sua conta do Zernio.

Siga [Conectar via Zernio](#conectar-via-zernio-instagram-messenger-ou-tiktok)
a partir de **Configuração → TikTok**. Se a conta for pessoal, o Vocero a
conecta mas avisa ali mesmo e no **Estado**: o TikTok não entrega mensagens
até ela virar Business.

O que o TikTok impõe — e o Vocero conta antes de você descobrir com uma
mensagem rejeitada:

- A conta precisa ser **TikTok Business**, registrada fora da União Europeia,
  Suíça e Reino Unido, com as mensagens diretas abertas.
- **Você não inicia**: só responde a quem te escreveu.
- Após a última mensagem do cliente você pode mandar **até 10 mensagens, em 48
  horas**. Não há template que reabra: a décima primeira é rejeitada (409
  `message_limit`) até o cliente escrever de novo.
- Cada mensagem é texto, de até 6.000 caracteres. As imagens entram (como
  aviso de que chegou uma), mas ainda não são enviadas pelo Vocero.

O detalhe está em [`specs/022-canal-tiktok`](specs/022-canal-tiktok/spec.md).

## Configuração da IA

Com essa chave pensa o seu agente (através do CRM, por `/api/bot/llm`) e o juiz
do Laboratório. Definida uma vez, na app: em **Ajustes → IA** você escolhe o
provedor (OpenRouter, ou qualquer API compatível com a da OpenAI com o seu base
URL), o modelo e cola a sua chave. «Testar conexão» faz uma chamada mínima com
o que foi escrito antes de salvar, «Trazer modelos» lista os do provedor, e a
ajuda dobrável explica onde conseguir a chave. É guardada cifrada
(AES-256-GCM, a mesma `ENCRYPTION_KEY` que protege o token de WhatsApp) e a
tela só mostra os últimos 4.

Se o provedor rejeitar a chave (401) ou a conta ficar sem saldo (402), a chave
pausa sozinha, um banner avisa na app inteira e Ajustes → IA explica qual das
duas coisas aconteceu. Salvar uma chave nova — ou «Testar conexão» com a
guardada depois de recarregar — a reativa. Um 429 ou um 500 do provedor não
pausa nada: são soluços, não problemas da chave.

As variáveis de ambiente continuam valendo como respaldo (instalações
automatizadas, ou quem já as tinha): usadas enquanto não houver nada guardado
em Ajustes → IA, e o que estiver guardado manda sobre elas.

```bash
OPENROUTER_API_TOKEN=sk-or-...        # respaldo: sua key
OPENROUTER_MODEL=anthropic/claude-sonnet-4.5
OPENROUTER_JUDGE_MODEL=               # opcional: modelo distinto para o juiz do Laboratório
OPENROUTER_BASE_URL=https://openrouter.ai/api   # ou seu provedor OpenAI-compatible
```

Sem provedor, todo o resto funciona; Agente e Laboratório linkam para Ajustes →
IA. Depois configure o comportamento e o conhecimento na aba **Agente**,
conecte seu agente e rode o **Laboratório** antes de ligá-lo com clientes
reais.

## Conformidade com as políticas da Meta

1. **Opt-in**: escreva só para pessoas que iniciaram a conversa ou aceitaram
   receber mensagens; o Vocero respeita a janela de 24 h e bloqueia o texto
   livre fora dela.
2. **Templates aprovados** para reabrir conversas: nada de truques para saltar
   a aprovação da Meta.
3. **O Laboratório é 100% interno**: os clientes simulados nunca tocam a API de
   WhatsApp (bloqueado por design e verificado com testes).
4. **Sem spam nem broadcast**: o Vocero não inclui envios em massa; use-o para
   conversas reais de venda e suporte.
5. **Dados do cliente no servidor dele**: cada negócio hospeda sua instância; o
   token fica cifrado em repouso e os webhooks são validados por URL secreta e
   assinatura opcional.

## FAQ de erros comuns

**O webhook não verifica na Meta** — O domínio ainda não resolve, não é https,
ou o token não tem `whatsapp_business_management`: o aviso ao salvar traz o
motivo tal como a Meta o deu. Corrija e toque **«Registrar na Meta»** em
Configuração → WhatsApp. Se colar à mão, copie-os exatos dessa mesma tela.

**O webhook verificou bem, mas não chegam mensagens** — Quase sempre: a conexão
não está SALVA no wizard (o handshake não a precisa, a ingestão sim — encaminha
pelo Phone Number ID guardado). Entre em Configuração → WhatsApp, salve a
conexão e reenvie uma mensagem. Os logs da instância mostram um aviso com o
Phone Number ID desconhecido.

**Chegam mensagens, mas não saem** — Confira o estado da conexão em
Configuração → WhatsApp. Se disser "reconectar", o token expirou: cole um novo.
No modo direto use um token de usuário de sistema (não expira).

**Erro 131030 ao enviar** — O número de destino não está na lista de
permitidos (números de teste da Meta) ou o formato é inválido. O Vocero já
normaliza os números do México (521 → 52).

**O agente não responde** — O Vocero não traz agente: há um conectado? O card
«Quem responde» da tela Agente diz (e se o `/health` dele responde). O
interruptor está ligado? A chave de IA está válida em Ajustes → IA? A conversa
tem a IA ativa e sem handoff? A janela de 24 h está aberta? Confira também os
logs da instância e os do seu agente.

**`ENCRYPTION_KEY` inválida no arranque** — Precisa ser exatamente 32 bytes em
base64 (44 caracteres): `openssl rand -base64 32`.

**A app sobe, mas /api/health falha** — O banco de dados não está pronto, a
`DATABASE_URL` aponta errado ou alguma variável obrigatória não passa na
validação (p. ex. uma `ENCRYPTION_KEY` mal gerada): o healthcheck responde 503
nos três casos. Confira os logs (`docker compose logs app`); o de arranque
nomeia a variável que falhou. A partir do repo, `pnpm doctor` confere as três
coisas e diz como consertar cada uma.

**Subir o logo ou o ícone dá erro, ou os anexos não aparecem** — A app não
consegue escrever em `MEDIA_DIR` (`/data/media` na imagem), e o log de arranque
avisa (`[boot] MEDIA_DIR … não é gravável`). Monte um volume em `/data` (o
compose já o faz; no Coolify, um persistent storage) e não defina `MEDIA_DIR`
na plataforma: o contêiner dá o volume ao usuário da app no arranque.

**Esqueci minha senha e não consigo entrar** — O Vocero não envia e-mails
(seria uma dependência externa) e o registro público fecha com a primeira
organização, então não há fluxo de "esqueci minha senha". A saída é reescrever
o hash no banco:

```bash
NEW_PASSWORD='sua-senha-nova' node scripts/reset-password.mjs voce@email.com
```

O script **não toca o banco**: imprime o `UPDATE` para você colar no console do
Postgres. Rode da sua máquina, com o repo clonado e `pnpm install` feito — a
senha nova nunca sai de lá. Vai por variável de ambiente e não por argumento
porque um argumento fica no histórico do shell e aparece no `ps`.

Deve responder `UPDATE 1`. Se responder `UPDATE 0`, o e-mail não confere;
olhe-os com `SELECT email FROM "user";`.

## Versões

A versão que está rodando aparece **embaixo, na barra lateral** (`v1.1.0 ·
8e62d0b`) e no healthcheck, para poder confirmar um deploy com um `curl` sem
abrir a app:

```bash
curl -s https://crm.seudominio.com/api/health
# {"ok":true,"version":"1.1.0","commit":"8e62d0b","commitVerified":true,
#  "features":{"agenda":false,"channels":["whatsapp"],"atribucion":false},
#  "mediaWritable":true}
```

`features` diz quais flags de deploy estão ligadas nesta instância (`AGENDA`,
`CHANNELS`, `ATRIBUCION`): é a forma de confirmar que a variável chegou ao
contêiner sem iniciar sessão. `mediaWritable` diz se `MEDIA_DIR` (o volume
`/data`) pode ser gravado; com `false` o CRM continua respondendo `ok`
(funciona sem anexos), mas o logo, o ícone e os anexos não serão salvos:
confira o volume. Essa sondagem escreve de verdade e lembra-se por um minuto,
então o healthcheck não toca o disco em cada chamada.

A versão sai de `package.json` e é congelada ao **compilar**. O commit, só se
chegar **ao build**. A imagem publicada já o traz (é compilada com o commit da
tag), então com ela `/api/health` responde `"commitVerified":true` sem fazer
nada. Se compilar a partir do código, passe-o como build arg `SOURCE_COMMIT` em
cada deploy. Com docker compose,
`docker compose build --build-arg SOURCE_COMMIT=$(git rev-parse HEAD)` e depois
`docker compose up -d --pull never` (sem `--build`, que reconstruiria sem ele,
e sem baixar a imagem publicada no lugar da sua); no Coolify ou em qualquer
outra plataforma, que o valor chegue como build arg `SOURCE_COMMIT`, não só
como variável de ambiente. Assim ele fica dentro do binário e sai com
`"commitVerified":true`.

Se o build não o trouxe, a app mostra o `SOURCE_COMMIT` que encontrar no
ambiente ao arranque, mas **não o dá como bom**: na barra lateral aparece como
«commit sem verificar» e no healthcheck com `"commitVerified":false`. É o que a
plataforma diz, não o código, e só é verdade se ela o atualizar em cada
deploy. Uma variável escrita à mão uma vez fica parada enquanto a app avança
por baixo, e o selo mostraria um commit que já não roda: uma variável fixa é
pior que deixá-la vazia. Sem commit por nenhum lado, vê-se só a versão. Se um
script compara commits para confirmar um deploy, que exija
`commitVerified: true`.

SemVer sobre o que importa a quem opera uma instância:

| | Quando sobe |
|---|---|
| **Maior** (`2.0.0`) | É preciso fazer algo à mão para atualizar: mudar uma variável de ambiente, migrar dados, reconectar algo. |
| **Menor** (`1.2.0`) | Funcionalidades novas. Atualizar é fazer redeploy. |
| **Patch** (`1.1.1`) | Correções e ajustes. Atualizar é fazer redeploy. |

A versão vive em `package.json` e sobe no PR que publica a mudança, junto com o
default de `VOCERO_CRM_VERSION` em `docker-compose.yml` e a tag da imagem em
`render.yaml`, `fly.toml` e `railway.toml` (dois testes exigem que coincidam) e
sua entrada em [`CHANGELOG.md`](CHANGELOG.md), que diz o que cada versão traz e
o que fazer para atualizar. Ao criar a tag `vX.Y.Z`, o CI publica a imagem
`ghcr.io/kevinrivm/vocero-crm:X.Y.Z`.

## Roadmap

As versões 1.5 e 2.0 têm plano próprio:
[docs/plan-1.5-y-2.0.md](docs/plan-1.5-y-2.0.md).

- Anexos no Instagram, Messenger e TikTok (hoje esses canais são de texto; no
  WhatsApp já vão e voltam com prévia).
- RAG para knowledge bases grandes (hoje: injetado por completo com aviso de
  tamanho).
- Personas configuráveis do Laboratório e comparativos entre rodadas.
- Exclusão de templates pela app.
- Métricas de templates (as de vendas, origem e conversas já estão em
  Resultados).
- Broadcast com opt-in verificado.

### Antes fora de escopo, agora atrás de uma flag

**O motor de agendamento já está no core**, desligado por padrão. Aqui se dizia
que ficava fora de propósito, com duas razões. As duas eram boas e as duas
mudaram; ficam escritas porque o porquê importa mais que a conclusão:

- *"São mil linhas e uma dependência de datas num projeto cujo argumento é ser
  leve."* — Verdade, e por isso vive atrás de `AGENDA`: uma instância que não
  agenda não vê telas, nem rotas, nem uma instrução de agendar no prompt do
  agente, nem pede uma única credencial. O peso paga quem ligar. O que dizia
  respeito à dependência de datas já não vale: o motor não adicionou nenhuma (a
  aritmética de fusos usa `Intl` da plataforma).
- *"O estado de que vagas foram oferecidas pertence à conversa, ou seja, ao
  agente, não ao CRM."* — Pertencia ao agente enquanto o CRM não oferecesse a
  garantia. Ao oferecê-la, é o CRM quem precisa poder prová-la: com a memória
  do lado do cliente, qualquer cérebro conectado por `/api/bot/*` poderia
  reservar um horário que nunca foi oferecido e o CRM o aceitaria. Agora a
  regra é inviolável por construção e vale igual para o Nea, para o seu bot e
  para o que vier.

O que continua fora, e de propósito: **ler calendários externos** para
descontar disponibilidade. O motor calcula com o que é seu, e os compromissos
de fora se refletem com bloqueios manuais; meter o provedor nesse caminho
acoplaria a latency e as quedas dele à tela mais usada.

## Stack

Next.js 15 (App Router) + React 19 · TypeScript estrito · PostgreSQL +
Drizzle ORM · Better Auth · Tailwind CSS · SSE (sem WebSockets) · Docker
multi-stage com migrações no arranque. Desenhado para que uma agência o
modifique com um assistente de IA: specs e decisões de design em
[`specs/`](specs/), guia de modificação em [`AGENTS.md`](AGENTS.md) (e o
específico de Claude Code em [`CLAUDE.md`](CLAUDE.md)).

## Licença

[MIT](LICENSE) — use, venda instalado, modifique. Se te serve, uma ⭐ no repo
ajuda mais gente a encontrá-lo.

## Créditos

Criado por [Kevin Belier](https://www.youtube.com/@KevinBelier). Quer aprender
a se tornar Meta Tech Provider e monetizar com sua agência de IA? Entre na
[VIBE Community](https://www.skool.com/vibe-community-vip). Os padrões de
produção (webhook assinado, ingestão idempotente, cifragem de tokens) vêm de um
projeto de referência privado em produção, portados e simplificados para este
repo.

## Idiomas da interface

Espanhol e português do Brasil estão disponíveis desde a 2.1.0. O proprietário
escolhe o padrão em Ajustes → Marca; o seletor do menu e do login guarda a
escolha neste navegador. [Configuração e extensão](docs/idiomas.md).
