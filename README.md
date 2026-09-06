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
assets/img/            Fotos (vf-1 sofá · vf-2 vestido branco · vf-3 consultório)
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

### Arquitetura e limitação importante

Toda a lógica conversa apenas com o **`VFStore`** (`assets/js/store.js`), que hoje persiste em `localStorage` — ou seja, **os dados vivem no navegador de cada dispositivo**: o painel só enxerga agendamentos feitos no mesmo navegador. É a arquitetura certa para validar o produto sem custo; para produção real (dados compartilhados entre dispositivos), basta reimplementar as funções do `VFStore` sobre um backend (Supabase/Firebase resolvem em poucas horas mantendo as mesmas assinaturas) — nenhuma tela precisa mudar.

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

- Backend real para o VFStore (Supabase/Firebase) — dados compartilhados entre dispositivos e notificações.
- Lembrete automático de sessão por WhatsApp/e-mail.
- Adicionar blog/conteúdos para SEO ("terapia online funciona?", etc.).
- Domínio próprio + Google Business Profile para busca local.
