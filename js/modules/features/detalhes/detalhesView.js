// js/modules/features/detalhes/detalhesView.js

import { buscarTodoProgressoDB } from '../../database/db.js';
import { obterAnimePorId } from '../../database/repository.js';
import { temVideoDisponivel, stripLeadingNumber, makeEpisodeId } from './detalhesUtils.js';
import { inicializarTemporadas } from './detalhesSeasons.js';
import { indexEpisodes, renderizarListaEpisodios, solicitarMarcaAssistido, episodesMap } from './detalhesEpisodes.js';

// --- GERENCIADOR PRINCIPAL DA TELA INFO ---

export async function gerenciarTelaInfo() {
    const rawHash = window.location.hash || "#inicio";
    const [hashAtual, queryString] = rawHash.split("?");

    if (hashAtual !== "#info") return;

    const containerEps = document.getElementById("lista-episodios");
    const modeloEp = document.getElementById("modelo-card-ep");
    const containerGeneros = document.getElementById("info-generos");
    const customSelectContainer = document.querySelector(".custom-select-container");
    const blocoFilme = document.querySelector(".acao-principal-container");
    const blocoEpisodios = document.getElementById("container-episodios");

    if (!containerEps || !modeloEp) return;

    // --- OUVINTES DE EVENTO ---
    if (!containerEps.dataset.listenerAttached) {
        containerEps.dataset.listenerAttached = "true";

        let touchTimer = null;
        let isLongPress = false;
        let blockContextMenu = false;

        const cancelarTouch = () => {
            if (touchTimer) {
                clearTimeout(touchTimer);
                touchTimer = null;
            }
        };

        // 1. Toque Longo no Mobile (Marcar como assistido)
        containerEps.addEventListener("touchstart", (e) => {
            const card = e.target.closest(".card-ep");
            if (!card || !card.dataset.epId) return;

            isLongPress = false;
            blockContextMenu = false;

            touchTimer = setTimeout(() => {
                isLongPress = true;
                blockContextMenu = true;
                
                if (navigator.vibrate) navigator.vibrate(50);
                
                setTimeout(() => {
                    solicitarMarcaAssistido(card.dataset.epId);
                }, 20);
            }, 600);
        }, { passive: true });

        containerEps.addEventListener("touchend", cancelarTouch);
        containerEps.addEventListener("touchmove", cancelarTouch);
        containerEps.addEventListener("touchcancel", cancelarTouch);

        // 2. Clique com Botão Direito no Desktop (Marcar como assistido)
        containerEps.addEventListener("contextmenu", (e) => {
            const card = e.target.closest(".card-ep");
            if (!card || !card.dataset.epId) return;

            e.preventDefault();

            if (blockContextMenu) {
                blockContextMenu = false;
                return;
            }

            solicitarMarcaAssistido(card.dataset.epId);
        });

        // 3. Clique Normal (Redireciona diretamente para o Player)
        containerEps.addEventListener("click", (e) => {
            if (isLongPress) {
                isLongPress = false;
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            const card = e.target.closest(".card-ep");
            if (card && card.dataset.epId) {
                const meta = episodesMap[card.dataset.epId];
                if (meta && temVideoDisponivel(meta.ep)) {
                    window.location.hash = `#player?anime=${encodeURIComponent(meta.animeId)}&ep=${encodeURIComponent(meta.ep.id)}`;
                } else {
                    alert("Vídeo indisponível para este episódio.");
                }
            }
        });
    }

    const params = new URLSearchParams(queryString);
    const itemId = params.get("anime") || params.get("id");
    const tempParam = parseInt(params.get("temp"), 10);

    if (!itemId) {
        window.location.hash = "#erro";
        return;
    }

    try {
        const item = await obterAnimePorId(itemId);

        if (!item) {
            console.error("Item não encontrado:", itemId);
            window.location.hash = "#erro";
            return;
        }

        preencherMetadados(item, containerGeneros);

        if (item.tipo === "filme" || temVideoDisponivel(item)) {
            configurarModoFilme(item, itemId, blocoFilme, blocoEpisodios);
        } else {
            await configurarModoSerie(item, itemId, tempParam, {
                blocoFilme,
                blocoEpisodios,
                customSelectContainer,
                containerEps,
                modeloEp
            });
        }

    } catch (erro) {
        console.error("Erro ao carregar dados da tela info:", erro);
        window.location.hash = "#erro";
    }
}

function preencherMetadados(item, containerGeneros) {
    const infoBanner = document.getElementById("info-banner");
    const infoTitulo = document.getElementById("info-titulo");
    const infoAno = document.getElementById("info-ano");
    const infoSinopse = document.getElementById("info-sinopse");

    if (infoBanner) {
        const isDesktop = window.matchMedia("(min-width: 1024px)").matches;

        if (isDesktop) {
            infoBanner.src = item.banner || item.poster || "";
        } else {
            infoBanner.src = item.poster || item.banner || "";
        }
    }

    if (infoTitulo) infoTitulo.textContent = item.titulo || "Sem título";
    if (infoAno) infoAno.textContent = item.ano || "----";
    if (infoSinopse) infoSinopse.textContent = item.sinopse || "Sem sinopse disponível.";

    if (containerGeneros) {
        containerGeneros.innerHTML = "";
        if (Array.isArray(item.generos)) {
            item.generos.forEach(genero => {
                const tag = document.createElement("span");
                tag.className = "genre-tag";
                tag.textContent = genero;
                containerGeneros.appendChild(tag);
            });
        }
    }
}

function configurarModoFilme(item, itemId, blocoFilme, blocoEpisodios) {
    const infoTemporadas = document.getElementById("info-temporadas");
    if (blocoEpisodios) blocoEpisodios.style.display = "none";
    if (blocoFilme) blocoFilme.style.display = "block";
    if (infoTemporadas) infoTemporadas.style.display = "none";

    const btnPlay = document.getElementById("btn-play-filme");
    if (btnPlay) {
        btnPlay.onclick = (e) => {
            e.preventDefault();
            const epFilme = item.episodios?.[0] || item;
            const epId = item.episodios?.[0]?.id || itemId;
            if (temVideoDisponivel(item) || temVideoDisponivel(epFilme)) {
                window.location.hash = `#player?anime=${encodeURIComponent(itemId)}&ep=${encodeURIComponent(epId)}`;
            } else {
                alert("Vídeo indisponível para este filme.");
            }
        };
    }
}

async function configurarModoSerie(item, itemId, tempParam, dom) {
    const infoTemporadas = document.getElementById("info-temporadas");
    if (dom.blocoFilme) dom.blocoFilme.style.display = "block";
    if (dom.blocoEpisodios) dom.blocoEpisodios.style.display = "block";
    if (infoTemporadas) infoTemporadas.style.display = "inline";

    const { temporadasAtuais, temporadaIndex } = inicializarTemporadas(
        item,
        tempParam,
        dom.customSelectContainer,
        infoTemporadas,
        dom.containerEps,
        dom.modeloEp,
        itemId
    );

    indexEpisodes(itemId, temporadasAtuais);

    const mapaProgresso = await buscarTodoProgressoDB();

    const todosEpisodios = [];
    temporadasAtuais.forEach((temp, tIdx) => {
        const eps = Array.isArray(temp.episodios) ? temp.episodios : [];
        eps.forEach((ep, eIdx) => {
            if (typeof ep.index !== 'number') ep.index = eIdx + 1;
            if (!ep.id) ep.id = makeEpisodeId(itemId, tIdx + 1, ep.index);
            todosEpisodios.push(ep);
        });
    });

    const btnPlay = document.getElementById("btn-play-filme");
    if (btnPlay) {
        let ultimoInteragido = null;
        let maiorData = 0;

        todosEpisodios.forEach((ep, idx) => {
            const prog = mapaProgresso[ep.id];
            if (prog && (prog.tempo > 15 || prog.concluido)) {
                const dataProg = prog.atualizadoEm || 0;
                if (dataProg >= maiorData) {
                    maiorData = dataProg;
                    ultimoInteragido = { ep, idx, prog };
                }
            }
        });

        let epAlvo = null;
        let textoBotao = "";

        if (ultimoInteragido) {
            const { ep, idx, prog } = ultimoInteragido;
            const estaConcluido = prog.concluido || (prog.total > 0 && (prog.tempo / prog.total) >= 0.85);

            if (estaConcluido) {
                if (idx + 1 < todosEpisodios.length) {
                    epAlvo = todosEpisodios[idx + 1];
                    const rawTitle = epAlvo.titulo || `Episódio ${epAlvo.index}`;
                    const baseTitle = stripLeadingNumber(rawTitle) || rawTitle;
                    textoBotao = `ASSISTIR AO PRÓXIMO: EP. ${epAlvo.index} - ${baseTitle}`;
                } else {
                    epAlvo = todosEpisodios[0];
                    textoBotao = `REASSISTIR DESDE O EP. 1`;
                }
            } else {
                epAlvo = ep;
                const rawTitle = epAlvo.titulo || `Episódio ${epAlvo.index}`;
                const baseTitle = stripLeadingNumber(rawTitle) || rawTitle;
                textoBotao = `Resume:  ${epAlvo.index} • ${baseTitle}`;
            }
        } else {
            epAlvo = todosEpisodios[0];
            textoBotao = `ASSISTIR AO PRIMEIRO EPISÓDIO`;
        }

        if (epAlvo) {
            btnPlay.innerHTML = `
                <span class="material-symbols-outlined">play_arrow</span>
                ${textoBotao.toUpperCase()}
            `;

            btnPlay.onclick = (e) => {
                e.preventDefault();
                if (temVideoDisponivel(epAlvo)) {
                    window.location.hash = `#player?anime=${encodeURIComponent(itemId)}&ep=${encodeURIComponent(epAlvo.id)}`;
                } else {
                    alert("Vídeo indisponível para este episódio.");
                }
            };
        } else {
            btnPlay.innerHTML = `
                <span class="material-symbols-outlined">play_arrow</span>
                ASSISTIR
            `;
            btnPlay.onclick = (e) => e.preventDefault();
        }
    }

    const tempAtiva = temporadasAtuais[temporadaIndex];
    if (tempAtiva && tempAtiva.episodios) {
        renderizarListaEpisodios(tempAtiva.episodios, dom.containerEps, dom.modeloEp, itemId, temporadaIndex, mapaProgresso);
    } else {
        dom.containerEps.innerHTML = "<p style='color: #888; padding: 10px;'>Nenhum episódio disponível nesta temporada.</p>";
    }
}
