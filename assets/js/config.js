/* ═══════════════════════════════════════════════
   Configuração dos portais VF
   ───────────────────────────────────────────────
   O site é servido pelo próprio backend (Railway):
   server/server.js entrega tanto os arquivos
   estáticos quanto a API, sempre na mesma origem.
   Por isso API_URL fica em "" — autodetecção via
   GET /api/health na própria origem.

   Só defina uma URL aqui se o site voltar a ser
   publicado separado da API (ex.: GitHub Pages,
   Vercel) — nesse caso, sem API_URL apontando para
   o backend os portais caem no modo demonstração
   (dados salvos apenas no navegador).
   ═══════════════════════════════════════════════ */

window.VF_CONFIG = {
  API_URL: "",
};
