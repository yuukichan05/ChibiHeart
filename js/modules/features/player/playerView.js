// js/modules/features/playerView.js

import { obterAnimePorId } from "../../database/repository.js";
import { buscarTodoProgressoDB } from "../../database/db.js";
import { makeEpisodeId } from "./playerUiUtils.js";
import { limparPlayer, inicializarPlayer } from "./playerControls.js";

let todosEpisodiosAtuais = [];
let animeIdAtual = null;
let epIdAtual = null;

export async function gerenciarTelaPlayer() {
  const hash = window.location.hash;

  if (!hash.startsWith("#player")) {
    limparPlayer();
    return;
  }

  const params = new URLSearchParams(hash.split("?")[1]);
  const animeId = params.get("anime");
  const epId = params.get("ep");

  if (!animeId || !epId) return;

  try {
    const anime = await obterAnimePorId(animeId);
    if (!anime) return;

    let episodioAtual = null;
    let todosEpisodios = [];
    let temporadaAtualNome = "";

    const temporadas = Array.isArray(anime.temporadas)
      ? anime.temporadas
      : Array.isArray(anime.episodios)
        ? [{ nome: "Temporada Única", episodios: anime.episodios }]
        : [];

    let temporadaEncontrada = null;

    for (let tIdx = 0; tIdx < temporadas.length; tIdx++) {
      const temp = temporadas[tIdx];
      const eps = Array.isArray(temp.episodios) ? temp.episodios : [];

      const epAchado = eps.find((ep, eIdx) => {
        const indexEp = typeof ep.index === 'number' ? ep.index : eIdx + 1;
        const idEp = ep.id || makeEpisodeId(animeId, tIdx + 1, indexEp);
        return idEp === epId;
      });

      if (epAchado) {
        temporadaEncontrada = { temp, tIdx };
        break;
      }
    }

    if (temporadaEncontrada) {
      const { temp, tIdx } = temporadaEncontrada;
      temporadaAtualNome = temp.nome || "Temporada Única";
      const eps = Array.isArray(temp.episodios) ? temp.episodios : [];

      eps.forEach((ep, eIdx) => {
        const indexEp = typeof ep.index === 'number' ? ep.index : eIdx + 1;
        const idEp = ep.id || makeEpisodeId(animeId, tIdx + 1, indexEp);

        const epFormatado = { ...ep, index: indexEp, id: idEp, temporadaNome: temporadaAtualNome };
        todosEpisodios.push(epFormatado);

        if (idEp === epId) {
          episodioAtual = epFormatado;
        }
      });
    }

    if (!episodioAtual) return;

    todosEpisodiosAtuais = todosEpisodios;
    epIdAtual = epId;
    animeIdAtual = animeId;

    // Atualização de Metadados na Interface
    const metaTag = document.getElementById("player-meta-tag");
    const tituloEp = document.getElementById("player-titulo-ep");
    const btnVerTodos = document.getElementById("lnk-ver-todos");

    const numTemp = temporadaAtualNome.replace(/\D/g, "").padStart(2, "0") || "01";
    const numEp = String(episodioAtual.index || 1).padStart(2, "0");

    if (metaTag) metaTag.textContent = `${anime.titulo || "Anime"} T${numTemp}E${numEp}`;
    if (tituloEp) tituloEp.textContent = episodioAtual.titulo || "Episódio sem título";
    if (btnVerTodos) btnVerTodos.href = `#info?anime=${animeId}`;

    // Inicialização do Player de Vídeo e Eventos
    inicializarPlayer({
      episodioAtual,
      animeId,
      epId,
      todosEpisodios: todosEpisodiosAtuais
    });

    const indexAtual = todosEpisodios.findIndex(e => e.id === epId);
    const proximosEpisodios = todosEpisodios.slice(indexAtual + 1);

    await renderizarProximos(proximosEpisodios);

  } catch (erro) {
    console.error("Erro ao carregar dados do player:", erro);
  }
}

async function renderizarProximos(lista) {
  const container = document.getElementById("player-lista-proximos");
  const template = document.getElementById("modelo-card-player");

  if (!container || !template) return;

  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  if (!Array.isArray(lista) || lista.length === 0) {
    const p = document.createElement("p");
    p.className = "badge-tag";
    p.style.marginTop = "12px";
    p.textContent = "Nenhum episódio seguinte disponível nesta temporada.";
    container.appendChild(p);
    return;
  }

  const mapaProgresso = await buscarTodoProgressoDB();
  const fragment = document.createDocumentFragment();

  lista.forEach(ep => {
    const clone = template.content.cloneNode(true);

    const img = clone.querySelector(".player-ep-thumb");
    const duracao = clone.querySelector(".player-ep-duration");
    const titulo = clone.querySelector(".player-card-title");
    const card = clone.querySelector(".card-player-ep");

    const containerBarra = clone.querySelector(".barra-progresso-container");
    const preenchimentoBarra = clone.querySelector(".barra-progresso-preenchimento");

    if (img) {
      img.src = ep.thumb || "";
      img.alt = ep.titulo || "Episódio";
    }
    if (duracao) duracao.textContent = ep.duracao || "--min";
    if (titulo) titulo.textContent = ep.titulo || "Episódio";

    if (card) {
      card.style.cursor = "pointer";
      card.dataset.epId = ep.id;
    }

    if (mapaProgresso[ep.id]) {
      const dadosEp = mapaProgresso[ep.id];
      if (dadosEp.total > 0 && dadosEp.tempo > 0) {
        const porcentagem = (dadosEp.tempo / dadosEp.total) * 100;

        if (containerBarra && preenchimentoBarra) {
          containerBarra.style.display = "block";
          preenchimentoBarra.style.width = `${Math.min(porcentagem, 100)}%`;
        }
      }
    }

    fragment.appendChild(clone);
  });

  container.appendChild(fragment);

  if (!container.dataset.hasListener) {
    container.dataset.hasListener = "true";
    container.addEventListener("click", (e) => {
      const card = e.target.closest(".card-player-ep");
      if (!card) return;

      e.preventDefault();
      const epId = card.dataset.epId;
      if (epId && animeIdAtual) {
        const novaUrl = `${window.location.pathname}#player?anime=${animeIdAtual}&ep=${epId}`;
        window.location.replace(novaUrl);
      }
    });
  }
}
