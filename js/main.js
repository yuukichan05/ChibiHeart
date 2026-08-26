import { 
  gerarEsqueletosIniciais,
  carregarAnimesRecomendados, 
  carregarAnimesRecentes, 
  carregarAnimesPorGenero 
} from './modules/features/inicio.js';

import { gerenciarTelaInfo } from './modules/features/index-detalhes.js';
import { gerenciarTelaPlayer, verificarESincronizarAoSairDoPlayer } from './modules/features/index-player.js';
import { inicializarPesquisa } from './modules/features/pesquisa.js';
import { gerenciarTelaHistorico } from './modules/features/historico.js';
import { renderizarContinuarAssistindo } from './modules/features/continuarAssistindo.js';
import { inicializarPerfil, gerenciarTelaPerfil } from './modules/features/perfil.js';
import { inicializarConta, autoSincronizarGithub } from './modules/features/conta.js';
import { gerenciarTelaNotificacoes, atualizarBadgeNotificacao } from './modules/features/notificacoes.js';

/* ==========================================================================
   CAPTURA GLOBAL DE IMAGENS
   ========================================================================== */
document.addEventListener('load', (event) => {
  if (event.target && event.target.tagName === 'IMG') {
    event.target.classList.add('loaded');
  }
}, true);

function inicializarScrollHeader() {
  const header = document.querySelector(".main-header");

  window.addEventListener("scroll", () => {
    if (window.scrollY > 20) {
      header?.classList.add("scrolled");
    } else {
      header?.classList.remove("scrolled");
    }
  }, { passive: true });
}

let rotaAnterior = "";

export async function atualizarTelaAtiva() {
  const hashCompleta = window.location.hash || "#inicio";
  const novaRota = hashCompleta.split("?")[0];

  await atualizarBadgeNotificacao();

  switch (novaRota) {
    case "#inicio":
    case "":
      await renderizarContinuarAssistindo();
      break;
    case "#historico":
      await gerenciarTelaHistorico();
      break;
    case "#perfil":
      await gerenciarTelaPerfil();
      break;
    case "#notificacoes":
      await gerenciarTelaNotificacoes();
      break;
  }
}

async function processarRota() {
  const hashCompleta = window.location.hash || "#inicio";
  const novaRota = hashCompleta.split("?")[0];
  const views = document.querySelectorAll(".app-view");
  let rotaExiste = false;

  if (rotaAnterior === "#player" && novaRota !== "#player") {
    await verificarESincronizarAoSairDoPlayer();
  }

  rotaAnterior = novaRota;

  views.forEach((view) => {
    const ativa = `#${view.id}` === novaRota;
    view.classList.toggle("active", ativa);
    if (ativa) rotaExiste = true;
  });

  if (!rotaExiste) {
    document.getElementById("erro")?.classList.add("active");
  }

  document.querySelectorAll(".tab-item, .sidebar-item, .nav-item, .nav-link").forEach((navItem) => {
    navItem.classList.toggle("active", navItem.getAttribute("href") === novaRota);
  });

  switch (novaRota) {
    case "#inicio":
    case "":
      await renderizarContinuarAssistindo();
      break;
    case "#info":
      await gerenciarTelaInfo();
      break;
    case "#player":
      await gerenciarTelaPlayer();
      break;
    case "#historico":
      await gerenciarTelaHistorico();
      break;
    case "#perfil":
      await gerenciarTelaPerfil();
      break;
    case "#notificacoes":
      await gerenciarTelaNotificacoes();
      break;
  }

  window.scrollTo(0, 0);
}

document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("btn-erro-voltar")?.addEventListener("click", () => {
    window.location.hash = "#inicio";
  });

  inicializarScrollHeader();
  gerarEsqueletosIniciais();

  inicializarPesquisa();
  inicializarPerfil();
  inicializarConta();

  window.addEventListener("hashchange", processarRota);
  await processarRota();

  window.addEventListener("dadosAtualizados", async () => {
    await atualizarTelaAtiva();
  });

  window.addEventListener("focus", async () => {
    await autoSincronizarGithub();
  });

  setInterval(async () => {
    if (document.visibilityState === "visible") {
      await autoSincronizarGithub();
    }
  }, 45 * 1000);

  try {
    await Promise.all([
      carregarAnimesRecomendados(),
      carregarAnimesRecentes(),
      carregarAnimesPorGenero()
    ]);
  } catch (erro) {
    console.error("Erro ao carregar conteúdos da Home:", erro);
  }
});
