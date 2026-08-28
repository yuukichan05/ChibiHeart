// js/core/imageObserver.js

let instance = null;

function criarObserver() {
    if (!('IntersectionObserver' in window)) return null;

    return new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            const img = entry.target;
            const urlOriginal = img.dataset.src;
            if (!urlOriginal) return;

            if (entry.isIntersecting) {
                if (img.getAttribute("src") !== urlOriginal) {
                    img.onload = () => img.classList.add("loaded");
                    img.onerror = () => {
                        const fallback = img.dataset.fallback;
                        if (fallback && img.src !== fallback) {
                            img.src = fallback;
                        } else {
                            img.classList.add("loaded");
                        }
                    };

                    img.src = urlOriginal;

                    if (img.complete && img.naturalWidth !== 0) {
                        img.classList.add("loaded");
                    }
                }
            } else {
                if (img.hasAttribute("src")) {
                    img.removeAttribute("src");
                    img.classList.remove("loaded");
                }
            }
        });
    }, { rootMargin: "250px 0px" });
}

/**
 * Observa uma única imagem (ideal para rendering manual via loop)
 */
export function observarImagem(imgElement) {
    if (!imgElement) return;

    if (!instance) instance = criarObserver();

    if (instance) {
        instance.observe(imgElement);
    } else {
        const urlOriginal = imgElement.dataset.src;
        if (urlOriginal) {
            imgElement.src = urlOriginal;
            imgElement.classList.add("loaded");
        }
    }
}

/**
 * NOVO: Observa um container inteiro e detecta novos filhos via MutationObserver.
 * Serve para qualquer tela com trocas dinâmicas (temporadas, abas, paginação).
 */
export function observarContainer(containerElement) {
    if (!containerElement) return;

    const varrerEObservar = () => {
        const imagens = containerElement.querySelectorAll("img");
        imagens.forEach((img) => {
            const currentSrc = img.getAttribute("src") || img.src;
            if (currentSrc && !img.dataset.src) {
                img.dataset.src = currentSrc;
                img.removeAttribute("src");
                img.classList.remove("loaded");
            }
            if (img.dataset.src) {
                observarImagem(img);
            }
        });
    };

    // Executa na chamada inicial
    varrerEObservar();

    // Ativa MutationObserver apenas uma vez por container
    if (!containerElement.dataset.mutationObserved) {
        containerElement.dataset.mutationObserved = "true";
        const mutationObs = new MutationObserver(() => varrerEObservar());
        mutationObs.observe(containerElement, { childList: true, subtree: true });
    }
}
