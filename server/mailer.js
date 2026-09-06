/* ═══════════════════════════════════════════════
   Mailer · avisos por e-mail (Resend, via HTTPS)
   ───────────────────────────────────────────────
   Variáveis de ambiente:
   - RESEND_API_KEY   · chave da API do Resend (resend.com)
   - MAIL_FROM        · endereço remetente (padrão: contato@psivivianeferrari.com.br,
                        precisa ser um domínio verificado no Resend)
   - ADMIN_EMAIL      · e-mail da psicóloga p/ avisos de novas solicitações
                        (padrão: o próprio MAIL_FROM)
   - MAIL_FROM_NAME   · nome exibido no remetente (opcional)
   - SITE_URL         · usado nos botões dos e-mails (padrão abaixo)

   Usamos a API HTTP do Resend (não SMTP) de propósito: plataformas como o
   Railway costumam ter saída SMTP bloqueada/instável (foi exatamente o que
   aconteceu tentando mandar direto pelo Gmail) — HTTPS não tem esse problema.

   Sem RESEND_API_KEY configurada, os envios são silenciosamente ignorados
   (apenas um aviso no log) — o agendamento continua funcionando normalmente
   sem e-mail.
   ═══════════════════════════════════════════════ */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const MAIL_FROM = process.env.MAIL_FROM || "contato@psivivianeferrari.com.br";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || MAIL_FROM;
const FROM_NAME = process.env.MAIL_FROM_NAME || "Viviane Ferrari — Psicóloga";
const SITE_URL = process.env.SITE_URL || "https://www.psivivianeferrari.com.br";

const configured = Boolean(RESEND_API_KEY);
if (!configured) {
  console.warn("[mailer] RESEND_API_KEY não configurada — e-mails serão apenas registrados no log.");
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendMail({ to, subject, html }, attempt = 1) {
  if (!to) return;
  if (!configured) {
    console.warn(`[mailer] envio pulado (não configurado): "${subject}" para ${to}`);
    return;
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `${FROM_NAME} <${MAIL_FROM}>`, to, subject, html }),
    });
    if (!response.ok) throw new Error(`Resend ${response.status}: ${await response.text()}`);
  } catch (err) {
    if (attempt < 3) {
      console.warn(`[mailer] tentativa ${attempt} falhou para ${to} (${err.message}) — tentando de novo…`);
      await sleep(1500 * attempt);
      return sendMail({ to, subject, html }, attempt + 1);
    }
    console.error(`[mailer] falha ao enviar "${subject}" para ${to} após ${attempt} tentativas:`, err.message);
  }
}

/* ── Datas ──────────────────────────────────── */

const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function fmtDate(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  return `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

/* ── Template visual (paleta e tipografia do site) ── */

const COLORS = {
  wineDeep: "#401216",
  wine: "#63333A",
  caramel: "#9C7961",
  cream: "#FFEDDA",
  blush: "#D5BCAD",
  ink: "#2b1013",
  inkSoft: "#5d4a44",
  paper: "#fdf6ec",
  ground: "#f2e6d8",
};

function detailCard(dateStr, hora, label = "Sessão") {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.cream};border-radius:14px;margin:20px 0">
      <tr><td style="padding:18px 22px">
        <div style="font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${COLORS.caramel};margin-bottom:6px">${label}</div>
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:19px;color:${COLORS.wineDeep}">${fmtDate(dateStr)} às ${hora}</div>
      </td></tr>
    </table>`;
}

