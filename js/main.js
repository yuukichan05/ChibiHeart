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

  // Executa os gerenciadores de view da SPA
  await gerenciarTelaInfo();
  await gerenciarTelaPlayer();
  await gerenciarTelaHistorico();

  window.scrollTo(0, 0);
}

document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("btn-erro-voltar")?.addEventListener("click", () => {
    window.location.hash = "#inicio";
  });

  inicializarScrollHeader();
  gerarEsqueletosIniciais();

  // 1. Inicializa pesquisa e rotas IMEDIATAMENTE sem bloquear a tela
  inicializarPesquisa();
  window.addEventListener("hashchange", processarRota);
  await processarRota();

  // 2. Carrega os dados das seções da home em segundo plano
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
