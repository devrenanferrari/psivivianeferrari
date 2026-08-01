/* ═══════════════════════════════════════════════
   Configuração dos portais VF
   ───────────────────────────────────────────────
   API_URL:
   - "" (padrão) → autodetecção: se o site estiver
     rodando pelo servidor Node (server/server.js),
     a API é encontrada na mesma origem e os dados
     passam a ser compartilhados entre todos os
     dispositivos. Em hospedagem estática (GitHub
     Pages), os portais caem no modo demonstração
     (dados salvos apenas no navegador).
   - "https://sua-api.onrender.com" → usa um
     backend hospedado à parte (o mesmo
     server/server.js publicado em Render, Railway,
     Fly.io ou uma VPS).
   ═══════════════════════════════════════════════ */

window.VF_CONFIG = {
  API_URL: "",
};
