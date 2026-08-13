// js/modules/inicio.js

import { 
  obterInfoCompleta, 
  obterRecomendados, 
  obterRecentes 
} from './repository.js';

/**
 * 1. Carrega os animes Recomendados / Destaques
 */
export async function carregarAnimesRecomendados() {
    const grade = document.getElementById("grade-recomendados");
    const modelo = document.getElementById("modelo-card-anime");

    if (!grade || !modelo) return;

    try {
        const [listaIds, infoCompleta] = await Promise.all([
            obterRecomendados(),
            obterInfoCompleta()
        ]);

        if (!listaIds || !infoCompleta || listaIds.length === 0) return;

        grade.innerHTML = "";

        listaIds.forEach((item) => {
            const animeId = item.id;
            const anime = infoCompleta[animeId];

            if (!anime) return;

            const clone = modelo.content.cloneNode(true);
            const linkCard = clone.querySelector("a");
            const imgCard = clone.querySelector("img");
            const tituloCard = clone.querySelector(".card-title");

            if (linkCard && imgCard && tituloCard) {
                linkCard.href = `#info?anime=${animeId}`;
                imgCard.src = anime.poster || anime.banner || "";
                imgCard.alt = `Capa de ${anime.titulo || animeId}`;
                tituloCard.textContent = anime.titulo || animeId;

                grade.appendChild(clone);
            }
        });

    } catch (erro) {
        console.error("❌ [Recomendados] Falha crítica:", erro);
    }
}

/**
 * 2. Carrega os animes Adicionados Recentes
 */
export async function carregarAnimesRecentes() {
    const grade = document.getElementById("grade-recentes");
    const modelo = document.getElementById("modelo-card-anime");

    if (!grade || !modelo) return;

    try {
        const [listaIds, infoCompleta] = await Promise.all([
            obterRecentes(),
            obterInfoCompleta()
        ]);

        if (!listaIds || !infoCompleta || !Array.isArray(listaIds) || listaIds.length === 0) return;

        grade.innerHTML = "";

        listaIds.forEach((item) => {
            const animeId = item.id;
            const anime = infoCompleta[animeId];

            if (!anime) return;

            const clone = modelo.content.cloneNode(true);
            const linkCard = clone.querySelector("a");
            const imgCard = clone.querySelector("img");
            const tituloCard = clone.querySelector(".card-title");

            if (linkCard && imgCard && tituloCard) {
                linkCard.href = `#info?anime=${animeId}`;
                imgCard.src = anime.poster || anime.banner || "";
                imgCard.alt = `Capa de ${anime.titulo || animeId}`;
                tituloCard.textContent = anime.titulo || animeId;

                grade.appendChild(clone);
            }
        });

    } catch (erro) {
        console.error("❌ [Recentes] Falha ao carregar:", erro);
    }
}

/**
 * 3. Carrega as Seções organizadas por Gênero
 */
export async function carregarAnimesPorGenero() {
    const containerPrincipal = document.getElementById("inicio");
    const modeloSecao = document.getElementById("modelo-secao-genero");
    const modeloCard = document.getElementById("modelo-card-anime");

    if (!containerPrincipal || !modeloSecao || !modeloCard) return;

    const secoesExistentes = containerPrincipal.querySelectorAll(".secao-genero-container");
    secoesExistentes.forEach(secao => secao.remove());

    try {
        const infoCompleta = await obterInfoCompleta();
        if (!infoCompleta) return;

        const setGeneros = new Set();
        Object.values(infoCompleta).forEach(anime => {
            if (Array.isArray(anime.generos)) {
                anime.generos.forEach(g => setGeneros.add(g));
            }
        });

        // Embaralha a ordem das seções de gêneros
        let listaGeneros = embaralharLista(Array.from(setGeneros));

        listaGeneros.forEach(generoAlvo => {
            const cloneSecao = modeloSecao.content.cloneNode(true);
            const tituloSecao = cloneSecao.querySelector(".titulo-categoria");
            const gradeCards = cloneSecao.querySelector(".cards-grid");

            if (!tituloSecao || !gradeCards) return;

            tituloSecao.textContent = generoAlvo;

            // Embaralha os animes individualmente para cada gênero renderizado
            const animesEmbaralhados = embaralharLista(Object.keys(infoCompleta));

            animesEmbaralhados.forEach(animeId => {
                const anime = infoCompleta[animeId];

                if (anime.generos && anime.generos.includes(generoAlvo)) {
                    const cloneCard = modeloCard.content.cloneNode(true);
                    const linkCard = cloneCard.querySelector("a");
                    const imgCard = cloneCard.querySelector("img");
                    const tituloCard = cloneCard.querySelector(".card-title");

                    if (linkCard && imgCard && tituloCard) {
                        linkCard.href = `#info?anime=${animeId}`;
                        imgCard.src = anime.poster || anime.banner || "";
                        imgCard.alt = `Capa de ${anime.titulo || animeId}`;
                        tituloCard.textContent = anime.titulo || animeId;

                        gradeCards.appendChild(cloneCard);
                    }
                }
            });

            if (gradeCards.children.length > 0) {
                containerPrincipal.appendChild(cloneSecao);
            }
        });

    } catch (erro) {
        console.error("❌ [Gêneros] Falha crítica:", erro);
    }
}

function embaralharLista(array) {
    let copia = [...array];
    for (let i = copia.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copia[i], copia[j]] = [copia[j], copia[i]];
    }
    return copia;
}
