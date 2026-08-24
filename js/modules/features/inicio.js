import { 
  obterInfoCompleta, 
  obterRecomendados, 
  obterRecentes 
} from '../database/repository.js'; //[cite: 1]

// Observer Bidirecional: Gerencia pré-carregamento em RAM e desalocação dinâmica
const cardObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    const card = entry.target;
    const img = card.querySelector('img');

    if (!img) return;

    if (entry.isIntersecting) {
      const urlCapa = img.dataset.src;

      // Restaura a imagem e pré-carrega na memória RAM antes de exibir
      if (urlCapa && !img.src) {
        const imgBuffer = new Image();
        imgBuffer.src = urlCapa;

        // Dispara o render na tela apenas quando o buffer estiver 100% pronto na RAM
        imgBuffer.onload = () => {
          if (card.parentElement) {
            img.src = urlCapa;
            img.classList.add('loaded'); // Exibe a imagem de uma vez só via CSS
          }
        };

        imgBuffer.onerror = () => {
          img.removeAttribute('src');
          img.classList.remove('loaded');
        };
      }
    } else {
      // SAÍDA DA TELA: Preserva a URL e desaloca a memória RAM do navegador
      if (img.src) {
        img.dataset.src = img.src;
        img.removeAttribute('src'); // Força o descarte imediato do buffer de imagem[cite: 1]
        img.classList.remove('loaded'); // Mantém o elemento oculto sem exibir o alt
      }
    }
  });
}, {
  root: null,
  rootMargin: '300px 0px', // Carrega 300px antes de entrar no viewport[cite: 1]
  threshold: 0
});

// Auxiliar para gerar string de esqueletos temporários[cite: 1]
function criarEsqueletosHTML(quantidade = 6) { //[cite: 1]
  let html = '';
  for (let i = 0; i < quantidade; i++) {
    html += `
      <div class="card poster skeleton">
        <div class="card-media skeleton-shimmer"></div>
        <div class="card-title skeleton-text"></div>
      </div>`; //[cite: 1]
  }
  return html; //[cite: 1]
}

/**
 * 1. Gera esqueletos instantaneamente em todas as seções e injeta categorias
 * genéricas temporárias para simular a altura total e a barra de rolagem da página.
 */
export function gerarEsqueletosIniciais() { //[cite: 1]
  const gradeRecentes = document.getElementById("grade-recentes"); //[cite: 1]
  const gradeRecomendados = document.getElementById("grade-recomendados"); //[cite: 1]
  const containerInicio = document.getElementById("inicio"); //[cite: 1]
  const modeloSecao = document.getElementById("modelo-secao-genero"); //[cite: 1]

  if (gradeRecentes) gradeRecentes.innerHTML = criarEsqueletosHTML(6); //[cite: 1]
  if (gradeRecomendados) gradeRecomendados.innerHTML = criarEsqueletosHTML(6); //[cite: 1]

  if (containerInicio && modeloSecao) { //[cite: 1]
    containerInicio.querySelectorAll(".secao-genero-placeholder").forEach(el => el.remove()); //[cite: 1]

    for (let i = 0; i < 4; i++) { //[cite: 1]
      const cloneSecao = modeloSecao.content.cloneNode(true); //[cite: 1]
      const secao = cloneSecao.querySelector(".secao-genero-container"); //[cite: 1]
      if (secao) { //[cite: 1]
        secao.classList.add("secao-genero-placeholder"); //[cite: 1]
        secao.querySelector(".titulo-categoria").textContent = "Carregando..."; //[cite: 1]
        secao.querySelector(".cards-grid").innerHTML = criarEsqueletosHTML(6); //[cite: 1]
        containerInicio.appendChild(cloneSecao); //[cite: 1]
      }
    }
  }
}

/**
 * Cria o elemento do card real armazenando a imagem em `data-src` e vincula ao observer[cite: 1]
 */
function criarElementoCard(animeId, anime, modelo) { //[cite: 1]
  const clone = modelo.content.cloneNode(true); //[cite: 1]
  const linkCard = clone.querySelector("a"); //[cite: 1]
  const imgCard = clone.querySelector("img"); //[cite: 1]
  const tituloCard = clone.querySelector(".card-title"); //[cite: 1]

  if (linkCard && imgCard && tituloCard) { //[cite: 1]
    linkCard.href = `#info?anime=${animeId}`; //[cite: 1]
    tituloCard.textContent = anime.titulo || animeId; //[cite: 1]
    imgCard.alt = `Capa de ${anime.titulo || animeId}`; //[cite: 1]
    
    // Configura a URL no dataset e remove o src para adiar o download até a entrada na viewport
    imgCard.dataset.src = anime.poster || anime.banner || ""; //[cite: 1]
    imgCard.removeAttribute("src"); //[cite: 1]

    cardObserver.observe(linkCard); //[cite: 1]
  }

  return clone; //[cite: 1]
}

/**
 * Carrega animes Recomendados[cite: 1]
 */
