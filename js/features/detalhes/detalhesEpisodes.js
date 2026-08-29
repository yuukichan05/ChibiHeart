import { buscarProgressoDB, alternarConcluidoDB } from '../../data/database/db.js';
import { 
    makeEpisodeId, 
    stripLeadingNumber, 
    formatarDataEpisodio, 
    ehLancamentoRecente, 
    ehEpisodioFuturo 
} from './detalhesUtils.js';
import { gerenciarTelaInfo } from './detalhesView.js';

const DEFAULT_EP_THUMB = "assets/images/placeholder.jpg";

export let episodesMap = {};
export let ordemCrescente = true;

let isProcessingAction = false;

export function alternarOrdemEpisodios() {
    ordemCrescente = !ordemCrescente;
    return ordemCrescente;
}

export function limparMapaEpisodios() {
    episodesMap = {};
}

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

/**
 * Renderiza a lista de episódios na DOM.
 */
export function renderizarListaEpisodios(
    listaEpisodios, 
    container, 
    modelo, 
    animeId, 
    seasonIndex = 0, 
    mapaProgresso = {}, 
    proximoEpId = null,
    capaPadraoAnime = ""
) {
    container.innerHTML = "";

    if (!Array.isArray(listaEpisodios) || listaEpisodios.length === 0) {
        container.innerHTML = "<p style='color: #888; padding: 10px;'>Nenhum episódio disponível nesta temporada.</p>";
        return;
    }

    const listaOrdenada = [...listaEpisodios];
    listaOrdenada.sort((a, b) => {
        const idxA = a.index || 0;
        const idxB = b.index || 0;
        return ordemCrescente ? idxA - idxB : idxB - idxA;
    });

    const frag = document.createDocumentFragment();

    listaOrdenada.forEach((ep, epIndex) => {
        if (typeof ep.index !== 'number') ep.index = epIndex + 1;
        if (!ep.id) ep.id = makeEpisodeId(animeId, seasonIndex + 1, ep.index);

        const clone = modelo.content.cloneNode(true);

        const imgEl = clone.querySelector("img");
        const durationEl = clone.querySelector(".ep-duration");
        const titleEl = clone.querySelector(".card-title-ep");
        const subtitleEl = clone.querySelector(".card-descricao-ep");
        const cardWrapper = clone.querySelector(".card-ep");
        const badgeProximo = clone.querySelector(".badge-proximo-ep");

        const containerBarra = clone.querySelector(".barra-progresso-container");
        const preenchimentoBarra = clone.querySelector(".barra-progresso-preenchimento");

        const rawTitle = ep.titulo || '';
        const baseTitle = stripLeadingNumber(rawTitle) || rawTitle;
        const displayTitle = `${String(ep.index).padStart(2, '0')}. ${baseTitle}`;

        const dataFormatada = formatarDataEpisodio(ep.data_lancamento);
        const eFuturo = ehEpisodioFuturo(ep.data_lancamento);

        if (imgEl) {
            // Encadeamento: ep.thumb -> capa do anime (banner/poster) -> placeholder
            const imagemEfetiva = ep.thumb || capaPadraoAnime || DEFAULT_EP_THUMB;
            imgEl.src = imagemEfetiva;
            imgEl.dataset.src = imagemEfetiva;
            imgEl.alt = ep.titulo || `Episódio ${epIndex + 1}`;
        }
        if (durationEl) durationEl.textContent = ep.duracao || "";
        if (titleEl) titleEl.textContent = displayTitle;
        
        if (subtitleEl) {
            const textoDescricao = ep.descricao || "Sem descrição disponível.";
            const sufixoData = dataFormatada ? ` • Lançado em ${dataFormatada}` : '';
            subtitleEl.innerHTML = `<span class="marquee-content">${textoDescricao}${sufixoData}</span>`;
        }

        if (cardWrapper) {
            cardWrapper.dataset.epId = ep.id;
            cardWrapper.style.cursor = "pointer";

            if (eFuturo) {
                cardWrapper.classList.add("ep-bloqueado");
                cardWrapper.style.opacity = "0.6";
            }

            if (badgeProximo) {
                if (proximoEpId && ep.id === proximoEpId) {
                    cardWrapper.classList.add("card-proximo-ep");
                    badgeProximo.style.display = "inline-block";
                    badgeProximo.textContent = "A SEGUIR";
                } else if (eFuturo) {
                    badgeProximo.style.display = "inline-block";
                    badgeProximo.textContent = "EM BREVE";
                    badgeProximo.style.backgroundColor = "#e67e22";
                }
            }
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

export async function solicitarMarcaAssistido(epId) {
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

export async function alternarStatusTemporada(listaEpisodios, animeId, seasonIndex, mapaProgresso = {}) {
    if (isProcessingAction || !Array.isArray(listaEpisodios) || listaEpisodios.length === 0) return;
    isProcessingAction = true;

    try {
        const idsEps = listaEpisodios.map((ep, idx) => {
            const epIdx = ep.index || (idx + 1);
            return ep.id || makeEpisodeId(animeId, seasonIndex + 1, epIdx);
        });

        const todosConcluidos = idsEps.every(id => {
            const p = mapaProgresso[id];
            return p?.concluido || (p?.total > 0 && (p.tempo / p.total) >= 0.85);
        });

        const novoStatus = !todosConcluidos;
        const acaoTexto = novoStatus ? "marcar TODOS" : "desmarcar TODOS";
        const mensagem = `Deseja ${acaoTexto} os episódios desta temporada como assistidos?`;

        if (confirm(mensagem)) {
            for (const id of idsEps) {
                await alternarConcluidoDB(id, novoStatus);
            }
            await gerenciarTelaInfo();
        }
    } catch (erro) {
        console.error("Erro ao alterar status da temporada:", erro);
    } finally {
        setTimeout(() => {
            isProcessingAction = false;
        }, 500);
    }
}
