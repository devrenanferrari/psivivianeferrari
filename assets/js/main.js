/* ═══════════════════════════════════════════════
   Viviane Ferrari · interações do site
   ═══════════════════════════════════════════════ */

// Sinaliza que o JS está ativo — o efeito de reveal só se aplica com esta classe,
// garantindo que o conteúdo nunca fique invisível sem JavaScript.
document.documentElement.classList.add("js");

// Número do WhatsApp (formato internacional, só dígitos).
const WHATSAPP_NUMBER = "5532984146528";

/* ── Header: fundo sólido ao rolar ─────────── */
const header = document.querySelector(".site-header");
let menuOpen = false;
const onScroll = () => {
  if (!menuOpen) header.classList.toggle("is-scrolled", window.scrollY > 40);
};
onScroll();
window.addEventListener("scroll", onScroll, { passive: true });

/* ── Menu mobile ────────────────────────────── */
const navToggle = document.getElementById("navToggle");
const mainNav = document.getElementById("mainNav");
let scrollLockY = 0;

// `overflow:hidden` sozinho não trava o scroll no Safari/iOS (a página ainda
// arrasta por trás do menu, "vazando" o hero e desalinhando o overlay). Fixar
// o body na posição atual é a forma que realmente funciona em iOS.
function lockScroll() {
  scrollLockY = window.scrollY;
  document.body.style.position = "fixed";
  document.body.style.top = `-${scrollLockY}px`;
  document.body.style.left = "0";
  document.body.style.width = "100%";
}

function unlockScroll() {
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.left = "";
  document.body.style.width = "";
  window.scrollTo({ top: scrollLockY, left: 0, behavior: "instant" });
}

// Com o menu aberto: trava o scroll da página por trás e mantém o cabeçalho
// sempre sólido (antes só ficava sólido se já estivesse rolado, o que deixava
// o menu "vazando" o hero por trás quando aberto no topo da página).
function setMenuOpen(open) {
  menuOpen = open;
  mainNav.classList.toggle("is-open", open);
  navToggle.setAttribute("aria-expanded", String(open));
  navToggle.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
  document.documentElement.classList.toggle("menu-open", open);
  if (open) {
    lockScroll();
    header.classList.add("is-scrolled");
  } else {
    unlockScroll();
    onScroll();
  }
}

navToggle.addEventListener("click", () => setMenuOpen(!menuOpen));

mainNav.querySelectorAll("a").forEach((link) =>
  link.addEventListener("click", () => setMenuOpen(false))
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
  bar.style.transform = `scaleX(${Math.min(current, TOTAL_STEPS) / TOTAL_STEPS})`;
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
