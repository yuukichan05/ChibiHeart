import { buscarTodoProgressoDB } from "../database/db.js";
import { obterInfoCompleta } from "../database/repository.js";

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
        temporadaNome: temp.nome || `${tIdx + 1}ª Temporada`,
        tempIndex: tIdx + 1 // Salva o número da temporada
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

    const animesInteragidos = {};

    listaRegistros.forEach((reg) => {
      if (!reg || !reg.id) return;

      for (const [idAnimeKey, anime] of Object.entries(infoCompleta)) {
        const episodiosLinear = obterListaLinearEpisodios(anime, idAnimeKey);
        const indexAchado = episodiosLinear.findIndex(item => item.epId === reg.id);

        if (indexAchado !== -1) {
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

    const itensContinuar = Object.values(animesInteragidos);
    itensContinuar.sort((a, b) => (b.registro.atualizadoEm || 0) - (a.registro.atualizadoEm || 0));

    // =========================================================================
    // 1. PASSO FLIP (FIRST): Grava posições dos cards no DOM antes de atualizar
    // =========================================================================
    const cardsAntigos = Array.from(gradeContainer.querySelectorAll('.card-continuar'));
    const posicoesAntigas = new Map();

    cardsAntigos.forEach(card => {
      const id = card.dataset.id;
      if (id) posicoesAntigas.set(id, card.getBoundingClientRect());
    });

    gradeContainer.replaceChildren();
    const fragment = document.createDocumentFragment();
    let contadorExibidos = 0;

    itensContinuar.forEach(({ anime, animeId, registro, episodiosLinear, indexEpAtual }) => {
      let epAlvo = null;
      let tempoRestante = 0;
      let totalTempo = 0;
      let percentual = 0;

      const itemAtual = episodiosLinear[indexEpAtual];
      const estaConcluido = registro.concluido || (registro.total > 0 && (registro.tempo / registro.total) >= 0.85);

      if (!estaConcluido) {
        epAlvo = itemAtual;
        tempoRestante = registro.tempo;
        totalTempo = registro.total;
        percentual = (tempoRestante / totalTempo) * 100;
      } else {
        if (indexEpAtual + 1 < episodiosLinear.length) {
          epAlvo = episodiosLinear[indexEpAtual + 1];
          tempoRestante = 0;
          totalTempo = 0;
          percentual = 0;
        } else {
          return;
        }
      }

      if (!epAlvo) return;

      contadorExibidos++;

      const clone = template.content.cloneNode(true);
      const cardRoot = clone.querySelector(".card-continuar");
      const linkPlayer = clone.querySelector(".continuar-link-player");
      const linkInfo = clone.querySelector(".continuar-link-info");
      const img = clone.querySelector(".continuar-thumb");
      const barraContainer = clone.querySelector(".barra-progresso-container");
      const barraPreenchimento = clone.querySelector(".barra-progresso-preenchimento");
      const elDuracao = clone.querySelector(".continuar-duracao");
      const elTituloAnime = clone.querySelector(".continuar-titulo-anime");
      const elSubtituloEp = clone.querySelector(".continuar-subtitulo-ep");

      if (cardRoot) {
        cardRoot.dataset.id = animeId;
      }

      // 1. Link da Imagem -> Direciona diretamente ao PLAYER
      if (linkPlayer) {
        linkPlayer.href = `#player?anime=${encodeURIComponent(animeId)}&ep=${encodeURIComponent(epAlvo.epId)}`;
      }

      // 2. Link do Texto -> Direciona para a TELA DE DETALHES do anime
      if (linkInfo) {
        // NOVO (padrão exato esperado pela view de detalhes #info):
        linkInfo.href = `#info?anime=${encodeURIComponent(animeId)}`;
      }

      if (img) {
        img.src = epAlvo.ep.thumb || anime.poster || anime.banner || "";
        img.alt = anime.titulo || "Anime";
      }

      if (elTituloAnime) {
        elTituloAnime.textContent = anime.titulo || "Anime";
      }

      if (elSubtituloEp) {
        const tempNum = epAlvo.tempIndex || 1;
        const epNum = epAlvo.ep.index || (indexEpAtual + 1);

        // Obtém o título do EP e remove prefixos numéricos (ex: "01. Nome" -> "Nome")
        let nomeEp = epAlvo.ep.titulo || epAlvo.ep.nome || "Episódio";
        nomeEp = nomeEp.replace(/^\d+[\.\s-]+\s*/, '');

        elSubtituloEp.textContent = `T${tempNum} • EP${epNum} - ${nomeEp}`;
      }

      if (elDuracao) {
        elDuracao.textContent = epAlvo.ep.duracao || formatarTempo(totalTempo);
      }

      if (percentual > 0 && barraContainer && barraPreenchimento) {
        barraContainer.style.display = "block";
        barraPreenchimento.style.width = `${Math.min(percentual, 100)}%`;
      } else if (barraContainer) {
        barraContainer.style.display = "none";
      }

      fragment.appendChild(clone);
    });

    if (contadorExibidos > 0) {
      gradeContainer.appendChild(fragment);
      secaoContainer.style.display = "block";

      // =========================================================================
      // 2. PASSO FLIP (LAST, INVERT & PLAY): Anima o deslocamento ou o fade
      // =========================================================================
      const cardsNovos = Array.from(gradeContainer.querySelectorAll('.card-continuar'));

      cardsNovos.forEach((cardNovo, indice) => {
        const id = cardNovo.dataset.id;
        const posAntiga = posicoesAntigas.get(id);

        if (posAntiga) {
          const posNova = cardNovo.getBoundingClientRect();
          const deltaX = posAntiga.left - posNova.left;
          const deltaY = posAntiga.top - posNova.top;

          const mudouDePosicao = Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2;

          if (mudouDePosicao) {
            cardNovo.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
            cardNovo.style.transition = 'transform 0s';

            requestAnimationFrame(() => {
              cardNovo.style.transition = 'transform 0.4s cubic-bezier(0.2, 0, 0.2, 1)';
              cardNovo.style.transform = 'translate(0, 0)';
            });
          } else if (indice === 0) {
            cardNovo.style.opacity = '0';
            cardNovo.style.transition = 'opacity 0s';

            requestAnimationFrame(() => {
              cardNovo.style.transition = 'opacity 0.35s ease-in-out';
              cardNovo.style.opacity = '1';
            });
          }
        } else {
          cardNovo.style.opacity = '0';
          cardNovo.style.transform = 'translateY(10px)';
          cardNovo.style.transition = 'opacity 0s, transform 0s';

          requestAnimationFrame(() => {
            cardNovo.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
            cardNovo.style.opacity = '1';
            cardNovo.style.transform = 'translateY(0)';
          });
        }
      });

    } else {
      secaoContainer.style.display = "none";
    }

  } catch (erro) {
    console.error("❌ [Continuar Assistindo] Erro ao renderizar:", erro);
    secaoContainer.style.display = "none";
  }
}
