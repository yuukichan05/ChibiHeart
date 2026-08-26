// js/modules/features/detalhes/detalhesEpisodes.js

import { buscarProgressoDB, alternarConcluidoDB } from '../../database/db.js';
import { makeEpisodeId, stripLeadingNumber } from './detalhesUtils.js';
import { gerenciarTelaInfo } from './detalhesView.js';

// --- ESTADO LOCAL E MAPEAMENTOS ---
export let episodesMap = {};

// Trava global para evitar múltiplos disparos seguidos
let isProcessingAction = false;

/**
 * Zera o mapeamento de episódios da memória.
 */
export function limparMapaEpisodios() {
    episodesMap = {};
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

/**
 * Renderiza a lista de episódios na DOM.
 */
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

/**
 * Pop-up de confirmação para marcar ou desmarcar episódio como assistido.
 */
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
