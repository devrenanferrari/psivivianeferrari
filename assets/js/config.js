/* ═══════════════════════════════════════════════
   Configuração dos portais VF
   ───────────────────────────────────────────────
   API_URL:
   - "" → autodetecção: se o site estiver rodando
     pelo servidor Node (server/server.js), a API é
     encontrada na mesma origem. Em qualquer outra
     hospedagem, sem API_URL definida os portais
     caem no modo demonstração (dados salvos apenas
     no navegador).
   - URL da API hospedada à parte (nosso caso: o
     backend server/server.js publicado no Railway,
     com PostgreSQL) → dados reais e compartilhados
     entre todos os dispositivos.
   ═══════════════════════════════════════════════ */

window.VF_CONFIG = {
  API_URL: "https://api-production-303c6.up.railway.app",
};
