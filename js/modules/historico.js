// js/modules/historico.js

import { buscarTodoProgressoDB } from "./db.js";
import { obterInfoCompleta } from "./repository.js";

// Formata segundos em MM:SS ou HH:MM:SS
function formatarTempo(segundos) {
  if (isNaN(segundos) || segundos <= 0) return "00:00";
  const horas = Math.floor(segundos / 3600);
  const minutos = Math.floor((segundos % 3600) / 60);
  const seg = Math.floor(segundos % 60);

  if (horas > 0) {
    return `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}:${String(seg).padStart(2, '0')}`;
  }
  return `${String(minutos).padStart(2, '0')}:${String(seg).padStart(2, '0')}`;
}

/**
 * Busca um episódio no catálogo universalmente, sem depender de um padrão de ID engessado.
 */
function encontrarEpisodioNoCatalogo(idBuscado, infoCompleta) {
  if (!infoCompleta || !idBuscado) return null;

  for (const [idAnimeKey, anime] of Object.entries(infoCompleta)) {
    const temporadas = Array.isArray(anime.temporadas)
      ? anime.temporadas
      : Array.isArray(anime.episodios)
        ? [{ nome: "Temporada Única", episodios: anime.episodios }]
        : [];

    for (let tIdx = 0; tIdx < temporadas.length; tIdx++) {
      const temp = temporadas[tIdx];
      const eps = Array.isArray(temp.episodios) ? temp.episodios : [];

      for (let eIdx = 0; eIdx < eps.length; eIdx++) {
        const ep = eps[eIdx];
        const indexEp = typeof ep.index === "number" ? ep.index : eIdx + 1;
        const s = String(tIdx + 1).padStart(2, "0");
        const e = String(indexEp).padStart(2, "0");

        const idFallbackHifen = `${idAnimeKey}-s${s}e${e}`;
        const idFallbackUnderline = `${idAnimeKey}_s${s}e${e}`;

        if (ep.id && ep.id === idBuscado) {
          return { anime, animeId: idAnimeKey, ep, temporadaNome: temp.nome || `${tIdx + 1}ª Temporada` };
        }

        if (!ep.id && (idBuscado === idFallbackHifen || idBuscado === idFallbackUnderline)) {
          return { anime, animeId: idAnimeKey, ep, temporadaNome: temp.nome || `${tIdx + 1}ª Temporada` };
        }
      }
    }
  }

  return null;
}

/**
 * Configura os ouvintes de clique nos botões de filtro.
 */
function inicializarFiltros() {
  const botoes = document.querySelectorAll(".btn-filtro-historico");
  const secaoAssistindo = document.getElementById("secao-assistindo");
  const secaoConcluidos = document.getElementById("secao-concluidos");

  botoes.forEach((btn) => {
    btn.onclick = () => {
      const filtro = btn.getAttribute("data-filtro");

      botoes.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      if (filtro === "concluidos") {
        secaoAssistindo?.classList.add("hidden");
        secaoConcluidos?.classList.remove("hidden");
      } else {
        secaoConcluidos?.classList.add("hidden");
        secaoAssistindo?.classList.remove("hidden");
      }
    };
  });
}

