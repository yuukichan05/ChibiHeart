// js/main.js

import { 
  gerarEsqueletosIniciais,
  carregarAnimesRecomendados, 
  carregarAnimesRecentes, 
  carregarAnimesPorGenero 
} from './modules/inicio.js';

import { gerenciarTelaInfo } from './modules/info.js';
import { gerenciarTelaPlayer } from './modules/playerView.js';
import { inicializarPesquisa } from './modules/pesquisa.js';
import { gerenciarTelaHistorico } from './modules/historico.js';
import { renderizarContinuarAssistindo } from './modules/continuarAssistindo.js';
import { inicializarPerfil, gerenciarTelaPerfil } from './modules/perfil.js';

/* ==========================================================================
   CAPTURA GLOBAL DE IMAGENS
   Adiciona .loaded automaticamente em QUALQUER <img> assim que o download termina
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

async function processarRota() {
  const hash = window.location.hash.split("?")[0] || "#inicio";
  const views = document.querySelectorAll(".app-view");
  let rotaExiste = false;

  views.forEach((view) => {
    const ativa = `#${view.id}` === hash;
    view.classList.toggle("active", ativa);
    if (ativa) rotaExiste = true;
  });

  if (!rotaExiste) {
    document.getElementById("erro")?.classList.add("active");
  }

  document.querySelectorAll(".tab-item").forEach((tab) => {
    tab.classList.toggle("active", tab.getAttribute("href") === hash);
  });

  // Atualiza a seção "Continuar Assistindo" sempre que navegar para a Home (#inicio)
  if (hash === "#inicio" || hash === "") {
    await renderizarContinuarAssistindo();
  }

  // Executa os gerenciadores das telas da SPA
  await gerenciarTelaInfo();
  await gerenciarTelaPlayer();
  await gerenciarTelaHistorico();
  await gerenciarTelaPerfil();

  window.scrollTo(0, 0);
}

document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("btn-erro-voltar")?.addEventListener("click", () => {
    window.location.hash = "#inicio";
  });

  inicializarScrollHeader();
  gerarEsqueletosIniciais();

  // Inicializa a pesquisa, módulo de perfil e rotas
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
