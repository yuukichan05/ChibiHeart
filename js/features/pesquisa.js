// js/modules/pesquisa.js

import { obterInfoCompleta } from '../data/database/repository.js';

let bancoDadosCache = null;
let observerImagensBusca = null;

function normalizarTexto(texto) {
    return (texto || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
}

/**
 * Cria ou reutiliza o IntersectionObserver com gestão ativa de memória RAM/GPU.
 * Carrega a imagem ao entrar na tela e descarrega a tag src ao sair do viewport.
 */
function obterObserverImagens() {
    if (!observerImagensBusca && 'IntersectionObserver' in window) {
        observerImagensBusca = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const img = entry.target;
                const urlOriginal = img.dataset.src;
                if (!urlOriginal) return;

                if (entry.isIntersecting) {
                    // ENTROU NA TELA: carrega a imagem do cache/rede
                    if (img.getAttribute("src") !== urlOriginal) {
                        img.onload = () => img.classList.add("loaded");
                        img.onerror = () => img.classList.add("loaded");
                        img.src = urlOriginal;

                        if (img.complete && img.naturalWidth !== 0) {
                            img.classList.add("loaded");
                        }
                    }
                } else {
                    // SAIU DA TELA: descarrega a imagem da RAM/GPU mantendo o dataset e container
                    if (img.hasAttribute("src")) {
                        img.removeAttribute("src");
                        img.classList.remove("loaded");
                    }
                }
            });
        }, { rootMargin: '200px 0px' }); // Pré-carrega 200px antes de visível
    }
    return observerImagensBusca;
}

export async function inicializarPesquisa() {
    const inputBusca = document.getElementById("input-busca");
    const gradeResultados = document.getElementById("grade-resultados-busca");
    const modeloCard = document.getElementById("modelo-card-anime");
    const msgVazia = document.getElementById("busca-vazia");
    const btnLimpar = document.getElementById("btn-limpar-busca");

    if (!inputBusca || !gradeResultados || !modeloCard) return;

    let timeoutDebounce = null;

    const limparBusca = () => {
        inputBusca.value = "";
        gradeResultados.innerHTML = "";
        if (btnLimpar) btnLimpar.style.display = "none";
        if (msgVazia) msgVazia.style.display = "none";
        inputBusca.focus();
    };

    if (btnLimpar) {
        btnLimpar.addEventListener("click", limparBusca);
    }

    // Atalho com a tecla ESC para limpar a busca
    inputBusca.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            limparBusca();
        }
    });

    // Escuta a digitação no input com debounce otimizado de 200ms
    inputBusca.addEventListener("input", (e) => {
        const termoBusca = normalizarTexto(e.target.value.trim());

        if (btnLimpar) {
            btnLimpar.style.display = termoBusca ? "flex" : "none";
        }

        clearTimeout(timeoutDebounce);

        if (termoBusca === "") {
            gradeResultados.innerHTML = "";
            if (msgVazia) msgVazia.style.display = "none";
            return;
        }

        timeoutDebounce = setTimeout(async () => {
            try {
                // Reaproveita o cache do banco de dados na memória
                if (!bancoDadosCache) {
                    bancoDadosCache = await obterInfoCompleta();
                }
                if (!bancoDadosCache) return;

                executarFiltro(termoBusca, bancoDadosCache, gradeResultados, modeloCard, msgVazia);
            } catch (erro) {
                console.error("Erro ao realizar busca:", erro);
            }
        }, 200);
    });
}

function executarFiltro(termo, bancoDados, container, template, feedbackVazio) {
    container.innerHTML = "";
    let totalEncontrados = 0;

    const frag = document.createDocumentFragment();
    const observer = obterObserverImagens();

    Object.keys(bancoDados).forEach(animeId => {
        const anime = bancoDados[animeId];
        
        if (!anime) return;

        // Reúne variações de títulos disponíveis
        const titulos = [
            anime.titulo,
            anime.titulo_en,
            anime.titulo_pt,
            anime.titulo_jp,
            ...(Array.isArray(anime.titulos_alternativos) ? anime.titulos_alternativos : [])
        ].filter(Boolean);

        const matchesTitulo = titulos.some(t => normalizarTexto(t).includes(termo));
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
                    imgCard.dataset.src = urlCapa;
                    imgCard.classList.remove('loaded');

                    if (observer) {
                        observer.observe(imgCard);
                    } else {
                        // Fallback de carregamento direto caso IntersectionObserver não esteja disponível
                        imgCard.src = urlCapa;
                        if (imgCard.complete) {
                            imgCard.classList.add('loaded');
                        } else {
                            imgCard.onload = () => imgCard.classList.add('loaded');
                        }
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
