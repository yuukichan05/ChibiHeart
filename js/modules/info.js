// js/modules/info.js

import { buscarTodoProgressoDB, buscarProgressoDB, alternarConcluidoDB } from './db.js';
import { obterAnimePorId } from './repository.js';

// --- ESTADO LOCAL E MAPEAMENTOS ---
export let episodesMap = {}; 

let temporadasAtuais = [];
let temporadaSelecionadaIndex = 0;
let currentAnimeId = "";

// Trava global para evitar múltiplos disparos seguidos (evita popup duplicado)
let isProcessingAction = false;

/**
 * Zera o mapeamento de episódios da memória.
 */
export function limparMapaEpisodios() {
    episodesMap = {};
}

// --- HELPERS E AUXILIARES ---

function makeEpisodeId(animeId, seasonIdx, episodeIdx) {
    const s = String(seasonIdx).padStart(2, '0');
    const e = String(episodeIdx).padStart(2, '0');
    return `${animeId}_s${s}e${e}`;
}

function stripLeadingNumber(title) {
    if (!title || typeof title !== 'string') return title || '';
    return title.replace(/^\s*\d{1,3}(?:[.\)\-:]\s*|\s+-\s*|\.\s*)*/, '').trim();
}

/**
 * Mapeia todos os episódios de todas as temporadas
 */
export function indexEpisodes(animeId, temporadas) {
    limparMapaEpisodios();
    if (!Array.isArray(temporadas)) return;

    temporadas.forEach((temp, tIdx) => {
        const eps = Array.isArray(temp.episodios) ? temp.episodios : [];
        eps.forEach((ep, eIdx) => {
            if (typeof ep.index !== 'number') ep.index = eIdx + 1;
            if (!ep.id) ep.id = makeEpisodeId(animeId, tIdx + 1, ep.index || (eIdx + 1));
            episodesMap[ep.id] = { ep, animeId, seasonIndex: tIdx };
        });
    });
}

// --- GERENCIADOR DE TEMPORADAS ---

export function inicializarTemporadas(item, tempParam, customSelectContainer, infoTemporadas, containerEps, modeloEp, itemId) {
    currentAnimeId = itemId;

    if (Array.isArray(item.temporadas) && item.temporadas.length > 0) {
        if (customSelectContainer) customSelectContainer.style.display = "inline-block";
        temporadasAtuais = item.temporadas;
        if (infoTemporadas) {
            const totalTemp = item.temporadas.length;
            infoTemporadas.textContent = `${totalTemp} ${totalTemp === 1 ? 'Temporada' : 'Temporadas'}`;
        }
    } else if (Array.isArray(item.episodios)) {
        if (customSelectContainer) customSelectContainer.style.display = "none";
        temporadasAtuais = [{ nome: "Temporada Única", episodios: item.episodios }];
        if (infoTemporadas) infoTemporadas.textContent = "1 Temporada";
    } else {
        temporadasAtuais = [];
        if (infoTemporadas) infoTemporadas.textContent = "-- Temporadas";
    }

    if (!isNaN(tempParam) && tempParam >= 1 && tempParam <= temporadasAtuais.length) {
        temporadaSelecionadaIndex = tempParam - 1;
    } else {
        temporadaSelecionadaIndex = 0;
    }

    renderizarPopUpTemporadas(containerEps, modeloEp);

    return {
        temporadasAtuais,
        temporadaIndex: temporadaSelecionadaIndex
    };
}

export function renderizarPopUpTemporadas(containerEps, modeloEp) {
    const popup = document.getElementById("popup-temporadas");
    const btnAtual = document.getElementById("btn-selecionar-temporada");

    if (!popup || !btnAtual) return;

    popup.innerHTML = "";

    temporadasAtuais.forEach((temp, index) => {
        const item = document.createElement("div");
        item.className = "opcao-temporada";
        const nomeTemporada = temp.nome || `${index + 1}ª Temporada`;
        item.innerText = nomeTemporada;

        if (index === temporadaSelecionadaIndex) {
            item.classList.add("selecionada");
            btnAtual.innerText = nomeTemporada + " ▾";
        }

        item.onclick = function () {
            mudarTemporada(index, containerEps, modeloEp);
        };

        popup.appendChild(item);
    });
}

function mudarTemporada(index, containerEps, modeloEp) {
    temporadaSelecionadaIndex = index;

    const novaTempNum = index + 1;
    const urlAtual = new URL(window.location.href);
    const [hashBase, hashQuery] = urlAtual.hash.split("?");
    const params = new URLSearchParams(hashQuery || "");
    params.set("temp", novaTempNum);

    history.replaceState(null, "", `${hashBase}?${params.toString()}`);

    renderizarPopUpTemporadas(containerEps, modeloEp);

    const popup = document.getElementById("popup-temporadas");
    if (popup) popup.classList.remove("mostrar");

    if (temporadasAtuais[index] && temporadasAtuais[index].episodios) {
        renderizarListaEpisodios(temporadasAtuais[index].episodios, containerEps, modeloEp, currentAnimeId, index);
    } else {
        containerEps.innerHTML = "<p style='color: #888; padding: 10px;'>Nenhum episódio disponível nesta temporada.</p>";
    }
}

