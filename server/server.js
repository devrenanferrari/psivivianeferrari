#!/usr/bin/env node
/* ═══════════════════════════════════════════════
   Servidor VF · site estático + API de agendamento
   ───────────────────────────────────────────────
   Roda com Node 18+ e persiste em PostgreSQL:

     DATABASE_URL=postgres://...  node server/server.js

   Serve o site na raiz e a API em /api/*. Os
   portais (/conta e /admin) detectam a API
   automaticamente e passam a operar com dados
   compartilhados entre todos os dispositivos.

   Variáveis de ambiente:
   - DATABASE_URL       · obrigatória (Postgres)
   - PORT               · porta HTTP (padrão 8787; o Railway define a sua)
   - VF_TIMEZONE        · fuso usado para "hoje" (padrão America/Sao_Paulo)
   - GMAIL_USER          )
   - GMAIL_APP_PASSWORD  ) ver server/mailer.js — opcionais, sem eles os
   - ADMIN_EMAIL         ) e-mails de agendamento são apenas registrados
                          ) no log, sem interromper o agendamento.
   ═══════════════════════════════════════════════ */

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Pool, types } = require("pg");
const mailer = require("./mailer");

// Coluna DATE deve voltar como "AAAA-MM-DD" (string), não como Date/UTC —
// o front-end compara datas com operadores de string (>=, <=, ===).
types.setTypeParser(1082, (val) => val);

const PORT = process.env.PORT || 8787;
const ROOT = path.join(__dirname, "..");
const TIMEZONE = process.env.VF_TIMEZONE || "America/Sao_Paulo";

if (!process.env.DATABASE_URL) {
  console.error("Faltando DATABASE_URL. Configure a conexão com o Postgres antes de iniciar.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false },
});
pool.on("error", (err) => console.error("Erro inesperado no pool do Postgres:", err));

const DEFAULT_AVAILABILITY = {
  1: ["09:00", "10:00", "11:00", "14:00", "15:00", "19:00", "20:00"],
  2: ["09:00", "10:00", "11:00", "14:00", "15:00", "19:00", "20:00"],
  3: ["09:00", "10:00", "11:00", "14:00", "15:00", "19:00", "20:00"],
  4: ["09:00", "10:00", "11:00", "14:00", "15:00", "19:00", "20:00"],
  5: ["09:00", "10:00", "11:00", "14:00", "15:00"],
};

/* ── Schema ─────────────────────────────────── */

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      tel TEXT NOT NULL DEFAULT '',
      salt TEXT NOT NULL,
      senha_hash TEXT NOT NULL,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS admin_config (
      id INTEGER PRIMARY KEY DEFAULT 1,
      salt TEXT NOT NULL,
      hash TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS availability (
      weekday INTEGER PRIMARY KEY CHECK (weekday BETWEEN 0 AND 6),
      hours JSONB NOT NULL
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      data DATE NOT NULL,
      hora TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pendente',
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS appointments_active_slot
      ON appointments (data, hora) WHERE status <> 'cancelada';

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      de TEXT NOT NULL,
      texto TEXT NOT NULL,
      em TIMESTAMPTZ NOT NULL DEFAULT now(),
      lida BOOLEAN NOT NULL DEFAULT false
    );

    CREATE TABLE IF NOT EXISTS patient_tokens (
      token TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS admin_tokens (
      token TEXT PRIMARY KEY,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const { rows } = await pool.query("SELECT count(*)::int AS n FROM availability");
  if (rows[0].n === 0) {
    for (const [weekday, hours] of Object.entries(DEFAULT_AVAILABILITY)) {
      await pool.query("INSERT INTO availability (weekday, hours) VALUES ($1, $2)", [Number(weekday), JSON.stringify(hours)]);
    }
  }
}

/* ── Utilidades ─────────────────────────────── */

const uid = () => Date.now().toString(36) + crypto.randomBytes(4).toString("hex");
const newToken = () => crypto.randomBytes(24).toString("hex");
const hashPass = (senha, salt) => crypto.scryptSync(String(senha), salt, 48).toString("hex");

const todayStr = () => new Date().toLocaleDateString("sv-SE", { timeZone: TIMEZONE });

const rowPatient = (r) => r && { id: r.id, nome: r.nome, email: r.email, tel: r.tel, criadoEm: r.criado_em };
const rowAppointment = (r) => r && { id: r.id, patientId: r.patient_id, data: r.data, hora: r.hora, status: r.status, criadoEm: r.criado_em };
const rowMessage = (r) => r && { id: r.id, patientId: r.patient_id, de: r.de, texto: r.texto, em: r.em, lida: r.lida };

async function slotsFor(dateStr) {
  const weekday = new Date(dateStr + "T12:00:00").getDay();
  const availRes = await pool.query("SELECT hours FROM availability WHERE weekday = $1", [weekday]);
  const base = availRes.rows[0] ? availRes.rows[0].hours : [];
  const takenRes = await pool.query("SELECT hora FROM appointments WHERE data = $1 AND status <> 'cancelada'", [dateStr]);
  const taken = takenRes.rows.map((r) => r.hora);
  return base.filter((h) => !taken.includes(h));
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

/* ── HTTP helpers ───────────────────────────── */

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 64 * 1024) reject(new Error("payload"));
    });
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); }
    });
    req.on("error", reject);
  });
}

