// js/modules/repository.js

let cacheInfo = null;
let cacheRecomendados = null;
let cacheRecentes = null;
let cacheNovosEpisodios = null;

/**
 * Busca e armazena em cache os dados do info.json
 */
export async function obterInfoCompleta() {
  if (cacheInfo) return cacheInfo;

  try {
    const resposta = await fetch('./dados/info.json');
    if (!resposta.ok) throw new Error(`Erro ao carregar info.json: status ${resposta.status}`);
    cacheInfo = await resposta.json();
    return cacheInfo;
  } catch (erro) {
    console.error('❌ [Repository] Falha crítica ao carregar info.json:', erro);
    return null;
  }
}

/**
 * Retorna os dados de um anime específico pelo ID
 */
export async function obterAnimePorId(animeId) {
  if (!animeId) return null;
  const info = await obterInfoCompleta();
  return info ? info[animeId] || null : null;
}

/**
 * Busca a lista de animes recomendados
 */
export async function obterRecomendados() {
  if (cacheRecomendados) return cacheRecomendados;

  try {
    const resposta = await fetch('./dados/destaque_principal_card.json');
    if (!resposta.ok) return [];
    cacheRecomendados = await resposta.json();
    return cacheRecomendados;
  } catch (erro) {
    console.error('❌ [Repository] Falha ao carregar destaque_principal_card.json:', erro);
    return [];
  }
}

/**
 * Busca a lista de animes adicionados recentemente
 */
export async function obterRecentes() {
  if (cacheRecentes) return cacheRecentes;

  try {
    const resposta = await fetch('./dados/add_recent.json');
    if (!resposta.ok) return [];
    cacheRecentes = await resposta.json();
    return cacheRecentes;
  } catch (erro) {
    console.error('❌ [Repository] Falha ao carregar add_recent.json:', erro);
    return [];
  }
}

/**
 * Busca a lista de novos episódios
 */
export async function obterNovosEpisodios() {
  if (cacheNovosEpisodios) return cacheNovosEpisodios;

  try {
    const resposta = await fetch('./dados/novos_episodios.json');
    if (!resposta.ok) return [];
    cacheNovosEpisodios = await resposta.json();
    return cacheNovosEpisodios;
  } catch (erro) {
    console.error('❌ [Repository] Falha ao carregar novos_episodios.json:', erro);
    return [];
  }
}

/**
 * Limpa o cache caso precise forçar a atualização dos dados sem recarregar a página
 */
export function limparCacheRepository() {
  cacheInfo = null;
  cacheRecomendados = null;
  cacheRecentes = null;
  cacheNovosEpisodios = null;
}
