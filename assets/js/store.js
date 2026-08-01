/* ═══════════════════════════════════════════════
   VFStore · camada de dados do agendamento
   ───────────────────────────────────────────────
   Persistência em localStorage (chaves "vf:*").
   Toda a aplicação (área do paciente e painel
   admin) conversa apenas com esta API — para
   migrar a um backend real, basta reimplementar
   estas funções sobre fetch() mantendo as
   assinaturas.
   ═══════════════════════════════════════════════ */

const VFStore = (() => {
  const NS = "vf:";

  const read = (key, fallback) => {
    try {
      const raw = localStorage.getItem(NS + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  };
  const write = (key, value) => localStorage.setItem(NS + key, JSON.stringify(value));
  const remove = (key) => localStorage.removeItem(NS + key);

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  async function hash(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /* ── Pacientes e sessão ───────────────────── */

  const patients = () => read("patients", []);

  async function signup({ nome, email, tel, senha }) {
    const list = patients();
    email = email.trim().toLowerCase();
    if (!nome.trim() || !email || senha.length < 6) {
      throw new Error("Preencha nome, e-mail e uma senha com pelo menos 6 caracteres.");
    }
    if (list.some((p) => p.email === email)) {
      throw new Error("Já existe uma conta com este e-mail.");
    }
    const patient = {
      id: uid(),
      nome: nome.trim(),
      email,
      tel: tel.trim(),
      senhaHash: await hash(senha),
      criadoEm: new Date().toISOString(),
    };
    list.push(patient);
    write("patients", list);
    write("session", { patientId: patient.id });
    return patient;
  }

  async function login(email, senha) {
    const patient = patients().find((p) => p.email === email.trim().toLowerCase());
    if (!patient || patient.senhaHash !== (await hash(senha))) {
      throw new Error("E-mail ou senha incorretos.");
    }
    write("session", { patientId: patient.id });
    return patient;
  }

  const logout = () => remove("session");

  const currentPatient = () => {
    const session = read("session", null);
    return session ? patients().find((p) => p.id === session.patientId) || null : null;
  };

  /* ── Admin ────────────────────────────────── */

  const adminConfigured = () => Boolean(read("adminPass", null));

  async function adminSetup(senha) {
    if (senha.length < 6) throw new Error("Use uma senha com pelo menos 6 caracteres.");
    write("adminPass", await hash(senha));
    write("adminSession", true);
  }

  async function adminLogin(senha) {
    if (read("adminPass", null) !== (await hash(senha))) throw new Error("Senha incorreta.");
    write("adminSession", true);
  }

  const adminLogged = () => read("adminSession", false) === true;
  const adminLogout = () => remove("adminSession");

  /* ── Disponibilidade ──────────────────────── */
  /* Mapa dia-da-semana (0=dom … 6=sáb) → horários livres do modelo semanal. */

  const DEFAULT_AVAILABILITY = {
    1: ["09:00", "10:00", "11:00", "14:00", "15:00", "19:00", "20:00"],
    2: ["09:00", "10:00", "11:00", "14:00", "15:00", "19:00", "20:00"],
    3: ["09:00", "10:00", "11:00", "14:00", "15:00", "19:00", "20:00"],
    4: ["09:00", "10:00", "11:00", "14:00", "15:00", "19:00", "20:00"],
    5: ["09:00", "10:00", "11:00", "14:00", "15:00"],
  };

  const availability = () => read("availability", DEFAULT_AVAILABILITY);
  const setAvailability = (map) => write("availability", map);

  /* ── Agendamentos ─────────────────────────── */

  const appointments = () => read("appointments", []);
  const saveAppointments = (list) => write("appointments", list);

  const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  function slotsFor(dateStr) {
    const weekday = new Date(dateStr + "T12:00:00").getDay();
    const base = availability()[weekday] || [];
    const taken = appointments()
      .filter((a) => a.data === dateStr && a.status !== "cancelada")
      .map((a) => a.hora);
    return base.filter((h) => !taken.includes(h));
  }

  function book(patientId, data, hora) {
    if (!slotsFor(data).includes(hora)) {
      throw new Error("Este horário acabou de ser ocupado. Escolha outro, por favor.");
    }
    const list = appointments();
    const appointment = {
      id: uid(),
      patientId,
      data,
      hora,
      status: "pendente",
      criadoEm: new Date().toISOString(),
    };
    list.push(appointment);
    saveAppointments(list);
    return appointment;
  }

  function setAppointmentStatus(id, status) {
    const list = appointments();
    const appointment = list.find((a) => a.id === id);
    if (appointment) {
      appointment.status = status;
      saveAppointments(list);
    }
  }

  /* ── Mensagens ────────────────────────────── */
  /* Uma thread por paciente; "de" é "paciente" ou "psicologa". */

  const messages = () => read("messages", []);

  function sendMessage(patientId, de, texto) {
    texto = texto.trim();
    if (!texto) return;
    const list = messages();
    list.push({ id: uid(), patientId, de, texto, em: new Date().toISOString(), lida: false });
    write("messages", list);
  }

  function threadFor(patientId) {
    return messages().filter((m) => m.patientId === patientId);
  }

  function unreadCount(patientId, para) {
    return threadFor(patientId).filter((m) => m.de !== para && !m.lida).length;
  }

  function markThreadRead(patientId, leitor) {
    const list = messages();
    list.forEach((m) => {
      if (m.patientId === patientId && m.de !== leitor) m.lida = true;
    });
    write("messages", list);
  }

  /* ── Utilidades de data ───────────────────── */

  const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

  function formatDate(dateStr) {
    const d = new Date(dateStr + "T12:00:00");
    return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  }

  return {
    uid, hash,
    patients, signup, login, logout, currentPatient,
    adminConfigured, adminSetup, adminLogin, adminLogged, adminLogout,
    availability, setAvailability,
    appointments, slotsFor, book, setAppointmentStatus, todayStr,
    messages, sendMessage, threadFor, unreadCount, markThreadRead,
    formatDate, WEEKDAYS,
  };
})();