function bearer(req) {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

async function patientFromReq(req) {
  const t = bearer(req);
  if (!t) return null;
  const { rows } = await pool.query(
    `SELECT p.* FROM patient_tokens t JOIN patients p ON p.id = t.patient_id WHERE t.token = $1`,
    [t]
  );
  return rows[0] || null;
}

async function isAdminReq(req) {
  const t = bearer(req);
  if (!t) return false;
  const { rows } = await pool.query("SELECT 1 FROM admin_tokens WHERE token = $1", [t]);
  return rows.length > 0;
}

/* ── API ────────────────────────────────────── */

async function handleApi(req, res, url) {
  const p = url.pathname;
  const method = req.method;

  if (p === "/api/health" && method === "GET") return json(res, 200, { ok: true, service: "vf" });

  /* — pacientes — */
  if (p === "/api/signup" && method === "POST") {
    const b = await readBody(req);
    const email = String(b.email || "").trim().toLowerCase();
    if (!String(b.nome || "").trim() || !email || String(b.senha || "").length < 6) {
      return json(res, 400, { error: "Preencha nome, e-mail e uma senha com pelo menos 6 caracteres." });
    }
    const exists = await pool.query("SELECT 1 FROM patients WHERE email = $1", [email]);
    if (exists.rows.length) return json(res, 409, { error: "Já existe uma conta com este e-mail." });

    const id = uid();
    const salt = crypto.randomBytes(12).toString("hex");
    await pool.query(
      "INSERT INTO patients (id, nome, email, tel, salt, senha_hash) VALUES ($1, $2, $3, $4, $5, $6)",
      [id, String(b.nome).trim(), email, String(b.tel || "").trim(), salt, hashPass(b.senha, salt)]
    );
    const t = newToken();
    await pool.query("INSERT INTO patient_tokens (token, patient_id) VALUES ($1, $2)", [t, id]);
    const { rows } = await pool.query("SELECT * FROM patients WHERE id = $1", [id]);
    return json(res, 200, { token: t, patient: rowPatient(rows[0]) });
  }

  if (p === "/api/login" && method === "POST") {
    const b = await readBody(req);
    const { rows } = await pool.query("SELECT * FROM patients WHERE email = $1", [String(b.email || "").trim().toLowerCase()]);
    const patient = rows[0];
    if (!patient || patient.senha_hash !== hashPass(b.senha || "", patient.salt)) {
      return json(res, 401, { error: "E-mail ou senha incorretos." });
    }
    const t = newToken();
    await pool.query("INSERT INTO patient_tokens (token, patient_id) VALUES ($1, $2)", [t, patient.id]);
    return json(res, 200, { token: t, patient: rowPatient(patient) });
  }

  if (p === "/api/me" && method === "GET") {
    const me = await patientFromReq(req);
    return me ? json(res, 200, rowPatient(me)) : json(res, 401, { error: "Sessão expirada." });
  }

  /* — admin — */
  if (p === "/api/admin/status" && method === "GET") {
    const { rows } = await pool.query("SELECT 1 FROM admin_config WHERE id = 1");
    return json(res, 200, { configured: rows.length > 0 });
  }

  if (p === "/api/admin/setup" && method === "POST") {
    const already = await pool.query("SELECT 1 FROM admin_config WHERE id = 1");
    if (already.rows.length) return json(res, 409, { error: "O painel já tem senha. Use o login." });
    const b = await readBody(req);
    if (String(b.senha || "").length < 6) return json(res, 400, { error: "Use uma senha com pelo menos 6 caracteres." });
    const salt = crypto.randomBytes(12).toString("hex");
    await pool.query("INSERT INTO admin_config (id, salt, hash) VALUES (1, $1, $2)", [salt, hashPass(b.senha, salt)]);
    const t = newToken();
    await pool.query("INSERT INTO admin_tokens (token) VALUES ($1)", [t]);
    return json(res, 200, { token: t });
  }

  if (p === "/api/admin/login" && method === "POST") {
    const b = await readBody(req);
    const { rows } = await pool.query("SELECT * FROM admin_config WHERE id = 1");
    const cfg = rows[0];
    if (!cfg || cfg.hash !== hashPass(b.senha || "", cfg.salt)) {
      return json(res, 401, { error: "Senha incorreta." });
    }
    const t = newToken();
    await pool.query("INSERT INTO admin_tokens (token) VALUES ($1)", [t]);
    return json(res, 200, { token: t });
  }

  if (p === "/api/admin/me" && method === "GET") {
    return (await isAdminReq(req)) ? json(res, 200, { ok: true }) : json(res, 401, { error: "Sessão expirada." });
  }

  /* — disponibilidade — */
  if (p === "/api/availability" && method === "GET") {
    const { rows } = await pool.query("SELECT weekday, hours FROM availability");
    const map = {};
    rows.forEach((r) => { map[r.weekday] = r.hours; });
    return json(res, 200, map);
  }

  if (p === "/api/availability" && method === "PUT") {
    if (!(await isAdminReq(req))) return json(res, 401, { error: "Acesso restrito." });
    const b = await readBody(req);
    const map = {};
    for (const [day, hours] of Object.entries(b.availability || {})) {
      const d = Number(day);
      if (d >= 0 && d <= 6 && Array.isArray(hours)) {
        const clean = hours.filter((h) => TIME_RE.test(h)).sort();
        if (clean.length) map[d] = clean;
      }
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM availability");
      for (const [day, hours] of Object.entries(map)) {
        await client.query("INSERT INTO availability (weekday, hours) VALUES ($1, $2)", [Number(day), JSON.stringify(hours)]);
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    return json(res, 200, map);
  }

  if (p === "/api/slots" && method === "GET") {
    const date = url.searchParams.get("date") || "";
    if (!DATE_RE.test(date)) return json(res, 400, { error: "Data inválida." });
    return json(res, 200, await slotsFor(date));
  }

  /* — agendamentos — */
  if (p === "/api/appointments" && method === "GET") {
    if (await isAdminReq(req)) {
      const { rows } = await pool.query(`
        SELECT a.*, p.id AS p_id, p.nome AS p_nome, p.email AS p_email, p.tel AS p_tel, p.criado_em AS p_criado_em
        FROM appointments a LEFT JOIN patients p ON p.id = a.patient_id
        ORDER BY a.data, a.hora
      `);
      return json(res, 200, rows.map((r) => ({
        ...rowAppointment(r),
        patient: r.p_id ? { id: r.p_id, nome: r.p_nome, email: r.p_email, tel: r.p_tel, criadoEm: r.p_criado_em } : null,
      })));
    }
    const me = await patientFromReq(req);
    if (!me) return json(res, 401, { error: "Sessão expirada." });
    const { rows } = await pool.query("SELECT * FROM appointments WHERE patient_id = $1 ORDER BY data, hora", [me.id]);
    return json(res, 200, rows.map(rowAppointment));
  }

  if (p === "/api/appointments" && method === "POST") {
    const me = await patientFromReq(req);
    if (!me) return json(res, 401, { error: "Sessão expirada." });
    const b = await readBody(req);
    if (!DATE_RE.test(b.data || "") || !TIME_RE.test(b.hora || "") || b.data < todayStr()) {
      return json(res, 400, { error: "Data ou horário inválidos." });
    }
    if (!(await slotsFor(b.data)).includes(b.hora)) {
      return json(res, 409, { error: "Este horário acabou de ser ocupado. Escolha outro, por favor." });
    }
    const appointment = { id: uid(), patientId: me.id, data: b.data, hora: b.hora, status: "pendente" };
    try {
      const { rows } = await pool.query(
        "INSERT INTO appointments (id, patient_id, data, hora, status) VALUES ($1, $2, $3, $4, $5) RETURNING *",
        [appointment.id, appointment.patientId, appointment.data, appointment.hora, appointment.status]
      );
      const created = rowAppointment(rows[0]);
      mailer.notifyBookingCreated({ patient: me, appointment: created }).catch((err) => console.error("[mailer]", err));
      return json(res, 200, created);
    } catch (err) {
      if (err.code === "23505") return json(res, 409, { error: "Este horário acabou de ser ocupado. Escolha outro, por favor." });
      throw err;
    }
  }

  const apptMatch = p.match(/^\/api\/appointments\/([\w]+)$/);
  if (apptMatch && method === "PATCH") {
    const { rows: found } = await pool.query("SELECT * FROM appointments WHERE id = $1", [apptMatch[1]]);
    const appointment = found[0];
    if (!appointment) return json(res, 404, { error: "Sessão não encontrada." });
    const b = await readBody(req);
    const status = String(b.status || "");

    if (await isAdminReq(req)) {
      if (!["pendente", "confirmada", "cancelada"].includes(status)) return json(res, 400, { error: "Status inválido." });
      const { rows } = await pool.query("UPDATE appointments SET status = $1 WHERE id = $2 RETURNING *", [status, appointment.id]);
      const updated = rowAppointment(rows[0]);
      if (status === "confirmada" || status === "cancelada") {
        pool.query("SELECT * FROM patients WHERE id = $1", [updated.patientId]).then(({ rows: p }) => {
          if (p[0]) mailer.notifyStatusChanged({ patient: rowPatient(p[0]), appointment: updated }).catch((err) => console.error("[mailer]", err));
        }).catch((err) => console.error("[mailer]", err));
      }
      return json(res, 200, updated);
    }
    const me = await patientFromReq(req);
    if (!me || appointment.patient_id !== me.id) return json(res, 401, { error: "Acesso negado." });
    if (status !== "cancelada") return json(res, 400, { error: "Você pode apenas cancelar a sessão." });
    const { rows } = await pool.query("UPDATE appointments SET status = 'cancelada' WHERE id = $1 RETURNING *", [appointment.id]);
    return json(res, 200, rowAppointment(rows[0]));
  }

  /* — mensagens — */
  if (p === "/api/messages" && method === "GET") {
    if (await isAdminReq(req)) {
      const { rows } = await pool.query("SELECT * FROM messages ORDER BY em");
      return json(res, 200, rows.map(rowMessage));
    }
    const me = await patientFromReq(req);
    if (!me) return json(res, 401, { error: "Sessão expirada." });
    const { rows } = await pool.query("SELECT * FROM messages WHERE patient_id = $1 ORDER BY em", [me.id]);
    return json(res, 200, rows.map(rowMessage));
  }

  if (p === "/api/messages" && method === "POST") {
    const b = await readBody(req);
    const texto = String(b.texto || "").trim().slice(0, 2000);
    if (!texto) return json(res, 400, { error: "Mensagem vazia." });

    if (await isAdminReq(req)) {
      const exists = await pool.query("SELECT 1 FROM patients WHERE id = $1", [b.patientId]);
      if (!exists.rows.length) return json(res, 400, { error: "Paciente inválido." });
      const { rows } = await pool.query(
        "INSERT INTO messages (id, patient_id, de, texto) VALUES ($1, $2, 'psicologa', $3) RETURNING *",
        [uid(), b.patientId, texto]
      );
      return json(res, 200, rowMessage(rows[0]));
    }
    const me = await patientFromReq(req);
    if (!me) return json(res, 401, { error: "Sessão expirada." });
    const { rows } = await pool.query(
      "INSERT INTO messages (id, patient_id, de, texto) VALUES ($1, $2, 'paciente', $3) RETURNING *",
      [uid(), me.id, texto]
    );
    return json(res, 200, rowMessage(rows[0]));
  }

  if (p === "/api/messages/read" && method === "POST") {
    const b = await readBody(req);
    if (await isAdminReq(req)) {
      await pool.query("UPDATE messages SET lida = true WHERE patient_id = $1 AND de = 'paciente'", [b.patientId]);
    } else {
      const me = await patientFromReq(req);
      if (!me) return json(res, 401, { error: "Sessão expirada." });
      await pool.query("UPDATE messages SET lida = true WHERE patient_id = $1 AND de = 'psicologa'", [me.id]);
    }
    return json(res, 200, { ok: true });
  }

  /* — pacientes (admin) — */
  if (p === "/api/patients" && method === "GET") {
    if (!(await isAdminReq(req))) return json(res, 401, { error: "Acesso restrito." });
    const { rows } = await pool.query("SELECT * FROM patients ORDER BY nome");
    return json(res, 200, rows.map(rowPatient));
  }

  return json(res, 404, { error: "Rota não encontrada." });
}

/* ── Estático ───────────────────────────────── */

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".txt": "text/plain",
  ".webmanifest": "application/manifest+json", ".woff2": "font/woff2",
};

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  const abs = path.normalize(path.join(ROOT, rel));
  if (!abs.startsWith(ROOT)) { res.writeHead(403); return res.end(); }

  let file = abs;
  try {
    const st = fs.statSync(file);
    if (st.isDirectory()) {
      if (!rel.endsWith("/")) {
        res.writeHead(301, { Location: rel + "/" });
        return res.end();
      }
      file = path.join(file, "index.html");
      fs.statSync(file);
    }
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("404");
  }

  res.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}

/* ── Servidor ───────────────────────────────── */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    });
    return res.end();
  }

  try {
    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
    if (req.method !== "GET") { res.writeHead(405); return res.end(); }
    return serveStatic(req, res, url);
  } catch (err) {
    console.error(err);
    return json(res, 500, { error: "Erro interno." });
  }
});

ensureSchema()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`VF no ar → http://localhost:${PORT}  (site + API; Postgres conectado)`);
    });
  })
  .catch((err) => {
    console.error("Não foi possível preparar o banco de dados:", err);
    process.exit(1);
  });