// Global para acionamento via onclick no HTML
window.togglePopupTemporadas = function () {
    const popup = document.getElementById("popup-temporadas");
    if (popup) popup.classList.toggle("mostrar");
};

window.addEventListener("click", (event) => {
    if (!event.target.matches('#btn-selecionar-temporada')) {
        const popup = document.getElementById("popup-temporadas");
        if (popup && popup.classList.contains('mostrar')) {
            popup.classList.remove('mostrar');
        }
    }
});

// --- RENDERIZADOR DE LISTA DE EPISÓDIOS ---

export function renderizarListaEpisodios(listaEpisodios, container, modelo, animeId, seasonIndex = 0, mapaProgresso = {}) {
    container.innerHTML = "";

    if (!Array.isArray(listaEpisodios) || listaEpisodios.length === 0) {
        container.innerHTML = "<p style='color: #888; padding: 10px;'>Nenhum episódio disponível nesta temporada.</p>";
        return;
    }

    listaEpisodios.sort((a, b) => (a.index || 0) - (b.index || 0));

    const frag = document.createDocumentFragment();

    listaEpisodios.forEach((ep, epIndex) => {
        if (typeof ep.index !== 'number') ep.index = epIndex + 1;
        if (!ep.id) ep.id = makeEpisodeId(animeId, seasonIndex + 1, ep.index);

        const clone = modelo.content.cloneNode(true);

        const imgEl = clone.querySelector("img");
        const durationEl = clone.querySelector(".ep-duration");
        const titleEl = clone.querySelector(".card-title-ep");
        const subtitleEl = clone.querySelector(".card-descricao-ep");
        const cardWrapper = clone.querySelector(".card-ep");

        const containerBarra = clone.querySelector(".barra-progresso-container");
        const preenchimentoBarra = clone.querySelector(".barra-progresso-preenchimento");

        const rawTitle = ep.titulo || '';
        const baseTitle = stripLeadingNumber(rawTitle) || rawTitle;
        const displayTitle = `${String(ep.index).padStart(2, '0')}. ${baseTitle}`;

        if (imgEl) {
            imgEl.src = ep.thumb || "";
            imgEl.alt = ep.titulo || `Episódio ${epIndex + 1}`;
        }
        if (durationEl) durationEl.textContent = ep.duracao || "";
        if (titleEl) titleEl.textContent = displayTitle;
        
        // Insere a descrição envelopada no span para acionar o efeito marquee vertical
        if (subtitleEl) {
            const textoDescricao = ep.descricao || "Sem descrição disponível.";
            subtitleEl.innerHTML = `<span class="marquee-content">${textoDescricao}</span>`;
        }

        if (cardWrapper) {
            cardWrapper.dataset.epId = ep.id;
            cardWrapper.style.cursor = "pointer";
        }

        if (mapaProgresso[ep.id]) {
            const dadosEp = mapaProgresso[ep.id];
            if (dadosEp.concluido) {
                if (containerBarra && preenchimentoBarra) {
                    containerBarra.style.display = "block";
                    preenchimentoBarra.style.width = "100%";
                }
            } else if (dadosEp.total > 0 && dadosEp.tempo > 0) {
                const porcentagem = (dadosEp.tempo / dadosEp.total) * 100;
                
                if (containerBarra && preenchimentoBarra) {
                    containerBarra.style.display = "block";
                    preenchimentoBarra.style.width = `${Math.min(porcentagem, 100)}%`;
                }
            }
        }

        frag.appendChild(clone);
    });

    container.appendChild(frag);
}

// --- POP-UP DE CONFIRMAÇÃO PARA MARCAR COMO ASSISTIDO ---

async function solicitarMarcaAssistido(epId) {
    if (isProcessingAction) return;
    isProcessingAction = true;

    try {
        const meta = episodesMap[epId];
        const rawTitle = meta?.ep?.titulo || '';
        const baseTitle = stripLeadingNumber(rawTitle) || rawTitle;
        const nomeEp = baseTitle ? ` "${baseTitle}"` : '';

        const progresso = await buscarProgressoDB(epId);
        const estaConcluido = progresso?.concluido || (progresso?.total > 0 && (progresso.tempo / progresso.total) >= 0.85);

        const mensagem = estaConcluido
            ? `Deseja desmarcar o episódio${nomeEp} como assistido?`
            : `Deseja marcar o episódio${nomeEp} como assistido?`;

        if (confirm(mensagem)) {
            await alternarConcluidoDB(epId, !estaConcluido);
            await gerenciarTelaInfo();
        }
    } catch (erro) {
        console.error("Erro ao alterar progresso:", erro);
    } finally {
        setTimeout(() => {
            isProcessingAction = false;
        }, 500);
    }
}

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
                if (meta && meta.ep?.video) {
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

        if (item.tipo === "filme" || item.video) {
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
        // Detecta diretamente a largura da tela no carregamento
        const isDesktop = window.matchMedia("(min-width: 1024px)").matches;

        // Desktop exibe o Banner (horizontal), Mobile exibe o Poster (vertical)
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
            const epId = item.episodios?.[0]?.id || itemId;
            if (item.video || item.episodios?.[0]?.video) {
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
                textoBotao = `CONTINUAR ASSISTINDO: EP. ${epAlvo.index} - ${baseTitle}`;
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
                if (epAlvo.video) {
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
