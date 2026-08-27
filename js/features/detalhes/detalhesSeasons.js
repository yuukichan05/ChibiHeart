import { renderizarListaEpisodios } from './detalhesEpisodes.js';
import { buscarTodoProgressoDB } from '../../data/database/db.js';

let temporadasAtuais = [];
let temporadaSelecionadaIndex = 0;

/**
 * Alterna a visibilidade do menu Pop-up de temporadas
 */
export function toggleMenuTemporadas(event) {
    if (event) event.stopPropagation();
    const popup = document.getElementById('popup-temporadas');
    const btnAtual = document.getElementById('btn-selecionar-temporada');
    
    if (popup) {
        const ativo = popup.classList.toggle('ativo');
        if (btnAtual) {
            btnAtual.setAttribute('aria-expanded', ativo);
        }
    }
}

/**
 * Fecha o menu Pop-up
 */
export function fecharMenuTemporadas() {
    const popup = document.getElementById('popup-temporadas');
    const btnAtual = document.getElementById('btn-selecionar-temporada');
    
    if (popup && popup.classList.contains('ativo')) {
        popup.classList.remove('ativo');
        if (btnAtual) {
            btnAtual.setAttribute('aria-expanded', 'false');
        }
    }
}

// Fecha o pop-up automaticamente ao clicar em qualquer lugar fora dele
document.addEventListener('click', (e) => {
    const container = document.getElementById('container-seletor-temporadas');
    if (container && !container.contains(e.target)) {
        fecharMenuTemporadas();
    }
});

// Expõe para o escopo global para uso no atributo onclick do HTML
window.toggleMenuTemporadas = toggleMenuTemporadas;
window.fecharMenuTemporadas = fecharMenuTemporadas;

/**
 * Inicializa a estrutura de temporadas do anime/série.
 */
export function inicializarTemporadas(item, tempParam, customSelectContainer, infoTemporadas, containerEps, modeloEp, itemId) {
    if (Array.isArray(item.temporadas) && item.temporadas.length > 0) {
        temporadasAtuais = item.temporadas;
        if (infoTemporadas) {
            const totalTemp = item.temporadas.length;
            infoTemporadas.textContent = `${totalTemp} ${totalTemp === 1 ? 'Temporada' : 'Temporadas'}`;
            infoTemporadas.style.display = "inline";
        }
    } else if (Array.isArray(item.episodios)) {
        const tipoLower = String(item.tipo || '').toLowerCase();
        let nomeBloco = "Temporada Única";
        if (tipoLower === 'ova') nomeBloco = "OVAs";
        else if (tipoLower === 'especial') nomeBloco = "Especiais";

        temporadasAtuais = [{ nome: nomeBloco, episodios: item.episodios }];
        if (infoTemporadas) {
            infoTemporadas.textContent = "1 Temporada";
            infoTemporadas.style.display = "inline";
        }
    } else {
        temporadasAtuais = [];
        if (infoTemporadas) infoTemporadas.style.display = "none";
    }

    // Regra: Oculta o seletor quando houver apenas 1 temporada (ou nenhuma)
    const containerSeletor = customSelectContainer || document.getElementById('container-seletor-temporadas');
    if (containerSeletor) {
        if (temporadasAtuais.length <= 1) {
            containerSeletor.style.display = "none";
        } else {
            containerSeletor.style.display = "inline-block";
        }
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
 * Renderiza as opções dentro do Pop-up de seleção de temporadas.
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

        item.onclick = function (e) {
            e.stopPropagation();
            mudarTemporada(index, containerEps, modeloEp);
        };

        popup.appendChild(item);
    });
}

/**
 * Altera a temporada ativa, fecha o pop-up e atualiza a URL e a lista de episódios.
 */
export async function mudarTemporada(index, containerEps, modeloEp, proximoEpId = null) {
    temporadaSelecionadaIndex = index;

    const novaTempNum = index + 1;
    const urlAtual = new URL(window.location.href);
    const [hashBase, hashQuery] = urlAtual.hash.split("?");
    const params = new URLSearchParams(hashQuery || "");
    params.set("temp", novaTempNum);

    history.replaceState(null, "", `${hashBase}?${params.toString()}`);

    renderizarPopUpTemporadas(containerEps, modeloEp);

    // Fecha o menu Pop-up após escolher a temporada
    fecharMenuTemporadas();

    const currentAnimeId = params.get("anime") || params.get("id") || "";
    const mapaProgresso = await buscarTodoProgressoDB();

    if (temporadasAtuais[index] && temporadasAtuais[index].episodios) {
        renderizarListaEpisodios(
            temporadasAtuais[index].episodios, 
            containerEps, 
            modeloEp, 
            currentAnimeId, 
            index, 
            mapaProgresso, 
            proximoEpId
        );
    } else {
        containerEps.innerHTML = "<p style='color: #888; padding: 10px;'>Nenhum episódio disponível nesta temporada.</p>";
    }
}
