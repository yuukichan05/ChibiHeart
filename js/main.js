import { 
  gerarEsqueletosIniciais,
  carregarAnimesRecomendados, 
  carregarAnimesRecentes, 
  carregarAnimesPorGenero 
} from './modules/inicio.js';

import { gerenciarTelaInfo } from './modules/info.js';
import { gerenciarTelaPlayer } from './modules/playerView.js';
import { inicializarPesquisa } from './modules/pesquisa.js';

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

  await gerenciarTelaInfo();
  await gerenciarTelaPlayer();

  window.scrollTo(0, 0);
}

document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("btn-erro-voltar")?.addEventListener("click", () => {
    window.location.hash = "#inicio";
  });

  inicializarScrollHeader();

  // Execução síncrona imediata para exibir a estrutura visual enquanto o JSON carrega
  gerarEsqueletosIniciais();

  try {
    await Promise.all([
      carregarAnimesRecomendados(),
      carregarAnimesRecentes(),
      carregarAnimesPorGenero()
    ]);
    inicializarPesquisa();

    window.addEventListener("hashchange", processarRota);
    await processarRota();

  } catch (erro) {
    console.error("Erro crítico na inicialização:", erro);
  }
});
