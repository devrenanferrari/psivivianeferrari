# Psi Viviane Ferrari — Site

Site institucional de página única para psicóloga clínica, com foco na experiência de quem busca terapia: fluxo claro, agendamento guiado em etapas e estética sofisticada.

## Paleta

| Cor | Hex | Uso |
| --- | --- | --- |
| Vinho profundo | `#401216` | Fundos principais, títulos |
| Vinho médio | `#63333A` | Apoio, hovers, gradientes |
| Caramelo | `#9C7961` | Acentos, detalhes, faixa |
| Creme | `#FFEDDA` | Fundos claros, texto sobre vinho |
| Rosé nude | `#D5BCAD` | Destaques suaves, molduras |

Tipografia: **Fraunces** (display, serifada) + **Jost** (texto), via Google Fonts.

## Estrutura

```
index.html             Página pública (hero, sobre, especialidades, fluxo, agendamento, FAQ)
conta/index.html       Área do Paciente (login, agendamento em horários reais, mensagens)
admin/index.html       Painel de Controle da psicóloga (SEM link no site — acesso direto por /admin)
assets/css/style.css   Estilos da página pública
assets/css/portal.css  Estilos compartilhados dos dois portais
assets/js/main.js      Interações da página pública (menu, reveal, wizard WhatsApp)
assets/js/store.js     VFStore — camada de dados dos portais
assets/js/config.js    URL da API usada pelos portais (VF_CONFIG.API_URL)
assets/img/            Fotos (vf-1 sofá · vf-2 vestido branco · vf-3 consultório)
server/server.js       API + servidor estático (Node + PostgreSQL)
package.json           Dependências do backend (pg) — usado no deploy do Railway
railway.toml           Deploy da API no Railway (start command, healthcheck)
```

## Sistema de agendamento — duas visões

O atendimento é 100% online. Na seção `#agendar` a pessoa escolhe o caminho:

**1. Pelo WhatsApp (sem cadastro)** — wizard de 3 etapas (motivo → período → nome) que gera mensagem pronta para o WhatsApp.

**2. Pelo site (Área do Paciente, `/conta`)** — visão do atendido:
- Cria conta (nome, e-mail, WhatsApp, senha com hash SHA-256) e faz login.
- Vê os **horários realmente livres** (modelo semanal da psicóloga menos sessões já ocupadas), escolhe dia e horário e envia a solicitação (status `pendente`).
- Acompanha status (`pendente → confirmada/cancelada`), cancela sessões e vê histórico.
- Troca **mensagens** com a psicóloga direto pelo site.

**Painel de Controle (`/admin`)** — visão da atendente, sem link público:
- Primeiro acesso cria a senha do painel (hash local); acessos seguintes pedem a senha.
- **Agenda**: solicitações pendentes (confirmar/recusar), sessões confirmadas (cancelar), histórico, contador do dia e atalho de WhatsApp para cada paciente.
- **Mensagens**: caixa de entrada por paciente com não-lidas e resposta em chat.
- **Horários**: editor do modelo semanal (abre/fecha horários por dia) que controla o que os pacientes podem agendar.
- **Pacientes**: lista com contatos e total de sessões.

Se paciente e painel estiverem abertos ao mesmo tempo (abas diferentes), as telas se atualizam em tempo real via evento `storage`.

### Arquitetura

Toda a lógica conversa apenas com o **`VFStore`** (`assets/js/store.js`), uma fachada única com dois modos:

