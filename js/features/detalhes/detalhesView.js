import { buscarTodoProgressoDB } from '../../data/database/db.js';
import { obterAnimePorId } from '../../data/database/repository.js';
import { observarImagem, observarContainer } from '../../core/imageObserver.js';
import { 
    temVideoDisponivel, 
    stripLeadingNumber, 
    makeEpisodeId, 
    formatarEstacao, 
    formatarTipo,
    formatarDataEpisodio,
    ehEpisodioFuturo
} from './detalhesUtils.js';
import { inicializarTemporadas } from './detalhesSeasons.js';
import {
    indexEpisodes,
    renderizarListaEpisodios,
    solicitarMarcaAssistido,
    episodesMap,
    alternarOrdemEpisodios,
    alternarStatusTemporada
} from './detalhesEpisodes.js';

const DEFAULT_FALLBACK_IMAGE = "assets/images/placeholder.jpg";

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

    configurarOuvintesEventos(containerEps);
    observarContainer(containerEps);

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

        const ehConteudoUnico = item.tipo === "filme" ||
            (item.tipo !== "serie" && (!item.temporadas || item.temporadas.length === 0) && (!item.episodios || item.episodios.length <= 1));

        if (item.status === "Anunciado") {
            configurarModoAnunciado(blocoFilme, blocoEpisodios);
        } else if (ehConteudoUnico) {
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

function configurarOuvintesEventos(containerEps) {
    if (containerEps.dataset.listenerAttached) return;
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

            if (meta?.ep?.data_lancamento && ehEpisodioFuturo(meta.ep.data_lancamento)) {
                const dataFmt = formatarDataEpisodio(meta.ep.data_lancamento);
                alert(`Este episódio estará disponível em ${dataFmt || 'breve'}.`);
                return;
            }

            if (meta && temVideoDisponivel(meta.ep)) {
                window.location.hash = `#player?anime=${encodeURIComponent(meta.animeId)}&ep=${encodeURIComponent(meta.ep.id)}`;
            } else {
                alert("Vídeo indisponível para este episódio.");
            }
        }
    });
}

