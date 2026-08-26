// js/modules/features/detalhes/detalhesSeasons.js

import { renderizarListaEpisodios } from './detalhesEpisodes.js';

let temporadasAtuais = [];
let temporadaSelecionadaIndex = 0;

/**
 * Inicializa a estrutura de temporadas do anime/série.
 */
export function inicializarTemporadas(item, tempParam, customSelectContainer, infoTemporadas, containerEps, modeloEp, itemId) {
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

/**
 * Renderiza as opções dentro do pop-up de seleção de temporadas.
 */
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

/**
 * Altera a temporada ativa e atualiza a URL e a lista de episódios.
 */
export function mudarTemporada(index, containerEps, modeloEp) {
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

    const currentAnimeId = params.get("anime") || params.get("id") || "";

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

// Oculta o pop-up ao clicar fora dele
window.addEventListener("click", (event) => {
    if (!event.target.matches('#btn-selecionar-temporada')) {
        const popup = document.getElementById("popup-temporadas");
        if (popup && popup.classList.contains('mostrar')) {
            popup.classList.remove('mostrar');
        }
    }
});