- **API** (`server/server.js` + PostgreSQL) — dados compartilhados entre todos os dispositivos. É o modo de produção, descrito em [Backend e deploy](#backend-e-deploy) abaixo.
- **Local** (`localStorage`) — modo demonstração, usado automaticamente quando nenhuma API responde (ex.: abrindo o site sem backend configurado). Cada navegador enxerga só os próprios dados.

`VFStore.init()` detecta o modo sozinho: tenta `GET {API_URL}/api/health` e, se responder, usa a API; senão cai no modo local. Nenhuma tela precisa saber qual dos dois está ativo.

## Backend e deploy

O backend (`server/`) é um servidor Node puro (só a dependência `pg`) que expõe a API em `/api/*` e persiste tudo em **PostgreSQL**. O site estático continua podendo ser publicado separadamente (GitHub Pages) — basta apontar o front-end para a URL da API.

### Já publicado

O projeto **psivivianeferrari** está criado no Railway (workspace "bytepay pagamentos"), com dois serviços:

- **Postgres** — banco de dados (rede privada, `DATABASE_URL` interno).
- **api** — este servidor (`server/server.js`), com `DATABASE_URL=${{Postgres.DATABASE_URL}}` configurado e domínio público em `https://api-production-303c6.up.railway.app`.

`assets/js/config.js` já aponta `API_URL` para esse domínio, então o site publicado usa dados reais e compartilhados. Para reimplantar depois de alterar o backend:

```
railway up --service api
```

(rode a partir da raiz do repositório, com o Railway CLI logado — `railway login` — e o projeto linkado — `railway status` confirma).

**Pendente:** acessar `/admin` no site e fazer o "Primeiro acesso" para criar a senha real do painel (nenhuma senha de admin foi definida em produção).

### Para recriar o deploy do zero (referência)

1. **Banco de dados**: `railway add -d postgres` no projeto.
2. **Serviço da API**: `railway add -s api` (Empty Service), depois `railway variables --service api --set 'DATABASE_URL=${{Postgres.DATABASE_URL}}'`.
3. **Deploy**: `railway up --service api` a partir da raiz do repositório — o Railway detecta Node pelo `package.json` da raiz (script `start` roda `node server/server.js`), instala as dependências e sobe o servidor. `railway.toml` define o healthcheck (`/api/health`) e a política de restart.
4. **Domínio**: `railway domain --service api` gera a URL pública.
5. Copie essa URL para `API_URL` em [`assets/js/config.js`](assets/js/config.js) e publique o site.

O servidor cria as tabelas automaticamente na primeira execução (`ensureSchema()` em `server.js`) — não é preciso rodar migrations à parte.

### Rodando localmente

```
npm install
DATABASE_URL="postgres://usuario:senha@localhost:5432/vf" node server/server.js
```

Sem um Postgres à mão, use um container temporário:

```
docker run -d --name vf-pg -e POSTGRES_PASSWORD=vf -e POSTGRES_DB=vf -p 5432:5432 postgres:16-alpine
DATABASE_URL="postgres://postgres:vf@localhost:5432/vf" node server/server.js
```

Com o servidor local rodando, abra `http://localhost:8787` — para usar o backend local em vez do Railway, troque temporariamente `API_URL` em `config.js` para `""`.

## Antes de publicar

1. **CRP**: substitua `CRP 00/00000` pelo registro real (header, sobre e rodapé).
2. **E-mail**: confirme o endereço no rodapé (`psivivianeferrari@gmail.com`).
3. **Textos**: revise formação, especialidades e valores na conversa inicial.

WhatsApp (`5532984146528`) e Instagram (`@psivivianeferrari`) já estão configurados no wizard, no rodapé e nos botões flutuantes.

## Notas de conformidade (CFP)

- O site **não usa depoimentos de pacientes** — a publicidade com depoimentos é vedada pelo Código de Ética Profissional do Psicólogo.
- O rodapé mantém o aviso de que o site não é canal de emergência, com indicação do **CVV 188**.
- Exiba sempre o CRP ativo em local visível (já contemplado no header e rodapé).

## Publicação

É um site 100% estático — funciona em GitHub Pages, Vercel, Netlify ou qualquer hospedagem simples. Para GitHub Pages: Settings → Pages → Deploy from branch → `main` → `/ (root)`.

## Evoluções sugeridas

- Lembrete automático de sessão por WhatsApp/e-mail.
- Adicionar blog/conteúdos para SEO ("terapia online funciona?", etc.).
- Domínio próprio + Google Business Profile para busca local.
