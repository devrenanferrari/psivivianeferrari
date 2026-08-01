#!/usr/bin/env node
/* ═══════════════════════════════════════════════
   Servidor VF · site estático + API de agendamento
   ───────────────────────────────────────────────
   Sem dependências externas — roda com Node 18+:

     node server/server.js

   Serve o site na raiz e a API em /api/*. Os
   portais (/conta e /admin) detectam a API
   automaticamente e passam a operar com dados
   compartilhados entre todos os dispositivos.

   Dados persistidos em server/data.json
   (configurável via VF_DATA_FILE).
   ═══════════════════════════════════════════════ */

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 8787;
const ROOT = path.join(__dirname, "..");
const DATA_FILE = process.env.VF_DATA_FILE || path.join(__dirname, "data.json");

const DEFAULT_AVAILABILITY = {
  1: ["09:00", "10:00", "11:00", "14:00", "15:00", "19:00", "20:00"],
  2: ["09:00", "10:00", "11:00", "14:00", "15:00", "19:00", "20:00"],
  3: ["09:00", "10:00", "11:00", "14:00", "15:00", "19:00", "20:00"],
  4: ["09:00", "10:00", "11:00", "14:00", "15:00", "19:00", "20:00"],
  5: ["09:00", "10:00", "11:00", "14:00", "15:00"],
};

/* ── Banco de dados (arquivo JSON) ──────────── */

let db;
function load() {
  try {
    db = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    db = null;
  }
  db = Object.assign(
    { adminPass: null, patients: [], appointments: [], messages: [], availability: DEFAULT_AVAILABILITY, ptokens: {}, atokens: {} },
    db || {}
  );
}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 1));
  }, 40);
}
load();

/* ── Utilidades ─────────────────────────────── */

const uid = () => Date.now().toString(36) + crypto.randomBytes(4).toString("hex");
const newToken = () => crypto.randomBytes(24).toString("hex");
const hashPass = (senha, salt) => crypto.scryptSync(String(senha), salt, 48).toString("hex");

