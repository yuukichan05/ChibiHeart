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

        // Variantes possíveis para quando o JSON não declara o campo "id"
        const idFallbackHifen = `${idAnimeKey}-s${s}e${e}`;
        const idFallbackUnderline = `${idAnimeKey}_s${s}e${e}`;

        // 1. COMPARAÇÃO DIRETA (A mais importante): Se o ep.id do JSON for igual ao salvo no banco
        if (ep.id && ep.id === idBuscado) {
          return { anime, animeId: idAnimeKey, ep, temporadaNome: temp.nome || `${tIdx + 1}ª Temporada` };
        }

        // 2. FALLBACK: Caso o objeto do episódio no JSON não possua a propriedade "id"
        if (!ep.id && (idBuscado === idFallbackHifen || idBuscado === idFallbackUnderline)) {
          return { anime, animeId: idAnimeKey, ep, temporadaNome: temp.nome || `${tIdx + 1}ª Temporada` };
        }
      }
    }
  }

  return null;
}

export async function gerenciarTelaHistorico() {
  const hash = window.location.hash;

  if (!hash.startsWith("#historico")) return;

  const container = document.getElementById("grade-historico");
  const template = document.getElementById("modelo-card-historico");
  const estadoVazio = document.getElementById("historico-vazio");

  if (!container || !template) return;

  try {
    const [mapaProgresso, infoCompleta] = await Promise.all([
      buscarTodoProgressoDB(),
      obterInfoCompleta()
    ]);

    const listaRegistros = Object.values(mapaProgresso || {});

    // Limpa a tela antes de renderizar
    container.replaceChildren();

    if (listaRegistros.length === 0) {
      if (estadoVazio) estadoVazio.style.display = "block";
      return;
    }

    if (estadoVazio) estadoVazio.style.display = "none";

    // Ordena do progresso mais recente para o mais antigo
    listaRegistros.sort((a, b) => (b.atualizadoEm || 0) - (a.atualizadoEm || 0));

    const fragment = document.createDocumentFragment();

    listaRegistros.forEach((registro) => {
      if (!registro || !registro.id) return;

      // Busca universal do episódio no catálogo JSON
      const achado = encontrarEpisodioNoCatalogo(registro.id, infoCompleta);

      // Se o episódio salvo não existir mais no JSON, ignora silenciosamente
      if (!achado) return;

      const { anime, animeId, ep, temporadaNome } = achado;

      // Clona a estrutura do card no HTML
      const clone = template.content.cloneNode(true);

      const link = clone.querySelector("a");
      const img = clone.querySelector(".historico-thumb");
      const barraContainer = clone.querySelector(".barra-progresso-container");
      const barraPreenchimento = clone.querySelector(".barra-progresso-preenchimento");
      const elDuracao = clone.querySelector(".historico-duracao");
      const elMeta = clone.querySelector(".historico-anime-meta");
      const elTitulo = clone.querySelector(".historico-titulo-ep");
      const elStatus = clone.querySelector(".historico-status");

      // Monta a URL para assistir no Player
      if (link) {
        link.href = `#player?anime=${encodeURIComponent(animeId)}&ep=${encodeURIComponent(registro.id)}`;
      }

      // Preenche imagem da thumbnail/poster
      if (img) {
        img.src = ep.thumb || anime.poster || anime.banner || "";
        img.alt = ep.titulo || anime.titulo || "Episódio";
      }

      // Metadados
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

      // Status
      if (elStatus) {
        if (registro.concluido) {
          elStatus.textContent = "Concluído";
          elStatus.style.color = "#4caf50";
        } else {
          elStatus.textContent = `Resume ${formatarTempo(registro.tempo)}`;
        }
      }

      fragment.appendChild(clone);
    });

    container.appendChild(fragment);

  } catch (erro) {
    console.error("❌ [Histórico] Falha ao carregar a tela de histórico:", erro);
  }
}