function preencherMetadados(item, containerGeneros) {
    const infoBanner = document.getElementById("info-banner");
    const infoBackdrop = document.getElementById("info-backdrop");
    const infoTitulo = document.getElementById("info-titulo");
    const infoSubtitulo = document.getElementById("info-subtitulo");
    const infoAno = document.getElementById("info-ano");
    const infoSinopse = document.getElementById("info-sinopse");

    const badgeTipo = document.getElementById("info-tipo");
    const badgeStatus = document.getElementById("info-status");
    const badgeEstacao = document.getElementById("info-estacao");
    const badgeClassificacao = document.getElementById("info-classificacao");

    const statusAvisoBox = document.getElementById("info-status-aviso");
    const statusAvisoTexto = document.getElementById("info-status-texto");

    if (infoBanner || infoBackdrop) {
        const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
        
        // Encadeamento de fallback do banner principal
        const posterEfetivo = item.poster_detalhes || item.poster || DEFAULT_FALLBACK_IMAGE;
        const bannerEfetivo = item.banner || posterEfetivo;

        const imagemSrc = isDesktop ? bannerEfetivo : posterEfetivo;

        const otimizarImagemMetadado = (img, src) => {
            if (!img || !src) return;
            img.dataset.src = src;
            img.removeAttribute("src");
            img.classList.remove("loaded");
            observarImagem(img);
        };

        if (infoBanner) otimizarImagemMetadado(infoBanner, imagemSrc);
        if (infoBackdrop) otimizarImagemMetadado(infoBackdrop, imagemSrc);
    }

    if (infoTitulo) infoTitulo.textContent = item.titulo || "Sem título";

    if (infoSubtitulo) {
        const sub = item.titulo_pt || item.titulo_en || "";
        if (sub && sub !== item.titulo) {
            infoSubtitulo.textContent = sub;
            infoSubtitulo.style.display = "block";
        } else {
            infoSubtitulo.style.display = "none";
        }
    }

    if (infoAno) infoAno.textContent = item.ano || "----";
    if (infoSinopse) infoSinopse.textContent = item.sinopse || "Sem sinopse disponível.";

    const containerSinopse = document.querySelector(".info-synopsis-container");
    const btnToggleSinopse = document.getElementById("btn-toggle-sinopse");

    if (containerSinopse && btnToggleSinopse) {
        containerSinopse.classList.remove("expandido");
        btnToggleSinopse.textContent = "mais";

        btnToggleSinopse.onclick = () => {
            const estaExpandido = containerSinopse.classList.toggle("expandido");
            btnToggleSinopse.textContent = estaExpandido ? "menos" : "mais";
        };
    }

    if (badgeTipo) {
        const textoTipo = formatarTipo(item.tipo);
        if (textoTipo) {
            badgeTipo.textContent = textoTipo;
            badgeTipo.style.display = "inline-block";
        } else {
            badgeTipo.style.display = "none";
        }
    }

    if (badgeStatus) {
        if (item.status) {
            badgeStatus.textContent = item.status;
            badgeStatus.className = `badge badge-status status-${String(item.status).toLowerCase().replace(/\s+/g, '-')}`;
            badgeStatus.style.display = "inline-block";
        } else {
            badgeStatus.style.display = "none";
        }
    }

    if (badgeEstacao) {
        const textoEstacao = formatarEstacao(item.temporada, item.ano);
        if (textoEstacao) {
            badgeEstacao.textContent = textoEstacao;
            badgeEstacao.style.display = "inline-block";
        } else {
            badgeEstacao.style.display = "none";
        }
    }

    if (badgeClassificacao) {
        if (item.classificacao) {
            badgeClassificacao.textContent = item.classificacao;
            badgeClassificacao.style.display = "inline-block";
        } else {
            badgeClassificacao.style.display = "none";
        }
    }

    if (statusAvisoBox && statusAvisoTexto) {
        if (item.status === "Em exibição") {
            statusAvisoTexto.textContent = "Novos episódios são adicionados periodicamente assim que lançados.";
            statusAvisoBox.style.display = "flex";
        } else if (item.status === "Anunciado") {
            statusAvisoTexto.textContent = "Este título foi anunciado e estará disponível em breve.";
            statusAvisoBox.style.display = "flex";
        } else {
            statusAvisoBox.style.display = "none";
        }
    }

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

function configurarModoAnunciado(blocoFilme, blocoEpisodios) {
    const infoTemporadas = document.getElementById("info-temporadas");
    if (blocoEpisodios) blocoEpisodios.style.display = "none";
    if (blocoFilme) blocoFilme.style.display = "block";
    if (infoTemporadas) infoTemporadas.style.display = "none";

    const btnPlay = document.getElementById("btn-play-filme");
    if (btnPlay) {
        btnPlay.innerHTML = `
            <span class="material-symbols-outlined">schedule</span>
            EM BREVE
        `;
        btnPlay.classList.add("disabled");
        btnPlay.onclick = (e) => {
            e.preventDefault();
            alert("Este título ainda não foi lançado.");
        };
    }
}

function configurarModoFilme(item, itemId, blocoFilme, blocoEpisodios) {
    const infoTemporadas = document.getElementById("info-temporadas");
    if (blocoEpisodios) blocoEpisodios.style.display = "none";
    if (blocoFilme) blocoFilme.style.display = "block";
    if (infoTemporadas) infoTemporadas.style.display = "none";

    const btnPlay = document.getElementById("btn-play-filme");
    if (btnPlay) {
        btnPlay.classList.remove("disabled");
        btnPlay.innerHTML = `
            <span class="material-symbols-outlined">play_arrow</span>
            ASSISTIR
        `;
        btnPlay.onclick = (e) => {
            e.preventDefault();
            const epFilme = item.episodios?.[0] || item;
            const epId = item.episodios?.[0]?.id || itemId;

            if (epFilme?.data_lancamento && ehEpisodioFuturo(epFilme.data_lancamento)) {
                const dataFmt = formatarDataEpisodio(epFilme.data_lancamento);
                alert(`Este título estará disponível em ${dataFmt || 'breve'}.`);
                return;
            }

            if (temVideoDisponivel(item) || temVideoDisponivel(epFilme)) {
                window.location.hash = `#player?anime=${encodeURIComponent(itemId)}&ep=${encodeURIComponent(epId)}`;
            } else {
                alert("Vídeo indisponível para este título.");
            }
        };
    }
}

async function configurarModoSerie(item, itemId, tempParam, dom) {
    const infoTemporadas = document.getElementById("info-temporadas");
    if (dom.blocoFilme) dom.blocoFilme.style.display = "block";
    if (dom.blocoEpisodios) dom.blocoEpisodios.style.display = "block";

    // Define a capa padrão do anime para usar como fallback na thumb do episódio
    const capaPadraoAnime = item.banner || item.poster_detalhes || item.poster || "";

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

    let epAlvo = null;
    let textoBotao = "";
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

    if (ultimoInteragido) {
        const { ep, idx, prog } = ultimoInteragido;
        const estaConcluido = prog.concluido || (prog.total > 0 && (prog.tempo / prog.total) >= 0.85);

        if (estaConcluido) {
            if (idx + 1 < todosEpisodios.length) {
                epAlvo = todosEpisodios[idx + 1];
                const rawTitle = epAlvo.titulo || `Episódio ${epAlvo.index}`;
                const baseTitle = stripLeadingNumber(rawTitle) || rawTitle;
                textoBotao = `PRÓXIMO: ${epAlvo.index} • ${baseTitle}`;
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

    const btnPlay = document.getElementById("btn-play-filme");
    if (btnPlay) {
        btnPlay.classList.remove("disabled");
        if (epAlvo) {
            btnPlay.innerHTML = `
                <span class="material-symbols-outlined">play_arrow</span>
                ${textoBotao.toUpperCase()}
            `;

            btnPlay.onclick = (e) => {
                e.preventDefault();

                if (epAlvo?.data_lancamento && ehEpisodioFuturo(epAlvo.data_lancamento)) {
                    const dataFmt = formatarDataEpisodio(epAlvo.data_lancamento);
                    alert(`Este episódio estará disponível em ${dataFmt || 'breve'}.`);
                    return;
                }

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

    configurarBotoesAcaoEpisodios(itemId, temporadaIndex, temporadasAtuais, mapaProgresso, dom, epAlvo?.id, capaPadraoAnime);

    const tempAtiva = temporadasAtuais[temporadaIndex];
    if (tempAtiva && tempAtiva.episodios) {
        renderizarListaEpisodios(
            tempAtiva.episodios, 
            dom.containerEps, 
            dom.modeloEp, 
            itemId, 
            temporadaIndex, 
            mapaProgresso,
            epAlvo?.id,
            capaPadraoAnime
        );
    } else {
        dom.containerEps.innerHTML = "<p style='color: #888; padding: 10px;'>Nenhum episódio disponível nesta temporada.</p>";
    }
}

function configurarBotoesAcaoEpisodios(itemId, temporadaIndex, temporadasAtuais, mapaProgresso, dom, proximoEpId, capaPadraoAnime = "") {
    const btnOrdenar = document.getElementById("btn-ordenar-eps");
    const btnMarcarTemporada = document.getElementById("btn-marcar-temporada");

    if (btnOrdenar) {
        btnOrdenar.onclick = () => {
            alternarOrdemEpisodios();
            const tempAtiva = temporadasAtuais[temporadaIndex];
            if (tempAtiva && tempAtiva.episodios) {
                renderizarListaEpisodios(
                    tempAtiva.episodios,
                    dom.containerEps,
                    dom.modeloEp,
                    itemId,
                    temporadaIndex,
                    mapaProgresso,
                    proximoEpId,
                    capaPadraoAnime
                );
            }
        };
    }

    if (btnMarcarTemporada) {
        btnMarcarTemporada.onclick = () => {
            const tempAtiva = temporadasAtuais[temporadaIndex];
            if (tempAtiva && tempAtiva.episodios) {
                alternarStatusTemporada(tempAtiva.episodios, itemId, temporadaIndex, mapaProgresso);
            }
        };
    }
}
