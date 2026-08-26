// js/modules/pesquisa.js

import { obterInfoCompleta } from '../database/repository.js';

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

    // Variável para armazenar o temporizador do debounce
    let timeoutDebounce = null;

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

    // Escuta a digitação no input com atraso (debounce) de 250ms
    inputBusca.addEventListener("input", (e) => {
        const termoBusca = normalizarTexto(e.target.value.trim());

        if (btnLimpar) {
            btnLimpar.style.display = termoBusca ? "flex" : "none";
        }

        // Cancela a busca anterior pendente se o usuário continuar digitando
        clearTimeout(timeoutDebounce);

        if (termoBusca === "") {
            gradeResultados.innerHTML = "";
            if (msgVazia) msgVazia.style.display = "none";
            return;
        }

        // Aguarda 250ms após a última digitação para executar o filtro
        timeoutDebounce = setTimeout(async () => {
            try {
                const bancoDados = await obterInfoCompleta();
                if (!bancoDados) return;

                executarFiltro(termoBusca, bancoDados, gradeResultados, modeloCard, msgVazia);
            } catch (erro) {
                console.error("Erro ao realizar busca:", erro);
            }
        }, 250);
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

        // Reúne todas as variações de títulos disponíveis no banco
        const titulos = [
            anime.titulo,
            anime.titulo_en,
            anime.titulo_pt,
            anime.titulo_jp,
            ...(Array.isArray(anime.titulos_alternativos) ? anime.titulos_alternativos : [])
        ].filter(Boolean);

        // Verifica se algum dos títulos bate com a busca
        const matchesTitulo = titulos.some(t => normalizarTexto(t).includes(termo));

        // Verifica se algum dos gêneros bate com a busca
        const matchesGenero = Array.isArray(anime.generos) && 
            anime.generos.some(g => normalizarTexto(g).includes(termo));

        if (matchesTitulo || matchesGenero) {
            totalEncontrados++;

            const clone = template.content.cloneNode(true);
            const linkCard = clone.querySelector("a");
            const imgCard = clone.querySelector("img");
            const tituloCard = clone.querySelector(".card-title");

            if (linkCard && imgCard && tituloCard) {
                linkCard.href = `#info?anime=${encodeURIComponent(animeId)}`;
                imgCard.alt = `Capa de ${anime.titulo || animeId}`;
                tituloCard.textContent = anime.titulo || animeId;

                const urlCapa = anime.poster || anime.poster_detalhes || anime.banner || "";
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
