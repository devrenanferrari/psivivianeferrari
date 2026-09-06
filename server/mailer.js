/* ═══════════════════════════════════════════════
   Mailer · avisos por e-mail (Gmail SMTP)
   ───────────────────────────────────────────────
   Variáveis de ambiente:
   - GMAIL_USER          · endereço Gmail remetente
   - GMAIL_APP_PASSWORD  · senha de app (não é a senha normal da conta)
   - ADMIN_EMAIL         · e-mail da psicóloga p/ avisos de novas
                           solicitações (padrão: o próprio GMAIL_USER)
   - MAIL_FROM_NAME      · nome exibido no remetente (opcional)

   Sem GMAIL_USER/GMAIL_APP_PASSWORD configurados, os envios são
   silenciosamente ignorados (apenas um aviso no log) — o agendamento
   continua funcionando normalmente sem e-mail.
   ═══════════════════════════════════════════════ */

const nodemailer = require("nodemailer");

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || GMAIL_USER;
const FROM_NAME = process.env.MAIL_FROM_NAME || "Viviane Ferrari — Psicóloga";

const transporter =
  GMAIL_USER && GMAIL_APP_PASSWORD
    ? nodemailer.createTransport({
        service: "gmail",
        auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
      })
    : null;

if (!transporter) {
  console.warn("[mailer] GMAIL_USER/GMAIL_APP_PASSWORD não configurados — e-mails serão apenas registrados no log.");
}

async function sendMail({ to, subject, html }) {
  if (!to) return;
  if (!transporter) {
    console.warn(`[mailer] envio pulado (não configurado): "${subject}" para ${to}`);
    return;
  }
  try {
    await transporter.sendMail({ from: `"${FROM_NAME}" <${GMAIL_USER}>`, to, subject, html });
  } catch (err) {
    console.error(`[mailer] falha ao enviar "${subject}" para ${to}:`, err.message);
  }
}

const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function fmtDate(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  return `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

function layout(title, bodyHtml) {
  return `
  <div style="font-family:Georgia,'Times New Roman',serif;max-width:520px;margin:0 auto;background:#fdf6ec;border-radius:16px;overflow:hidden;border:1px solid #e6d6c4">
    <div style="background:#401216;color:#FFEDDA;padding:26px 28px">
      <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#D5BCAD;margin-bottom:8px">Viviane Ferrari &middot; Psicóloga Clínica</div>
      <div style="font-size:21px;font-style:italic">${title}</div>
    </div>
    <div style="padding:28px;color:#2b1013;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65">
      ${bodyHtml}
    </div>
    <div style="padding:16px 28px;color:#5d4a44;font-family:Helvetica,Arial,sans-serif;font-size:12px;border-top:1px solid #e6d6c4">
      E-mail automático — em caso de dúvidas, responda pelo WhatsApp ou pela Área do Paciente.
    </div>
  </div>`;
}

async function notifyBookingCreated({ patient, appointment }) {
  const primeiroNome = patient.nome.split(" ")[0];
  await sendMail({
    to: patient.email,
    subject: "Recebemos sua solicitação de sessão",
    html: layout(
      "Solicitação recebida",
      `<p>Olá, ${primeiroNome}!</p>
       <p>Recebemos seu pedido de sessão para <strong>${fmtDate(appointment.data)} às ${appointment.hora}</strong>.</p>
       <p>Assim que a Viviane confirmar, você recebe um novo e-mail — ou pode acompanhar o status a qualquer momento na <strong>Área do Paciente</strong>.</p>`
    ),
  });

  await sendMail({
    to: ADMIN_EMAIL,
    subject: `Nova solicitação de sessão · ${patient.nome}`,
    html: layout(
      "Nova solicitação",
      `<p><strong>${patient.nome}</strong> pediu uma sessão para <strong>${fmtDate(appointment.data)} às ${appointment.hora}</strong>.</p>
       <p>Contato: ${patient.email}${patient.tel ? " · " + patient.tel : ""}</p>
       <p>Acesse o Painel de Controle para confirmar ou recusar.</p>`
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
       <p>Sua sessão de <strong>${fmtDate(appointment.data)} às ${appointment.hora}</strong> foi ${confirmada ? "<strong>confirmada</strong>" : "cancelada"}.</p>
       ${confirmada
         ? "<p>Sessão online, por videochamada — o link é combinado por mensagem antes do horário.</p>"
         : "<p>Se quiser, escolha outro horário disponível pela Área do Paciente.</p>"}`
    ),
  });
}

module.exports = { notifyBookingCreated, notifyStatusChanged };