export async function gerenciarTelaHistorico() {
  const hash = window.location.hash;

  if (!hash.startsWith("#historico")) return;

  const containerAssistindo = document.getElementById("grade-historico-assistindo");
  const containerConcluidos = document.getElementById("grade-historico-concluidos");
  const template = document.getElementById("modelo-card-historico");
  
  const vazioAssistindo = document.getElementById("historico-vazio-assistindo");
  const vazioConcluidos = document.getElementById("historico-vazio-concluidos");

  const badgeAssistindo = document.getElementById("qtd-assistindo");
  const badgeConcluidos = document.getElementById("qtd-concluidos");

  if (!containerAssistindo || !containerConcluidos || !template) return;

  // Garante que os eventos de clique dos filtros estejam configurados
  inicializarFiltros();

  try {
    const [mapaProgresso, infoCompleta] = await Promise.all([
      buscarTodoProgressoDB(),
      obterInfoCompleta()
    ]);

    const listaRegistros = Object.values(mapaProgresso || {});

    // Limpa as duas listas antes de renderizar
    containerAssistindo.replaceChildren();
    containerConcluidos.replaceChildren();

    if (listaRegistros.length === 0) {
      if (vazioAssistindo) vazioAssistindo.style.display = "block";
      if (vazioConcluidos) vazioConcluidos.style.display = "block";
      if (badgeAssistindo) badgeAssistindo.textContent = "0";
      if (badgeConcluidos) badgeConcluidos.textContent = "0";
      return;
    }

    // Ordena do progresso mais recente para o mais antigo
    listaRegistros.sort((a, b) => (b.atualizadoEm || 0) - (a.atualizadoEm || 0));

    const fragAssistindo = document.createDocumentFragment();
    const fragConcluidos = document.createDocumentFragment();

    let countAssistindo = 0;
    let countConcluidos = 0;

    listaRegistros.forEach((registro) => {
      if (!registro || !registro.id) return;

      const achado = encontrarEpisodioNoCatalogo(registro.id, infoCompleta);
      if (!achado) return;

      const { anime, animeId, ep, temporadaNome } = achado;

      const clone = template.content.cloneNode(true);
      const link = clone.querySelector("a");
      const img = clone.querySelector(".historico-thumb");
      const barraContainer = clone.querySelector(".barra-progresso-container");
      const barraPreenchimento = clone.querySelector(".barra-progresso-preenchimento");
      const elDuracao = clone.querySelector(".historico-duracao");
      const elMeta = clone.querySelector(".historico-anime-meta");
      const elTitulo = clone.querySelector(".historico-titulo-ep");
      const elStatus = clone.querySelector(".historico-status");

      if (link) {
        link.href = `#player?anime=${encodeURIComponent(animeId)}&ep=${encodeURIComponent(registro.id)}`;
      }

      if (img) {
        img.src = ep.thumb || anime.poster || anime.banner || "";
        img.alt = ep.titulo || anime.titulo || "Episódio";
      }

      if (elMeta) elMeta.textContent = `${anime.titulo || "Anime"} • ${temporadaNome}`;
      if (elTitulo) elTitulo.textContent = ep.titulo || `Episódio ${ep.index || ""}`;

      if (elDuracao) {
        elDuracao.textContent = ep.duracao || formatarTempo(registro.total);
      }

      // Barra de progresso visual
      if (registro.total > 0 && registro.tempo > 0) {
        const porcentagem = (registro.tempo / registro.total) * 100;
        if (barraContainer && barraPreenchimento) {
          barraContainer.style.display = "block";
          barraPreenchimento.style.width = `${Math.min(porcentagem, 100)}%`;
        }
      }

      // Separa entre Concluído e Assistindo
      if (registro.concluido) {
        countConcluidos++;
        if (elStatus) {
          elStatus.textContent = "Concluído";
          elStatus.style.color = "#4caf50";
        }
        fragConcluidos.appendChild(clone);
      } else {
        countAssistindo++;
        if (elStatus) {
          elStatus.textContent = `Resume ${formatarTempo(registro.tempo)}`;
        }
        fragAssistindo.appendChild(clone);
      }
    });

    // Anexa nas respectivas grades
    containerAssistindo.appendChild(fragAssistindo);
    containerConcluidos.appendChild(fragConcluidos);

    // Atualiza contadores dos filtros
    if (badgeAssistindo) badgeAssistindo.textContent = String(countAssistindo);
    if (badgeConcluidos) badgeConcluidos.textContent = String(countConcluidos);

    // Trata visibilidade das mensagens de estado vazio por aba
    if (vazioAssistindo) vazioAssistindo.style.display = countAssistindo === 0 ? "block" : "none";
    if (vazioConcluidos) vazioConcluidos.style.display = countConcluidos === 0 ? "block" : "none";

  } catch (erro) {
    console.error("❌ [Histórico] Falha ao carregar a tela de histórico:", erro);
  }
}
