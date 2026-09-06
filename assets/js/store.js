/* ═══════════════════════════════════════════════
   VFStore · camada de dados dos portais
   ───────────────────────────────────────────────
   API única e assíncrona com dois modos:

   - "api": conversa com o servidor (server/server.js)
     — dados compartilhados entre dispositivos.
   - "local": persiste em localStorage — modo
     demonstração para hospedagem estática.

   O modo é detectado em VFStore.init(): se
   GET {API_URL}/api/health responder, usa a API;
   caso contrário, cai no modo local. As telas só
   conhecem esta interface.
   ═══════════════════════════════════════════════ */

const VFStore = (() => {
  const NS = "vf:";

  const lread = (key, fallback) => {
    try {
      const raw = localStorage.getItem(NS + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  };
  const lwrite = (key, value) => localStorage.setItem(NS + key, JSON.stringify(value));
  const lremove = (key) => localStorage.removeItem(NS + key);

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  async function sha256(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /* ── Utilidades de data ───────────────────── */

  const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

  const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  function formatDate(dateStr) {
    const d = new Date(dateStr + "T12:00:00");
    return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  }

  const DEFAULT_AVAILABILITY = {
    1: ["09:00", "10:00", "11:00", "14:00", "15:00", "19:00", "20:00"],
    2: ["09:00", "10:00", "11:00", "14:00", "15:00", "19:00", "20:00"],
    3: ["09:00", "10:00", "11:00", "14:00", "15:00", "19:00", "20:00"],
    4: ["09:00", "10:00", "11:00", "14:00", "15:00", "19:00", "20:00"],
    5: ["09:00", "10:00", "11:00", "14:00", "15:00"],
  };

  /* ══════════ ADAPTADOR LOCAL ══════════ */

  const local = {
    async signup({ nome, email, tel, senha }) {
      const list = lread("patients", []);
      email = email.trim().toLowerCase();
      if (!nome.trim() || !email || senha.length < 6) {
        throw new Error("Preencha nome, e-mail e uma senha com pelo menos 6 caracteres.");
      }
      if (list.some((p) => p.email === email)) throw new Error("Já existe uma conta com este e-mail.");
      const patient = {
        id: uid(), nome: nome.trim(), email, tel: tel.trim(),
        senhaHash: await sha256(senha), criadoEm: new Date().toISOString(),
        // modo demonstração não manda e-mail de verdade — não faz sentido travar aqui
        emailVerificado: true,
      };
      list.push(patient);
      lwrite("patients", list);
      lwrite("session", { patientId: patient.id });
      return patient;
    },

    async login(email, senha) {
      const patient = lread("patients", []).find((p) => p.email === email.trim().toLowerCase());
      if (!patient || patient.senhaHash !== (await sha256(senha))) {
        throw new Error("E-mail ou senha incorretos.");
      }
      lwrite("session", { patientId: patient.id });
      return patient;
    },

    async logout() { lremove("session"); },

    async me() {
      const session = lread("session", null);
      return session ? lread("patients", []).find((p) => p.id === session.patientId) || null : null;
    },

    async resendVerification() { /* nada a fazer no modo demonstração */ },

    async adminConfigured() { return Boolean(lread("adminPass", null)); },
    async adminSetup(senha) {
      if (senha.length < 6) throw new Error("Use uma senha com pelo menos 6 caracteres.");
      lwrite("adminPass", await sha256(senha));
      lwrite("adminSession", true);
    },
    async adminLogin(senha) {
      if (lread("adminPass", null) !== (await sha256(senha))) throw new Error("Senha incorreta.");
      lwrite("adminSession", true);
    },
    async adminLogged() { return lread("adminSession", false) === true; },
    async adminLogout() { lremove("adminSession"); },

    async availability() { return lread("availability", DEFAULT_AVAILABILITY); },
    async setAvailability(map) { lwrite("availability", map); },

    async availabilityExceptions() { return lread("exceptions", []); },
    async setAvailabilityException(data, hours) {
      const list = lread("exceptions", []).filter((e) => e.data !== data);
      list.push({ data, hours });
      lwrite("exceptions", list);
    },
    async removeAvailabilityException(data) {
      lwrite("exceptions", lread("exceptions", []).filter((e) => e.data !== data));
    },

    async slotsFor(dateStr) {
      const exc = lread("exceptions", []).find((e) => e.data === dateStr);
      const base = exc ? exc.hours : (await this.availability())[new Date(dateStr + "T12:00:00").getDay()] || [];
      const taken = lread("appointments", [])
        .filter((a) => a.data === dateStr && a.status !== "cancelada")
        .map((a) => a.hora);
      return base.filter((h) => !taken.includes(h));
    },

    async myAppointments() {
      const me = await this.me();
      return me ? lread("appointments", []).filter((a) => a.patientId === me.id) : [];
    },

    async allAppointments() {
      const patients = lread("patients", []);
      return lread("appointments", []).map((a) => {
        const p = patients.find((x) => x.id === a.patientId);
        return { ...a, patient: p ? { id: p.id, nome: p.nome, email: p.email, tel: p.tel } : null };
      });
    },

    async book(data, hora) {
      const me = await this.me();
      if (!(await this.slotsFor(data)).includes(hora)) {
        throw new Error("Este horário acabou de ser ocupado. Escolha outro, por favor.");
      }
      const list = lread("appointments", []);
      const appointment = { id: uid(), patientId: me.id, data, hora, status: "pendente", criadoEm: new Date().toISOString() };
      list.push(appointment);
      lwrite("appointments", list);
      return appointment;
    },

    async setStatus(id, status) {
      const list = lread("appointments", []);
      const appointment = list.find((a) => a.id === id);
      if (appointment) { appointment.status = status; lwrite("appointments", list); }
    },

    async myThread() {
      const me = await this.me();
      return me ? lread("messages", []).filter((m) => m.patientId === me.id) : [];
    },
    async sendMyMessage(texto) {
      const me = await this.me();
      texto = texto.trim();
      if (!me || !texto) return;
      const list = lread("messages", []);
      list.push({ id: uid(), patientId: me.id, de: "paciente", texto, em: new Date().toISOString(), lida: false });
      lwrite("messages", list);
    },
    async markMyRead() {
      const me = await this.me();
      if (!me) return;
      const list = lread("messages", []);
      list.forEach((m) => { if (m.patientId === me.id && m.de === "psicologa") m.lida = true; });
      lwrite("messages", list);
    },

    async allMessages() { return lread("messages", []); },
    async sendTo(patientId, texto) {
      texto = texto.trim();
      if (!texto) return;
      const list = lread("messages", []);
      list.push({ id: uid(), patientId, de: "psicologa", texto, em: new Date().toISOString(), lida: false });
      lwrite("messages", list);
    },
    async markReadFor(patientId) {
      const list = lread("messages", []);
      list.forEach((m) => { if (m.patientId === patientId && m.de === "paciente") m.lida = true; });
      lwrite("messages", list);
    },

    async patientsList() {
      return lread("patients", []).map((p) => ({ id: p.id, nome: p.nome, email: p.email, tel: p.tel }));
    },

    async updatePatient(id, data) {
      const list = lread("patients", []);
      const patient = list.find((p) => p.id === id);
      if (!patient) throw new Error("Paciente não encontrado.");
      if (list.some((p) => p.id !== id && p.email === data.email)) throw new Error("Já existe outro paciente com este e-mail.");
      Object.assign(patient, { nome: data.nome, email: data.email, tel: data.tel });
      lwrite("patients", list);
      return { id: patient.id, nome: patient.nome, email: patient.email, tel: patient.tel };
    },

    async exportPatientsCsv() {
      const rows = [["Nome", "E-mail", "WhatsApp", "Cadastro"]];
      lread("patients", []).forEach((p) => rows.push([p.nome, p.email, p.tel, new Date(p.criadoEm).toLocaleDateString("pt-BR")]));
      return csvBlob(rows);
    },
    async exportAppointmentsCsv() {
      const patients = lread("patients", []);
      const rows = [["Data", "Horário", "Status", "Paciente", "E-mail", "WhatsApp"]];
      lread("appointments", []).forEach((a) => {
        const p = patients.find((x) => x.id === a.patientId);
        rows.push([a.data, a.hora, a.status, p ? p.nome : "", p ? p.email : "", p ? p.tel : ""]);
      });
      return csvBlob(rows);
    },
  };

  function csvBlob(rows) {
    const esc = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const body = "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
    return new Blob([body], { type: "text/csv;charset=utf-8" });
  }

  /* ══════════ ADAPTADOR API ══════════ */

  let apiBase = "";

  async function call(pathname, { method = "GET", body, admin = false } = {}) {
    const headers = { "Content-Type": "application/json" };
    const token = lread(admin ? "atoken" : "ptoken", null);
    if (token) headers.Authorization = "Bearer " + token;
    let response;
    try {
      response = await fetch(apiBase + pathname, {
        method, headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new Error("Sem conexão com o servidor. Tente novamente.");
    }
    let data = null;
    try { data = await response.json(); } catch {}
    if (!response.ok) {
      if (response.status === 401) lremove(admin ? "atoken" : "ptoken");
      throw new Error((data && data.error) || "Algo deu errado. Tente novamente.");
    }
    return data;
  }

  const api = {
    async signup(dados) {
      const { token, patient } = await call("/api/signup", { method: "POST", body: dados });
      lwrite("ptoken", token);
      return patient;
    },
    async login(email, senha) {
      const { token, patient } = await call("/api/login", { method: "POST", body: { email, senha } });
      lwrite("ptoken", token);
      return patient;
    },
    async logout() { lremove("ptoken"); },
    async me() {
      if (!lread("ptoken", null)) return null;
      try { return await call("/api/me"); } catch { return null; }
    },
    async resendVerification() { return call("/api/resend-verification", { method: "POST" }); },

    async adminConfigured() { return (await call("/api/admin/status")).configured; },
    async adminSetup(senha) {
      const { token } = await call("/api/admin/setup", { method: "POST", body: { senha } });
      lwrite("atoken", token);
    },
    async adminLogin(senha) {
      const { token } = await call("/api/admin/login", { method: "POST", body: { senha } });
      lwrite("atoken", token);
    },
    async adminLogged() {
      if (!lread("atoken", null)) return false;
      try { await call("/api/admin/me", { admin: true }); return true; } catch { return false; }
    },
    async adminLogout() { lremove("atoken"); },

    async availability() { return call("/api/availability"); },
    async setAvailability(map) { return call("/api/availability", { method: "PUT", body: { availability: map }, admin: true }); },
    async availabilityExceptions() { return call("/api/availability/exceptions"); },
    async setAvailabilityException(data, hours) {
      return call("/api/availability/exceptions", { method: "PUT", body: { data, hours }, admin: true });
    },
    async removeAvailabilityException(data) {
      return call("/api/availability/exceptions/" + data, { method: "DELETE", admin: true });
    },
    async slotsFor(date) { return call("/api/slots?date=" + date); },

    async myAppointments() { return call("/api/appointments"); },
    async allAppointments() { return call("/api/appointments", { admin: true }); },
    async book(data, hora) { return call("/api/appointments", { method: "POST", body: { data, hora } }); },
    async setStatus(id, status, { admin = false } = {}) {
      return call("/api/appointments/" + id, { method: "PATCH", body: { status }, admin });
    },

    async myThread() { return call("/api/messages"); },
    async sendMyMessage(texto) { return call("/api/messages", { method: "POST", body: { texto } }); },
    async markMyRead() { return call("/api/messages/read", { method: "POST", body: {} }); },

    async allMessages() { return call("/api/messages", { admin: true }); },
    async sendTo(patientId, texto) { return call("/api/messages", { method: "POST", body: { patientId, texto }, admin: true }); },
    async markReadFor(patientId) { return call("/api/messages/read", { method: "POST", body: { patientId }, admin: true }); },

    async patientsList() { return call("/api/patients", { admin: true }); },
    async updatePatient(id, data) { return call("/api/patients/" + id, { method: "PATCH", body: data, admin: true }); },

    async exportPatientsCsv() { return fetchCsv("/api/export/patients"); },
    async exportAppointmentsCsv() { return fetchCsv("/api/export/appointments"); },
  };

  async function fetchCsv(pathname) {
    const token = lread("atoken", null);
    const response = await fetch(apiBase + pathname, { headers: token ? { Authorization: "Bearer " + token } : {} });
    if (!response.ok) throw new Error("Não foi possível exportar. Faça login novamente.");
    return response.blob();
  }

  /* ══════════ FACHADA ══════════ */

  let backend = local;
  let mode = "local";

  async function init() {
    const cfg = window.VF_CONFIG_OVERRIDE || window.VF_CONFIG || {};
    apiBase = (cfg.API_URL || "").replace(/\/$/, "");
    try {
      const response = await fetch(apiBase + "/api/health", { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        if (data && data.ok === true && data.service === "vf") {
          backend = api;
          mode = "api";
        }
      }
    } catch { /* segue no modo local */ }
    return mode;
  }

  const facade = {
    init,
    getMode: () => mode,
    todayStr, formatDate, WEEKDAYS,
  };

  // Delega cada método ao backend ativo no momento da chamada
  [
    "signup", "login", "logout", "me", "resendVerification",
    "adminConfigured", "adminSetup", "adminLogin", "adminLogged", "adminLogout",
    "availability", "setAvailability", "availabilityExceptions", "setAvailabilityException", "removeAvailabilityException", "slotsFor",
    "myAppointments", "allAppointments", "book", "setStatus",
    "myThread", "sendMyMessage", "markMyRead",
    "allMessages", "sendTo", "markReadFor",
    "patientsList", "updatePatient", "exportPatientsCsv", "exportAppointmentsCsv",
  ].forEach((name) => {
    facade[name] = (...args) => backend[name].apply(backend, args);
  });

  return facade;
})();
