/* ═══════════════════════════════════════════════
   Viviane Ferrari · interações do site
   ═══════════════════════════════════════════════ */

// Sinaliza que o JS está ativo — o efeito de reveal só se aplica com esta classe,
// garantindo que o conteúdo nunca fique invisível sem JavaScript.
document.documentElement.classList.add("js");

// Número do WhatsApp do consultório (formato internacional, só dígitos).
// Troque pelo número real: ex. "5511999999999"
const WHATSAPP_NUMBER = "5500000000000";

/* ── Header: fundo sólido ao rolar ─────────── */
const header = document.querySelector(".site-header");
const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 40);
onScroll();
window.addEventListener("scroll", onScroll, { passive: true });

/* ── Menu mobile ────────────────────────────── */
const navToggle = document.getElementById("navToggle");
const mainNav = document.getElementById("mainNav");

navToggle.addEventListener("click", () => {
  const open = mainNav.classList.toggle("is-open");
  navToggle.setAttribute("aria-expanded", String(open));
  navToggle.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
});

mainNav.querySelectorAll("a").forEach((link) =>
  link.addEventListener("click", () => {
    mainNav.classList.remove("is-open");
    navToggle.setAttribute("aria-expanded", "false");
  })
);

/* ── Reveal on scroll ───────────────────────── */
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
);

document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));

/* ── Wizard de agendamento ──────────────────── */
const wizard = document.getElementById("wizard");
const steps = [...wizard.querySelectorAll(".wizard-step")];
const bar = document.getElementById("wizardBar");
const stepCurrent = document.getElementById("stepCurrent");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const wizardNav = document.getElementById("wizardNav");
const nomeInput = document.getElementById("nome");
const summaryBox = document.getElementById("summary");
const summaryList = document.getElementById("summaryList");
const whatsappLink = document.getElementById("whatsappLink");

const TOTAL_STEPS = 3;
let current = 1;

const getChoice = (name) => {
  const checked = wizard.querySelector(`input[name="${name}"]:checked`);
  return checked ? checked.value : null;
};

const stepIsValid = () => {
  switch (current) {
    case 1: return Boolean(getChoice("motivo"));
    case 2: return Boolean(getChoice("periodo"));
    case 3: return nomeInput.value.trim().length >= 2;
    default: return true;
  }
};

const renderSummary = () => {
  const items = [
    ["Modalidade", "Online (videochamada)"],
    ["Motivo", getChoice("motivo")],
    ["Período", getChoice("periodo")],
  ].filter(([, value]) => value);

  summaryList.innerHTML = items
    .map(([label, value]) => `<li><strong>${label}</strong><span>${value}</span></li>`)
    .join("");
  summaryBox.hidden = items.length === 0;
};

const render = () => {
  steps.forEach((step) => {
    step.classList.toggle("is-active", Number(step.dataset.step) === current);
  });

  const done = current > TOTAL_STEPS;
  wizardNav.hidden = done;
  bar.style.width = `${(Math.min(current, TOTAL_STEPS) / TOTAL_STEPS) * 100}%`;
  stepCurrent.textContent = Math.min(current, TOTAL_STEPS);

  prevBtn.disabled = current === 1;
  nextBtn.disabled = !stepIsValid();
  nextBtn.textContent = current === TOTAL_STEPS ? "Concluir" : "Continuar";

  if (current === 3) renderSummary();
};

const buildWhatsAppUrl = () => {
  const nome = nomeInput.value.trim();
  const message = [
    `Olá, Viviane! Me chamo ${nome} e vim pelo site.`,
    "",
    "Gostaria de agendar uma primeira conversa (online):",
    `• Motivo: ${getChoice("motivo")}`,
    `• Melhor período: ${getChoice("periodo")}`,
    "",
    "Aguardo seu retorno. Obrigado(a)!",
  ].join("\n");

  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
};

nextBtn.addEventListener("click", () => {
  if (!stepIsValid()) return;
  current += 1;
  if (current > TOTAL_STEPS) whatsappLink.href = buildWhatsAppUrl();
  render();
  if (current > 1) wizard.scrollIntoView({ behavior: "smooth", block: "nearest" });
});

prevBtn.addEventListener("click", () => {
  if (current > 1) current -= 1;
  render();
});

wizard.addEventListener("change", render);
nomeInput.addEventListener("input", render);

nomeInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && stepIsValid()) {
    event.preventDefault();
    nextBtn.click();
  }
});

document.getElementById("restartWizard").addEventListener("click", () => {
  wizard.querySelectorAll("input[type=radio]").forEach((input) => (input.checked = false));
  nomeInput.value = "";
  current = 1;
  render();
});

render();

/* ── Ano no rodapé ──────────────────────────── */
document.getElementById("year").textContent = new Date().getFullYear();
