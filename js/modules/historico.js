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

    // Limpa os filhos anteriores do container sem innerHTML
    container.replaceChildren();

    if (listaRegistros.length === 0) {
      if (estadoVazio) estadoVazio.style.display = "block";
      return;
    }

    if (estadoVazio) estadoVazio.style.display = "none";

    // Ordena do mais recente para o mais antigo
    listaRegistros.sort((a, b) => (b.atualizadoEm || 0) - (a.atualizadoEm || 0));

    const fragment = document.createDocumentFragment();

    listaRegistros.forEach((registro) => {
      // registro.id formato: "animeId_s01e01"
      const partes = registro.id.split("_s");
      const animeId = partes[0];
      const anime = infoCompleta ? infoCompleta[animeId] : null;

      if (!anime) return;

      let epInfo = null;
      let temporadaNome = "Temporada 1";

      const temporadas = Array.isArray(anime.temporadas)
        ? anime.temporadas
        : Array.isArray(anime.episodios)
          ? [{ nome: "Temporada Única", episodios: anime.episodios }]
          : [];

      for (let tIdx = 0; tIdx < temporadas.length; tIdx++) {
        const temp = temporadas[tIdx];
        const eps = Array.isArray(temp.episodios) ? temp.episodios : [];

        const achado = eps.find((ep, eIdx) => {
          const indexEp = typeof ep.index === "number" ? ep.index : eIdx + 1;
          const s = String(tIdx + 1).padStart(2, "0");
          const e = String(indexEp).padStart(2, "0");
          const epIdGerado = `${animeId}_s${s}e${e}`;
          return (ep.id || epIdGerado) === registro.id;
        });

        if (achado) {
          epInfo = achado;
          temporadaNome = temp.nome || `Temporada ${tIdx + 1}`;
          break;
        }
      }

      // Clona o template
      const clone = template.content.cloneNode(true);

      const link = clone.querySelector("a");
      const img = clone.querySelector(".historico-thumb");
      const barraContainer = clone.querySelector(".barra-progresso-container");
      const barraPreenchimento = clone.querySelector(".barra-progresso-preenchimento");
      const elDuracao = clone.querySelector(".historico-duracao");
      const elMeta = clone.querySelector(".historico-anime-meta");
      const elTitulo = clone.querySelector(".historico-titulo-ep");
      const elStatus = clone.querySelector(".historico-status");

      // Preenche propriedades DOM
      if (link) link.href = `#player?anime=${animeId}&ep=${registro.id}`;
      
      if (img) {
        img.src = epInfo?.thumb || anime.banner || anime.poster || "";
        img.alt = epInfo?.titulo || anime.titulo || "Episódio";
      }

      if (elMeta) elMeta.textContent = `${anime.titulo || "Anime"} • ${temporadaNome}`;
      if (elTitulo) elTitulo.textContent = epInfo?.titulo || "Episódio";

      if (elDuracao) {
        elDuracao.textContent = epInfo?.duracao || formatarTempo(registro.total);
      }

      // Preenchimento da barra de progresso
      if (registro.total > 0 && registro.tempo > 0) {
        const porcentagem = (registro.tempo / registro.total) * 100;
        if (barraContainer && barraPreenchimento) {
          barraContainer.style.display = "block";
          barraPreenchimento.style.width = `${Math.min(porcentagem, 100)}%`;
        }
      }

      if (elStatus) {
        if (registro.concluido) {
          elStatus.textContent = "Concluído";
          elStatus.style.color = "#4caf50";
        } else {
          elStatus.textContent = `Parou em ${formatarTempo(registro.tempo)}`;
        }
      }

      fragment.appendChild(clone);
    });

    container.appendChild(fragment);

  } catch (erro) {
    console.error("❌ [Histórico] Falha ao carregar o histórico:", erro);
  }
}
