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
index.html            Página única (hero, sobre, especialidades, fluxo, agendamento, FAQ)
assets/css/style.css  Estilos (paleta, componentes, responsivo, reduced-motion)
assets/js/main.js     Interações (menu, reveal, wizard de agendamento)
```

## Fluxo de agendamento

O atendimento é 100% online. O wizard em `#agendar` guia a pessoa em 3 etapas (motivo → período → nome) e gera uma mensagem pronta para o WhatsApp com o resumo do pedido — sem backend, sem cadastro, sem fricção.

## Antes de publicar

1. **CRP**: substitua `CRP 00/00000` pelo registro real (header, sobre e rodapé).
2. **E-mail**: confirme o endereço no rodapé (`contato@psivivianeferrari.com.br`).
3. **Textos**: revise formação, especialidades e valores na conversa inicial.

WhatsApp (`5532984146528`) e Instagram (`@psivivianeferrari`) já estão configurados no wizard, no rodapé e nos botões flutuantes.

## Notas de conformidade (CFP)

- O site **não usa depoimentos de pacientes** — a publicidade com depoimentos é vedada pelo Código de Ética Profissional do Psicólogo.
- O rodapé mantém o aviso de que o site não é canal de emergência, com indicação do **CVV 188**.
- Exiba sempre o CRP ativo em local visível (já contemplado no header e rodapé).

## Publicação

É um site 100% estático — funciona em GitHub Pages, Vercel, Netlify ou qualquer hospedagem simples. Para GitHub Pages: Settings → Pages → Deploy from branch → `main` → `/ (root)`.

## Evoluções sugeridas

- Integrar um agendador real (Cal.com ou Calendly) como passo final do wizard.
- Adicionar blog/conteúdos para SEO ("terapia online funciona?", etc.).
- Domínio próprio + Google Business Profile para busca local.
