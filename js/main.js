// js/main.js

import { 
  gerarEsqueletosIniciais,
  carregarAnimesRecomendados, 
  carregarAnimesRecentes, 
  carregarAnimesPorGenero 
} from './modules/inicio.js';

import { gerenciarTelaInfo } from './modules/info.js';
import { gerenciarTelaPlayer, verificarESincronizarAoSairDoPlayer } from './modules/playerView.js';
import { inicializarPesquisa } from './modules/pesquisa.js';
import { gerenciarTelaHistorico } from './modules/historico.js';
import { renderizarContinuarAssistindo } from './modules/continuarAssistindo.js';
import { inicializarPerfil, gerenciarTelaPerfil } from './modules/perfil.js';
import { gerenciarTelaNotificacoes } from './modules/notificacoes.js';

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

// Armazena a rota anterior para saber se o usuário está SAINDO do Player
let rotaAnterior = "";

async function processarRota() {
  const hashCompleta = window.location.hash || "#inicio";
  const novaRota = hashCompleta.split("?")[0];
  const views = document.querySelectorAll(".app-view");
  let rotaExiste = false;

  // 1. Verifica se está saindo do Player e executa a verificação
  if (rotaAnterior === "#player" && novaRota !== "#player") {
    await verificarESincronizarAoSairDoPlayer();
  }

  // Atualiza a rota anterior
  rotaAnterior = novaRota;

  // 2. Alterna visibilidade das Views
  views.forEach((view) => {
    const ativa = `#${view.id}` === novaRota;
    view.classList.toggle("active", ativa);
    if (ativa) rotaExiste = true;
  });

  if (!rotaExiste) {
    document.getElementById("erro")?.classList.add("active");
  }

  document.querySelectorAll(".tab-item").forEach((tab) => {
    tab.classList.toggle("active", tab.getAttribute("href") === novaRota);
  });

  // 3. ROTEAMENTO ESPECÍFICO (Executa APENAS a tela ativa, sem disparar sincronizações das outras)
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

  // Inicializa a pesquisa, módulo de perfil e eventos de rota
  inicializarPesquisa();
  inicializarPerfil();

  window.addEventListener("hashchange", processarRota);
  await processarRota();

  // Carrega as fileiras adicionais da Home em segundo plano
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