function button(label, href) {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px auto 4px">
      <tr><td style="border-radius:999px;background:${COLORS.wineDeep}">
        <a href="${href}" style="display:inline-block;padding:13px 30px;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:bold;letter-spacing:0.03em;color:${COLORS.cream};text-decoration:none;border-radius:999px">${label}</a>
      </td></tr>
    </table>`;
}

function layout(title, bodyHtml) {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:32px 14px;background:${COLORS.ground};font-family:Georgia,'Times New Roman',serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:${COLORS.paper};border-radius:22px;overflow:hidden;border:1px solid rgba(156,121,97,0.28)">
        <tr><td style="background-color:${COLORS.wineDeep};background-image:linear-gradient(135deg,${COLORS.wineDeep},${COLORS.wine});padding:36px 30px 30px;text-align:center">
          <div style="width:54px;height:54px;line-height:54px;border-radius:50%;background:${COLORS.cream};color:${COLORS.wineDeep};font-family:Georgia,serif;font-style:italic;font-size:19px;margin:0 auto 18px">VF</div>
          <div style="font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:${COLORS.blush};margin-bottom:10px">Viviane Ferrari &middot; Psicóloga Clínica</div>
          <div style="font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:23px;color:${COLORS.cream}">${title}</div>
        </td></tr>
        <tr><td style="padding:32px 30px 8px;color:${COLORS.ink};font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7">
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:20px 30px;color:${COLORS.inkSoft};font-family:Helvetica,Arial,sans-serif;font-size:12px;border-top:1px solid rgba(156,121,97,0.22);background:#f7ede0">
          E-mail automático — em caso de dúvidas, responda pelo WhatsApp ou pela Área do Paciente.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/* ── Notificações ───────────────────────────── */

async function notifyBookingCreated({ patient, appointment }) {
  const primeiroNome = patient.nome.split(" ")[0];
  await sendMail({
    to: patient.email,
    subject: "Recebemos sua solicitação de sessão",
    html: layout(
      "Solicitação recebida",
      `<p>Olá, ${primeiroNome}!</p>
       <p>Recebemos seu pedido de sessão:</p>
       ${detailCard(appointment.data, appointment.hora)}
       <p>Assim que a Viviane confirmar, você recebe um novo e-mail — ou pode acompanhar o status a qualquer momento na Área do Paciente.</p>
       ${button("Ver na Área do Paciente", `${SITE_URL}/conta/`)}`
    ),
  });

  await sendMail({
    to: ADMIN_EMAIL,
    subject: `Nova solicitação de sessão · ${patient.nome}`,
    html: layout(
      "Nova solicitação",
      `<p><strong>${patient.nome}</strong> pediu uma sessão:</p>
       ${detailCard(appointment.data, appointment.hora)}
       <p>Contato: ${patient.email}${patient.tel ? " · " + patient.tel : ""}</p>
       ${button("Abrir Painel de Controle", `${SITE_URL}/admin/`)}`
    ),
  });
}

async function notifyWelcomeFromAdmin({ patient, senhaProvisoria }) {
  const primeiroNome = patient.nome.split(" ")[0];
  await sendMail({
    to: patient.email,
    subject: "Bem-vindo(a) à Área do Paciente",
    html: layout(
      "Bem-vindo(a)!",
      `<p>Olá, ${primeiroNome}!</p>
       <p>A Viviane criou uma conta pra você na Área do Paciente — é lá que você acompanha suas sessões e troca mensagens com ela. Use estes dados no primeiro acesso:</p>
       <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.cream};border-radius:14px;margin:20px 0">
         <tr><td style="padding:18px 22px;font-family:Helvetica,Arial,sans-serif">
           <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${COLORS.caramel};margin-bottom:4px">E-mail</div>
           <div style="font-size:16px;color:${COLORS.wineDeep};margin-bottom:16px">${patient.email}</div>
           <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${COLORS.caramel};margin-bottom:4px">Senha provisória</div>
           <div style="font-size:16px;color:${COLORS.wineDeep};font-weight:bold">${senhaProvisoria}</div>
         </td></tr>
       </table>
       <p>Por segurança, assim que você entrar vamos pedir pra você trocar essa senha por uma só sua.</p>
       ${button("Entrar na Área do Paciente", `${SITE_URL}/conta/`)}`
    ),
  });
}

async function notifyEmailVerification({ patient, verifyUrl }) {
  const primeiroNome = patient.nome.split(" ")[0];
  await sendMail({
    to: patient.email,
    subject: "Confirme seu e-mail",
    html: layout(
      "Confirme seu e-mail",
      `<p>Olá, ${primeiroNome}!</p>
       <p>Sua conta na Área do Paciente foi criada. Confirme seu e-mail para garantir que os avisos de agendamento cheguem certinho:</p>
       ${button("Confirmar meu e-mail", verifyUrl)}
       <p style="margin-top:22px;font-size:13px;color:${COLORS.inkSoft}">Se você não criou essa conta, pode ignorar este e-mail.</p>`
    ),
  });
}

async function notifyStatusChanged({ patient, appointment }) {
  const primeiroNome = patient.nome.split(" ")[0];
  const confirmada = appointment.status === "confirmada";
  await sendMail({
    to: patient.email,
    subject: confirmada ? "Sua sessão foi confirmada ✓" : "Atualização sobre sua sessão",
    html: layout(
      confirmada ? "Sessão confirmada" : "Sessão cancelada",
      `<p>Olá, ${primeiroNome}!</p>
       <p>Sua sessão foi <strong>${confirmada ? "confirmada" : "cancelada"}</strong>:</p>
       ${detailCard(appointment.data, appointment.hora)}
       ${confirmada
         ? "<p>Sessão online, por videochamada — o link é combinado por mensagem antes do horário.</p>"
         : "<p>Se quiser, escolha outro horário disponível pela Área do Paciente.</p>"}
       ${button("Ver na Área do Paciente", `${SITE_URL}/conta/`)}`
    ),
  });
}

async function notifyReminder({ patient, appointment }) {
  const primeiroNome = patient.nome.split(" ")[0];
  await sendMail({
    to: patient.email,
    subject: "Lembrete: sua sessão é amanhã",
    html: layout(
      "Sua sessão é amanhã",
      `<p>Olá, ${primeiroNome}!</p>
       <p>Passando para lembrar da sua sessão:</p>
       ${detailCard(appointment.data, appointment.hora)}
       <p>Sessão online, por videochamada — o link é combinado por mensagem antes do horário.</p>
       ${button("Ver na Área do Paciente", `${SITE_URL}/conta/`)}`
    ),
  });
}

const escapeHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function messageCard(texto) {
  const preview = texto.length > 500 ? texto.slice(0, 500) + "…" : texto;
  const safe = escapeHtml(preview).replace(/\n/g, "<br>");
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.cream};border-radius:14px;margin:20px 0">
      <tr><td style="padding:18px 22px;font-family:Helvetica,Arial,sans-serif;font-size:15px;color:${COLORS.ink}">${safe}</td></tr>
    </table>`;
}

async function notifyNewMessage({ patient, texto, de }) {
  if (de === "paciente") {
    await sendMail({
      to: ADMIN_EMAIL,
      subject: `Nova mensagem · ${patient.nome}`,
      html: layout(
        "Nova mensagem",
        `<p><strong>${patient.nome}</strong> mandou uma mensagem:</p>
         ${messageCard(texto)}
         ${button("Responder no Painel", `${SITE_URL}/admin/`)}`
      ),
    });
  } else {
    const primeiroNome = patient.nome.split(" ")[0];
    await sendMail({
      to: patient.email,
      subject: "Nova mensagem de Viviane Ferrari",
      html: layout(
        "Nova mensagem",
        `<p>Olá, ${primeiroNome}!</p>
         <p>Você recebeu uma mensagem:</p>
         ${messageCard(texto)}
         ${button("Ver e responder", `${SITE_URL}/conta/`)}`
      ),
    });
  }
}

module.exports = { notifyBookingCreated, notifyStatusChanged, notifyReminder, notifyEmailVerification, notifyNewMessage, notifyWelcomeFromAdmin };
