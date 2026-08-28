// js/features/inicio.js

import { 
  obterInfoCompleta, 
  obterRecomendados, 
  obterRecentes 
} from '../data/database/repository.js';
import { observarImagem } from '../core/imageObserver.js';

// Auxiliar para gerar string de esqueletos temporários
function criarEsqueletosHTML(quantidade = 6) {
  let html = '';
  for (let i = 0; i < quantidade; i++) {
    html += `
      <div class="card poster skeleton">
        <div class="card-media skeleton-shimmer"></div>
        <div class="card-title skeleton-text"></div>
      </div>`;
  }
  return html;
}

/**
 * 1. Gera esqueletos instantaneamente em todas as seções e injeta categorias
 * genéricas temporárias para simular a altura total e a barra de rolagem da página.
 */
export function gerarEsqueletosIniciais() {
  const gradeRecentes = document.getElementById("grade-recentes");
  const gradeRecomendados = document.getElementById("grade-recomendados");
  const containerInicio = document.getElementById("inicio");
  const modeloSecao = document.getElementById("modelo-secao-genero");

  if (gradeRecentes) gradeRecentes.innerHTML = criarEsqueletosHTML(6);
  if (gradeRecomendados) gradeRecomendados.innerHTML = criarEsqueletosHTML(6);

  if (containerInicio && modeloSecao) {
    containerInicio.querySelectorAll(".secao-genero-placeholder").forEach(el => el.remove());

    for (let i = 0; i < 4; i++) {
      const cloneSecao = modeloSecao.content.cloneNode(true);
      const secao = cloneSecao.querySelector(".secao-genero-container");
      if (secao) {
        secao.classList.add("secao-genero-placeholder");
        secao.querySelector(".titulo-categoria").textContent = "Carregando...";
        secao.querySelector(".cards-grid").innerHTML = criarEsqueletosHTML(6);
        containerInicio.appendChild(cloneSecao);
      }
    }
  }
}

/**
 * Cria o elemento do card real armazenando a imagem em `data-src` e vincula ao observer centralizado
 */
function criarElementoCard(animeId, anime, modelo) {
  const clone = modelo.content.cloneNode(true);
  const linkCard = clone.querySelector("a");
  const imgCard = clone.querySelector("img");
  const tituloCard = clone.querySelector(".card-title");

  if (linkCard && imgCard && tituloCard) {
    linkCard.href = `#info?anime=${animeId}`;
    tituloCard.textContent = anime.titulo || animeId;
    imgCard.alt = `Capa de ${anime.titulo || animeId}`;
    
    const urlCapa = anime.poster || anime.banner || "";

    if (urlCapa) {
      imgCard.dataset.src = urlCapa;
      imgCard.classList.remove('loaded');
      
      // Vincula o elemento da imagem diretamente ao observer centralizado do core
      observarImagem(imgCard);
    }
  }

  return clone;
}

/**
 * Carrega animes Recomendados
 */
export async function carregarAnimesRecomendados() {
  const grade = document.getElementById("grade-recomendados");
  const modelo = document.getElementById("modelo-card-anime");
  if (!grade || !modelo) return;

  try {
    const [listaIds, infoCompleta] = await Promise.all([
      obterRecomendados(),
      obterInfoCompleta()
    ]);

    if (!listaIds || !infoCompleta || listaIds.length === 0) return;

    grade.replaceChildren();

    listaIds.forEach((item) => {
      const anime = infoCompleta[item.id];
      if (anime) {
        grade.appendChild(criarElementoCard(item.id, anime, modelo));
      }
    });
  } catch (erro) {
    console.error("❌ [Recomendados] Falha crítica:", erro);
  }
}

/**
 * Carrega animes Recentes
 */
export async function carregarAnimesRecentes() {
  const grade = document.getElementById("grade-recentes");
  const modelo = document.getElementById("modelo-card-anime");
  if (!grade || !modelo) return;

  try {
    const [listaIds, infoCompleta] = await Promise.all([
      obterRecentes(),
      obterInfoCompleta()
    ]);

    if (!listaIds || !infoCompleta || !Array.isArray(listaIds) || listaIds.length === 0) return;

    grade.replaceChildren();

    listaIds.forEach((item) => {
      const anime = infoCompleta[item.id];
      if (anime) {
        grade.appendChild(criarElementoCard(item.id, anime, modelo));
      }
    });
  } catch (erro) {
    console.error("❌ [Recentes] Falha ao carregar:", erro);
  }
}

/**
 * Carrega Seções por Gênero substituindo os esqueletos genéricos
 */
export async function carregarAnimesPorGenero() {
  const containerPrincipal = document.getElementById("inicio");
  const modeloSecao = document.getElementById("modelo-secao-genero");
  const modeloCard = document.getElementById("modelo-card-anime");

  if (!containerPrincipal || !modeloSecao || !modeloCard) return;

  try {
    const infoCompleta = await obterInfoCompleta();
    if (!infoCompleta) return;

    containerPrincipal.querySelectorAll(".secao-genero-placeholder").forEach(el => el.remove());
    containerPrincipal.querySelectorAll(".secao-genero-container:not(.secao-genero-placeholder)").forEach(el => el.remove());

    const setGeneros = new Set();
    Object.values(infoCompleta).forEach(anime => {
      if (Array.isArray(anime.generos)) { 
        anime.generos.forEach(g => setGeneros.add(g)); 
      }
    });

    const listaGeneros = embaralharLista(Array.from(setGeneros));

    listaGeneros.forEach(generoAlvo => { 
      const cloneSecao = modeloSecao.content.cloneNode(true);
      const tituloSecao = cloneSecao.querySelector(".titulo-categoria");
      const gradeCards = cloneSecao.querySelector(".cards-grid");

      if (!tituloSecao || !gradeCards) return;

      tituloSecao.textContent = generoAlvo;
      const animesEmbaralhados = embaralharLista(Object.keys(infoCompleta));

      animesEmbaralhados.forEach(animeId => { 
        const anime = infoCompleta[animeId]; 
        if (anime.generos && anime.generos.includes(generoAlvo)) { 
          gradeCards.appendChild(criarElementoCard(animeId, anime, modeloCard));
        }
      });

      if (gradeCards.children.length > 0) { 
        containerPrincipal.appendChild(cloneSecao); 
      }
    });
  } catch (erro) {
    console.error("❌ [Gêneros] Falha crítica:", erro); 
  }
}

function embaralharLista(array) { 
  let copia = [...array]; 
  for (let i = copia.length - 1; i > 0; i--) { 
    const j = Math.floor(Math.random() * (i + 1)); 
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}
