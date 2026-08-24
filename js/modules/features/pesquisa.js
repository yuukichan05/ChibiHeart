// js/modules/pesquisa.js

import { obterInfoCompleta } from '../database/repository.js';

function normalizarTexto(texto) { //[cite: 1]
    return (texto || "") //[cite: 1]
        .normalize("NFD") //[cite: 1]
        .replace(/[\u0300-\u036f]/g, "") //[cite: 1]
        .toLowerCase(); //[cite: 1]
}

export async function inicializarPesquisa() { //[cite: 1]
    const inputBusca = document.getElementById("input-busca"); //[cite: 1]
    const gradeResultados = document.getElementById("grade-resultados-busca"); //[cite: 1]
    const modeloCard = document.getElementById("modelo-card-anime"); //[cite: 1]
    const msgVazia = document.getElementById("busca-vazia"); //[cite: 1]
    const btnLimpar = document.getElementById("btn-limpar-busca"); //[cite: 1]

    if (!inputBusca || !gradeResultados || !modeloCard) return; //[cite: 1]

    // Variável para armazenar o temporizador do debounce
    let timeoutDebounce = null;

    // Ação do botão de limpar busca
    if (btnLimpar) { //[cite: 1]
        btnLimpar.addEventListener("click", () => { //[cite: 1]
            inputBusca.value = ""; //[cite: 1]
            gradeResultados.innerHTML = ""; //[cite: 1]
            btnLimpar.style.display = "none"; //[cite: 1]
            if (msgVazia) msgVazia.style.display = "none"; //[cite: 1]
            inputBusca.focus(); //[cite: 1]
        });
    }

    // Escuta a digitação no input com atraso (debounce) de 250ms
    inputBusca.addEventListener("input", (e) => { //[cite: 1]
        const termoBusca = normalizarTexto(e.target.value.trim()); //[cite: 1]

        if (btnLimpar) { //[cite: 1]
            btnLimpar.style.display = termoBusca ? "flex" : "none"; //[cite: 1]
        }

        // Cancela a busca anterior pendente se o usuário continuar digitando
        clearTimeout(timeoutDebounce);

        if (termoBusca === "") { //[cite: 1]
            gradeResultados.innerHTML = ""; //[cite: 1]
            if (msgVazia) msgVazia.style.display = "none"; //[cite: 1]
            return; //[cite: 1]
        }

        // Aguarda 250ms após a última digitação para executar o filtro
        timeoutDebounce = setTimeout(async () => {
            try { //[cite: 1]
                const bancoDados = await obterInfoCompleta(); //[cite: 1]
                if (!bancoDados) return; //[cite: 1]

                executarFiltro(termoBusca, bancoDados, gradeResultados, modeloCard, msgVazia); //[cite: 1]
            } catch (erro) { //[cite: 1]
                console.error("Erro ao realizar busca:", erro); //[cite: 1]
            }
        }, 250);
    });
}

function executarFiltro(termo, bancoDados, container, template, feedbackVazio) { //[cite: 1]
    container.innerHTML = ""; //[cite: 1]
    let totalEncontrados = 0; //[cite: 1]

    const frag = document.createDocumentFragment(); //[cite: 1]

    Object.keys(bancoDados).forEach(animeId => { //[cite: 1]
        const anime = bancoDados[animeId]; //[cite: 1]
        
        // Proteção contra registros vazios
        if (!anime) return; //[cite: 1]

        const tituloNormalizado = normalizarTexto(anime.titulo); //[cite: 1]
        const matchesGenero = Array.isArray(anime.generos) &&  //[cite: 1]
            anime.generos.some(g => normalizarTexto(g).includes(termo)); //[cite: 1]

        if (tituloNormalizado.includes(termo) || matchesGenero) { //[cite: 1]
            totalEncontrados++; //[cite: 1]

            const clone = template.content.cloneNode(true); //[cite: 1]
            const linkCard = clone.querySelector("a"); //[cite: 1]
            const imgCard = clone.querySelector("img"); //[cite: 1]
            const tituloCard = clone.querySelector(".card-title"); //[cite: 1]

            if (linkCard && imgCard && tituloCard) { //[cite: 1]
                linkCard.href = `#info?anime=${encodeURIComponent(animeId)}`; //[cite: 1]
                imgCard.alt = `Capa de ${anime.titulo || animeId}`; //[cite: 1]
                tituloCard.textContent = anime.titulo || animeId; //[cite: 1]

                const urlCapa = anime.poster || anime.banner || ""; //[cite: 1]
                if (urlCapa) { //[cite: 1]
                    imgCard.src = urlCapa; //[cite: 1]
                    if (imgCard.complete) { //[cite: 1]
                        imgCard.classList.add('loaded'); //[cite: 1]
                    } else {
                        imgCard.onload = () => imgCard.classList.add('loaded'); //[cite: 1]
                    }
                }

                frag.appendChild(clone); //[cite: 1]
            }
        }
    });

    container.appendChild(frag); //[cite: 1]

    if (feedbackVazio) { //[cite: 1]
        feedbackVazio.style.display = totalEncontrados === 0 ? "block" : "none"; //[cite: 1]
    }
}