export async function carregarAnimesRecomendados() { //[cite: 1]
  const grade = document.getElementById("grade-recomendados"); //[cite: 1]
  const modelo = document.getElementById("modelo-card-anime"); //[cite: 1]
  if (!grade || !modelo) return; //[cite: 1]

  try {
    const [listaIds, infoCompleta] = await Promise.all([ //[cite: 1]
      obterRecomendados(), //[cite: 1]
      obterInfoCompleta() //[cite: 1]
    ]);

    if (!listaIds || !infoCompleta || listaIds.length === 0) return; //[cite: 1]

    grade.replaceChildren(); //[cite: 1]

    listaIds.forEach((item) => { //[cite: 1]
      const anime = infoCompleta[item.id]; //[cite: 1]
      if (anime) { //[cite: 1]
        grade.appendChild(criarElementoCard(item.id, anime, modelo)); //[cite: 1]
      }
    });
  } catch (erro) {
    console.error("❌ [Recomendados] Falha crítica:", erro); //[cite: 1]
  }
}

/**
 * Carrega animes Recentes[cite: 1]
 */
export async function carregarAnimesRecentes() { //[cite: 1]
  const grade = document.getElementById("grade-recentes"); //[cite: 1]
  const modelo = document.getElementById("modelo-card-anime"); //[cite: 1]
  if (!grade || !modelo) return; //[cite: 1]

  try {
    const [listaIds, infoCompleta] = await Promise.all([ //[cite: 1]
      obterRecentes(), //[cite: 1]
      obterInfoCompleta() //[cite: 1]
    ]);

    if (!listaIds || !infoCompleta || !Array.isArray(listaIds) || listaIds.length === 0) return; //[cite: 1]

    grade.replaceChildren(); //[cite: 1]

    listaIds.forEach((item) => { //[cite: 1]
      const anime = infoCompleta[item.id]; //[cite: 1]
      if (anime) { //[cite: 1]
        grade.appendChild(criarElementoCard(item.id, anime, modelo)); //[cite: 1]
      }
    });
  } catch (erro) {
    console.error("❌ [Recentes] Falha ao carregar:", erro); //[cite: 1]
  }
}

/**
 * Carrega Seções por Gênero substituindo os esqueletos genéricos[cite: 1]
 */
export async function carregarAnimesPorGenero() { //[cite: 1]
  const containerPrincipal = document.getElementById("inicio"); //[cite: 1]
  const modeloSecao = document.getElementById("modelo-secao-genero"); //[cite: 1]
  const modeloCard = document.getElementById("modelo-card-anime"); //[cite: 1]

  if (!containerPrincipal || !modeloSecao || !modeloCard) return; //[cite: 1]

  try {
    const infoCompleta = await obterInfoCompleta(); //[cite: 1]
    if (!infoCompleta) return; //[cite: 1]

    containerPrincipal.querySelectorAll(".secao-genero-placeholder").forEach(el => el.remove()); //[cite: 1]
    containerPrincipal.querySelectorAll(".secao-genero-container:not(.secao-genero-placeholder)").forEach(el => el.remove()); //[cite: 1]

    const setGeneros = new Set(); //[cite: 1]
    Object.values(infoCompleta).forEach(anime => { //[cite: 1]
      if (Array.isArray(anime.generos)) { //[cite: 1]
        anime.generos.forEach(g => setGeneros.add(g)); //[cite: 1]
      }
    });

    const listaGeneros = embaralharLista(Array.from(setGeneros)); //[cite: 1]

    listaGeneros.forEach(generoAlvo => { //[cite: 1]
      const cloneSecao = modeloSecao.content.cloneNode(true); //[cite: 1]
      const tituloSecao = cloneSecao.querySelector(".titulo-categoria"); //[cite: 1]
      const gradeCards = cloneSecao.querySelector(".cards-grid"); //[cite: 1]

      if (!tituloSecao || !gradeCards) return; //[cite: 1]

      tituloSecao.textContent = generoAlvo; //[cite: 1]
      const animesEmbaralhados = embaralharLista(Object.keys(infoCompleta)); //[cite: 1]

      animesEmbaralhados.forEach(animeId => { //[cite: 1]
        const anime = infoCompleta[animeId]; //[cite: 1]
        if (anime.generos && anime.generos.includes(generoAlvo)) { //[cite: 1]
          gradeCards.appendChild(criarElementoCard(animeId, anime, modeloCard)); //[cite: 1]
        }
      });

      if (gradeCards.children.length > 0) { //[cite: 1]
        containerPrincipal.appendChild(cloneSecao); //[cite: 1]
      }
    });
  } catch (erro) {
    console.error("❌ [Gêneros] Falha crítica:", erro); //[cite: 1]
  }
}

function embaralharLista(array) { //[cite: 1]
  let copia = [...array]; //[cite: 1]
  for (let i = copia.length - 1; i > 0; i--) { //[cite: 1]
    const j = Math.floor(Math.random() * (i + 1)); //[cite: 1]
    [copia[i], copia[j]] = [copia[j], copia[i]]; //[cite: 1]
  }
  return copia; //[cite: 1]
}
