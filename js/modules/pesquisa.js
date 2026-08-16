// js/modules/pesquisa.js

import { obterInfoCompleta } from './repository.js';

function normalizarTexto(texto) {
    return (texto || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
}

export async function inicializarPesquisa() {
    const inputBusca = document.getElementById("input-busca");
    const gradeResultados = document.getElementById("grade-resultados-busca");
    const modeloCard = document.getElementById("modelo-card-anime");
    const msgVazia = document.getElementById("busca-vazia");
    const btnLimpar = document.getElementById("btn-limpar-busca");

    if (!inputBusca || !gradeResultados || !modeloCard) return;

    // Ação do botão de limpar busca
    if (btnLimpar) {
        btnLimpar.addEventListener("click", () => {
            inputBusca.value = "";
            gradeResultados.innerHTML = "";
            btnLimpar.style.display = "none";
            if (msgVazia) msgVazia.style.display = "none";
            inputBusca.focus();
        });
    }

    // Escuta a digitação no input
    inputBusca.addEventListener("input", async (e) => {
        const termoBusca = normalizarTexto(e.target.value.trim());

        if (btnLimpar) {
            btnLimpar.style.display = termoBusca ? "flex" : "none";
        }

        if (termoBusca === "") {
            gradeResultados.innerHTML = "";
            if (msgVazia) msgVazia.style.display = "none";
            return;
        }

        try {
            const bancoDados = await obterInfoCompleta();
            if (!bancoDados) return;

            executarFiltro(termoBusca, bancoDados, gradeResultados, modeloCard, msgVazia);
        } catch (erro) {
            console.error("Erro ao realizar busca:", erro);
        }
    });
}

function executarFiltro(termo, bancoDados, container, template, feedbackVazio) {
    container.innerHTML = "";
    let totalEncontrados = 0;

    const frag = document.createDocumentFragment();

    Object.keys(bancoDados).forEach(animeId => {
        const anime = bancoDados[animeId];
        
        // Proteção contra registros vazios
        if (!anime) return;

        const tituloNormalizado = normalizarTexto(anime.titulo);
        const matchesGenero = Array.isArray(anime.generos) && 
            anime.generos.some(g => normalizarTexto(g).includes(termo));

        if (tituloNormalizado.includes(termo) || matchesGenero) {
            totalEncontrados++;

            const clone = template.content.cloneNode(true);
            const linkCard = clone.querySelector("a");
            const imgCard = clone.querySelector("img");
            const tituloCard = clone.querySelector(".card-title");

            if (linkCard && imgCard && tituloCard) {
                linkCard.href = `#info?anime=${encodeURIComponent(animeId)}`;
                imgCard.alt = `Capa de ${anime.titulo || animeId}`;
                tituloCard.textContent = anime.titulo || animeId;

                const urlCapa = anime.poster || anime.banner || "";
                if (urlCapa) {
                    imgCard.src = urlCapa;
                    if (imgCard.complete) {
                        imgCard.classList.add('loaded');
                    } else {
                        imgCard.onload = () => imgCard.classList.add('loaded');
                    }
                }

                frag.appendChild(clone);
            }
        }
    });

    container.appendChild(frag);

    if (feedbackVazio) {
        feedbackVazio.style.display = totalEncontrados === 0 ? "block" : "none";
    }
}
