import { buscarTodoProgressoDB } from "../data/database/db.js";
import { obterInfoCompleta } from "../data/database/repository.js";

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

function obterTituloDataGrupo(timestamp) {
  if (!timestamp) return "Data desconhecida";
  const data = new Date(timestamp);

  const dia = data.getDate();
  const meses = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];
  const mes = meses[data.getMonth()];
  const ano = data.getFullYear();

  return `${dia} de ${mes} de ${ano}`;
}

function formatarDataStatus(timestamp) {
  if (!timestamp) return "";

  const agora = new Date();
  const data = new Date(timestamp);

  const hora = String(data.getHours()).padStart(2, "0");
  const min = String(data.getMinutes()).padStart(2, "0");
  const horaFormatada = `${hora}:${min}`;

  const hojeMeiaNoite = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const dataMeiaNoite = new Date(data.getFullYear(), data.getMonth(), data.getDate());

  const diffMs = hojeMeiaNoite - dataMeiaNoite;
  const diffDias = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDias === 0) {
    return `hoje às ${horaFormatada}`;
  }
  if (diffDias === 1) {
    return `ontem às ${horaFormatada}`;
  }
  if (diffDias > 1 && diffDias < 7) {
    const diaSemanaIdx = data.getDay();
    const diasSemana = [
      "domingo",
      "segunda-feira",
      "terça-feira",
      "quarta-feira",
      "quinta-feira",
      "sexta-feira",
      "sábado"
    ];
    const prefixo = (diaSemanaIdx === 0 || diaSemanaIdx === 6) ? "último" : "última";
    return `${prefixo} ${diasSemana[diaSemanaIdx]} às ${horaFormatada}`;
  }

  const dia = String(data.getDate()).padStart(2, "0");
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const ano = data.getFullYear();
  return `${dia}/${mes}/${ano} às ${horaFormatada}`;
}

function agruparPorData(listaItens) {
  const gruposMap = new Map();

  listaItens.forEach((item) => {
    const timestamp = item.registro.atualizadoEm || Date.now();
    const dataObj = new Date(timestamp);
    
    const chaveData = `${dataObj.getFullYear()}-${String(dataObj.getMonth() + 1).padStart(2, '0')}-${String(dataObj.getDate()).padStart(2, '0')}`;

    if (!gruposMap.has(chaveData)) {
      gruposMap.set(chaveData, {
        tituloData: obterTituloDataGrupo(timestamp),
        itens: []
      });
    }
    gruposMap.get(chaveData).itens.push(item);
  });

  return Array.from(gruposMap.values());
}

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

let filtrosInicializados = false;

function inicializarFiltros() {
  if (filtrosInicializados) return;

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

  filtrosInicializados = true;
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

  inicializarFiltros();

  try {
    const [mapaProgresso, infoCompleta] = await Promise.all([
      buscarTodoProgressoDB(),
      obterInfoCompleta()
    ]);

    const listaRegistros = Object.values(mapaProgresso || {});

    containerAssistindo.replaceChildren();
    containerConcluidos.replaceChildren();

    if (listaRegistros.length === 0) {
      if (vazioAssistindo) vazioAssistindo.style.display = "block";
      if (vazioConcluidos) vazioConcluidos.style.display = "block";
      if (badgeAssistindo) badgeAssistindo.textContent = "0";
      if (badgeConcluidos) badgeConcluidos.textContent = "0";
      return;
    }

    listaRegistros.sort((a, b) => (b.atualizadoEm || 0) - (a.atualizadoEm || 0));

    const listaAssistindo = [];
    const listaConcluidos = [];

    listaRegistros.forEach((registro) => {
      if (!registro || !registro.id) return;

      const achado = encontrarEpisodioNoCatalogo(registro.id, infoCompleta);
      if (!achado) return;

      if (registro.concluido) {
        listaConcluidos.push({ registro, achado });
      } else {
        listaAssistindo.push({ registro, achado });
      }
    });

    const renderizarGrupos = (listaItens, containerPai) => {
      const grupos = agruparPorData(listaItens);
      const frag = document.createDocumentFragment();

      grupos.forEach((grupo) => {
        const grupoDiv = document.createElement("div");
        grupoDiv.className = "historico-grupo-data";

        const tituloHeader = document.createElement("h3");
        tituloHeader.className = "data-grupo-titulo";
        tituloHeader.textContent = grupo.tituloData;
        grupoDiv.appendChild(tituloHeader);

        const subLista = document.createElement("div");
        subLista.className = "episodes-list";

        grupo.itens.forEach(({ registro, achado }) => {
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

          if (registro.total > 0 && registro.tempo > 0) {
            const porcentagem = (registro.tempo / registro.total) * 100;
            if (barraContainer && barraPreenchimento) {
              barraContainer.style.display = "block";
              barraPreenchimento.style.width = `${Math.min(porcentagem, 100)}%`;
            }
          }

          const textoDataDinamica = formatarDataStatus(registro.atualizadoEm);

          if (elStatus) {
            if (registro.concluido) {
              elStatus.textContent = `Concluído • ${textoDataDinamica}`;
              elStatus.style.color = "#4caf50";
            } else {
              elStatus.textContent = `Resume ${formatarTempo(registro.tempo)} • ${textoDataDinamica}`;
            }
          }

          subLista.appendChild(clone);
        });

        grupoDiv.appendChild(subLista);
        frag.appendChild(grupoDiv);
      });

      containerPai.appendChild(frag);
    };

    renderizarGrupos(listaAssistindo, containerAssistindo);
    renderizarGrupos(listaConcluidos, containerConcluidos);

    if (badgeAssistindo) badgeAssistindo.textContent = String(listaAssistindo.length);
    if (badgeConcluidos) badgeConcluidos.textContent = String(listaConcluidos.length);

    if (vazioAssistindo) vazioAssistindo.style.display = listaAssistindo.length === 0 ? "block" : "none";
    if (vazioConcluidos) vazioConcluidos.style.display = listaConcluidos.length === 0 ? "block" : "none";

  } catch (erro) {
    console.error("❌ [Histórico] Falha ao carregar a tela de histórico:", erro);
  }
}