const publicPatient = (p) => p && { id: p.id, nome: p.nome, email: p.email, tel: p.tel, criadoEm: p.criadoEm };

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function slotsFor(dateStr) {
  const weekday = new Date(dateStr + "T12:00:00").getDay();
  const base = db.availability[weekday] || [];
  const taken = db.appointments.filter((a) => a.data === dateStr && a.status !== "cancelada").map((a) => a.hora);
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
const patientFromReq = (req) => {
  const t = bearer(req);
  const id = t && db.ptokens[t];
  return id ? db.patients.find((p) => p.id === id) || null : null;
};
const isAdmin = (req) => {
  const t = bearer(req);
  return Boolean(t && db.atokens[t]);
};

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
    if (db.patients.some((x) => x.email === email)) {
      return json(res, 409, { error: "Já existe uma conta com este e-mail." });
    }
    const salt = crypto.randomBytes(12).toString("hex");
    const patient = {
      id: uid(), nome: String(b.nome).trim(), email, tel: String(b.tel || "").trim(),
      salt, senhaHash: hashPass(b.senha, salt), criadoEm: new Date().toISOString(),
    };
    db.patients.push(patient);
    const t = newToken();
    db.ptokens[t] = patient.id;
    save();
    return json(res, 200, { token: t, patient: publicPatient(patient) });
  }

  if (p === "/api/login" && method === "POST") {
    const b = await readBody(req);
    const patient = db.patients.find((x) => x.email === String(b.email || "").trim().toLowerCase());
    if (!patient || patient.senhaHash !== hashPass(b.senha || "", patient.salt)) {
      return json(res, 401, { error: "E-mail ou senha incorretos." });
    }
    const t = newToken();
    db.ptokens[t] = patient.id;
    save();
    return json(res, 200, { token: t, patient: publicPatient(patient) });
  }

  if (p === "/api/me" && method === "GET") {
    const me = patientFromReq(req);
    return me ? json(res, 200, publicPatient(me)) : json(res, 401, { error: "Sessão expirada." });
  }

  /* — admin — */
  if (p === "/api/admin/status" && method === "GET") return json(res, 200, { configured: Boolean(db.adminPass) });

  if (p === "/api/admin/setup" && method === "POST") {
    if (db.adminPass) return json(res, 409, { error: "O painel já tem senha. Use o login." });
    const b = await readBody(req);
    if (String(b.senha || "").length < 6) return json(res, 400, { error: "Use uma senha com pelo menos 6 caracteres." });
    const salt = crypto.randomBytes(12).toString("hex");
    db.adminPass = { salt, hash: hashPass(b.senha, salt) };
    const t = newToken();
    db.atokens[t] = true;
    save();
    return json(res, 200, { token: t });
  }

  if (p === "/api/admin/login" && method === "POST") {
    const b = await readBody(req);
    if (!db.adminPass || db.adminPass.hash !== hashPass(b.senha || "", db.adminPass.salt)) {
      return json(res, 401, { error: "Senha incorreta." });
    }
    const t = newToken();
    db.atokens[t] = true;
    save();
    return json(res, 200, { token: t });
  }

  if (p === "/api/admin/me" && method === "GET") {
    return isAdmin(req) ? json(res, 200, { ok: true }) : json(res, 401, { error: "Sessão expirada." });
  }

  /* — disponibilidade — */
  if (p === "/api/availability" && method === "GET") return json(res, 200, db.availability);

  if (p === "/api/availability" && method === "PUT") {
    if (!isAdmin(req)) return json(res, 401, { error: "Acesso restrito." });
    const b = await readBody(req);
    const map = {};
    for (const [day, hours] of Object.entries(b.availability || {})) {
      const d = Number(day);
      if (d >= 0 && d <= 6 && Array.isArray(hours)) {
        const clean = hours.filter((h) => TIME_RE.test(h)).sort();
        if (clean.length) map[d] = clean;
      }
    }
    db.availability = map;
    save();
    return json(res, 200, db.availability);
  }

  if (p === "/api/slots" && method === "GET") {
    const date = url.searchParams.get("date") || "";
    if (!DATE_RE.test(date)) return json(res, 400, { error: "Data inválida." });
    return json(res, 200, slotsFor(date));
  }

  /* — agendamentos — */
  if (p === "/api/appointments" && method === "GET") {
    if (isAdmin(req)) {
      return json(res, 200, db.appointments.map((a) => ({
        ...a,
        patient: publicPatient(db.patients.find((x) => x.id === a.patientId)) || null,
      })));
    }
    const me = patientFromReq(req);
    if (!me) return json(res, 401, { error: "Sessão expirada." });
    return json(res, 200, db.appointments.filter((a) => a.patientId === me.id));
  }

  if (p === "/api/appointments" && method === "POST") {
    const me = patientFromReq(req);
    if (!me) return json(res, 401, { error: "Sessão expirada." });
    const b = await readBody(req);
    if (!DATE_RE.test(b.data || "") || !TIME_RE.test(b.hora || "") || b.data < todayStr()) {
      return json(res, 400, { error: "Data ou horário inválidos." });
    }
    if (!slotsFor(b.data).includes(b.hora)) {
      return json(res, 409, { error: "Este horário acabou de ser ocupado. Escolha outro, por favor." });
    }
    const appointment = { id: uid(), patientId: me.id, data: b.data, hora: b.hora, status: "pendente", criadoEm: new Date().toISOString() };
    db.appointments.push(appointment);
    save();
    return json(res, 200, appointment);
  }

  const apptMatch = p.match(/^\/api\/appointments\/([\w]+)$/);
  if (apptMatch && method === "PATCH") {
    const appointment = db.appointments.find((a) => a.id === apptMatch[1]);
    if (!appointment) return json(res, 404, { error: "Sessão não encontrada." });
    const b = await readBody(req);
    const status = String(b.status || "");
    if (isAdmin(req)) {
      if (!["pendente", "confirmada", "cancelada"].includes(status)) return json(res, 400, { error: "Status inválido." });
      appointment.status = status;
      save();
      return json(res, 200, appointment);
    }
    const me = patientFromReq(req);
    if (!me || appointment.patientId !== me.id) return json(res, 401, { error: "Acesso negado." });
    if (status !== "cancelada") return json(res, 400, { error: "Você pode apenas cancelar a sessão." });
    appointment.status = "cancelada";
    save();
    return json(res, 200, appointment);
  }

  /* — mensagens — */
  if (p === "/api/messages" && method === "GET") {
    if (isAdmin(req)) return json(res, 200, db.messages);
    const me = patientFromReq(req);
    if (!me) return json(res, 401, { error: "Sessão expirada." });
    return json(res, 200, db.messages.filter((m) => m.patientId === me.id));
  }

  if (p === "/api/messages" && method === "POST") {
    const b = await readBody(req);
    const texto = String(b.texto || "").trim().slice(0, 2000);
    if (!texto) return json(res, 400, { error: "Mensagem vazia." });
    let msg;
    if (isAdmin(req)) {
      if (!db.patients.some((x) => x.id === b.patientId)) return json(res, 400, { error: "Paciente inválido." });
      msg = { id: uid(), patientId: b.patientId, de: "psicologa", texto, em: new Date().toISOString(), lida: false };
    } else {
      const me = patientFromReq(req);
      if (!me) return json(res, 401, { error: "Sessão expirada." });
      msg = { id: uid(), patientId: me.id, de: "paciente", texto, em: new Date().toISOString(), lida: false };
    }
    db.messages.push(msg);
    save();
    return json(res, 200, msg);
  }

  if (p === "/api/messages/read" && method === "POST") {
    const b = await readBody(req);
    if (isAdmin(req)) {
      db.messages.forEach((m) => { if (m.patientId === b.patientId && m.de === "paciente") m.lida = true; });
    } else {
      const me = patientFromReq(req);
      if (!me) return json(res, 401, { error: "Sessão expirada." });
      db.messages.forEach((m) => { if (m.patientId === me.id && m.de === "psicologa") m.lida = true; });
    }
    save();
    return json(res, 200, { ok: true });
  }

  /* — pacientes (admin) — */
  if (p === "/api/patients" && method === "GET") {
    if (!isAdmin(req)) return json(res, 401, { error: "Acesso restrito." });
    return json(res, 200, db.patients.map(publicPatient));
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
    return json(res, 500, { error: "Erro interno." });
  }
});

server.listen(PORT, () => {
  console.log(`VF no ar → http://localhost:${PORT}  (site + API; dados em ${DATA_FILE})`);
});
