// js/modules/continuarAssistindo.js

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
 * Mapeia todos os episódios de um anime em uma lista linear única sequencial.
 */
function obterListaLinearEpisodios(anime, idAnimeKey) {
  const episodiosLinear = [];

  const temporadas = Array.isArray(anime.temporadas)
    ? anime.temporadas
    : Array.isArray(anime.episodios)
      ? [{ nome: "Temporada Única", episodios: anime.episodios }]
      : [];

  temporadas.forEach((temp, tIdx) => {
    const eps = Array.isArray(temp.episodios) ? temp.episodios : [];
    eps.forEach((ep, eIdx) => {
      const indexEp = typeof ep.index === "number" ? ep.index : eIdx + 1;
      const s = String(tIdx + 1).padStart(2, "0");
      const e = String(indexEp).padStart(2, "0");

      const epId = ep.id || `${idAnimeKey}_s${s}e${e}`;

      episodiosLinear.push({
        ep,
        epId,
        animeId: idAnimeKey,
        temporadaNome: temp.nome || `${tIdx + 1}ª Temporada`
      });
    });
  });

  return episodiosLinear;
}

export async function renderizarContinuarAssistindo() {
  const secaoContainer = document.getElementById("secao-continuar-assistindo");
  const gradeContainer = document.getElementById("grade-continuar-assistindo");
  const template = document.getElementById("modelo-card-continuar");

  if (!secaoContainer || !gradeContainer || !template) return;

  try {
    const [mapaProgresso, infoCompleta] = await Promise.all([
      buscarTodoProgressoDB(),
      obterInfoCompleta()
    ]);

    const listaRegistros = Object.values(mapaProgresso || {});

    // Se não houver histórico, esconde a seção
    if (listaRegistros.length === 0 || !infoCompleta) {
      secaoContainer.style.display = "none";
      return;
    }

    // Agrupa os episódios por Anime para pegar apenas a última interação de cada Anime
    const animesInteragidos = {};

    listaRegistros.forEach((reg) => {
      if (!reg || !reg.id) return;

      // Localiza o anime ao qual este registro pertence no banco JSON
      for (const [idAnimeKey, anime] of Object.entries(infoCompleta)) {
        const episodiosLinear = obterListaLinearEpisodios(anime, idAnimeKey);
        const indexAchado = episodiosLinear.findIndex(item => item.epId === reg.id);

        if (indexAchado !== -1) {
          // Se o anime ainda não foi processado ou se este registro for mais recente
          if (!animesInteragidos[idAnimeKey] || (reg.atualizadoEm || 0) > animesInteragidos[idAnimeKey].registro.atualizadoEm) {
            animesInteragidos[idAnimeKey] = {
              anime,
              animeId: idAnimeKey,
              registro: reg,
              episodiosLinear,
              indexEpAtual: indexAchado
            };
          }
          break;
        }
      }
    });

    // Converte em Array e Ordena do MAIS RECENTE para o MAIS ANTIGO
    const itensContinuar = Object.values(animesInteragidos);
    itensContinuar.sort((a, b) => (b.registro.atualizadoEm || 0) - (a.registro.atualizadoEm || 0));

    gradeContainer.replaceChildren();
    const fragment = document.createDocumentFragment();
    let contadorExibidos = 0;

    itensContinuar.forEach(({ anime, animeId, registro, episodiosLinear, indexEpAtual }) => {
      let epAlvo = null;
      let tempoRestante = 0;
      let totalTempo = 0;
      let percentual = 0;
      let subtituloTexto = "";

      const itemAtual = episodiosLinear[indexEpAtual];
      const estaConcluido = registro.concluido || (registro.total > 0 && (registro.tempo / registro.total) >= 0.85);

      if (!estaConcluido) {
        // CASO 1: O episódio atual ainda não terminou (Continuar de onde parou)
        epAlvo = itemAtual;
        tempoRestante = registro.tempo;
        totalTempo = registro.total;
        percentual = (tempoRestante / totalTempo) * 100;
        subtituloTexto = `Parou em ${formatarTempo(tempoRestante)}`;
      } else {
        // CASO 2: O episódio atual foi concluído -> Tenta pegar o PRÓXIMO episódio
        if (indexEpAtual + 1 < episodiosLinear.length) {
          epAlvo = episodiosLinear[indexEpAtual + 1];
          tempoRestante = 0;
          totalTempo = 0;
          percentual = 0;
          subtituloTexto = `Próximo: Ep. ${epAlvo.ep.index || (indexEpAtual + 2)}`;
        } else {
          // CASO 3: Concluiu e NÃO existe próximo episódio -> Remove do Continuar Assistindo
          return;
        }
      }

      if (!epAlvo) return;

      contadorExibidos++;

      // Monta o Card HTML
      const clone = template.content.cloneNode(true);
      const link = clone.querySelector("a");
      const img = clone.querySelector(".continuar-thumb");
      const barraContainer = clone.querySelector(".barra-progresso-container");
      const barraPreenchimento = clone.querySelector(".barra-progresso-preenchimento");
      const elDuracao = clone.querySelector(".continuar-duracao");
      const elTituloAnime = clone.querySelector(".continuar-titulo-anime");
      const elSubtituloEp = clone.querySelector(".continuar-subtitulo-ep");

      if (link) {
        link.href = `#player?anime=${encodeURIComponent(animeId)}&ep=${encodeURIComponent(epAlvo.epId)}`;
      }

      if (img) {
        img.src = epAlvo.ep.thumb || anime.poster || anime.banner || "";
        img.alt = anime.titulo || "Anime";
      }

      if (elTituloAnime) {
        elTituloAnime.textContent = anime.titulo || "Anime";
      }

      if (elSubtituloEp) {
        const epNum = epAlvo.ep.index ? `Ep. ${epAlvo.ep.index}` : `Episódio`;
        elSubtituloEp.textContent = `${epNum} • ${subtituloTexto}`;
      }

      if (elDuracao) {
        elDuracao.textContent = epAlvo.ep.duracao || formatarTempo(totalTempo);
      }

      // Se houver progresso acumulado no episódio atual, ajusta a barra
      if (percentual > 0 && barraContainer && barraPreenchimento) {
        barraContainer.style.display = "block";
        barraPreenchimento.style.width = `${Math.min(percentual, 100)}%`;
      } else if (barraContainer) {
        barraContainer.style.display = "none";
      }

      fragment.appendChild(clone);
    });

    // Exibe ou esconde a seção dependendo se há itens válidos
    if (contadorExibidos > 0) {
      gradeContainer.appendChild(fragment);
      secaoContainer.style.display = "block";
    } else {
      secaoContainer.style.display = "none";
    }

  } catch (erro) {
    console.error("❌ [Continuar Assistindo] Erro ao renderizar:", erro);
    secaoContainer.style.display = "none";
  }
}
