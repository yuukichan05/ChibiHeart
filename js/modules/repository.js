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
 * Busca a lista de animes recomendados (Destaques) diretamente do info.json
 */
export async function obterRecomendados() {
  if (cacheRecomendados) return cacheRecomendados;

  try {
    const info = await obterInfoCompleta();
    if (!info) return [];

    // Filtra animes que possuem a propriedade destaque definida como true
    cacheRecomendados = Object.entries(info)
      .filter(([_, anime]) => anime.destaque === true)
      .map(([id]) => ({ id }));

    return cacheRecomendados;
  } catch (erro) {
    console.error('❌ [Repository] Falha ao processar animes recomendados:', erro);
    return [];
  }
}

/**
 * Busca os 15 animes adicionados mais recentemente diretamente do info.json,
 * ordenando do mais recente para o mais antigo pela data em "adicionado_em".
 */
export async function obterRecentes() {
  if (cacheRecentes) return cacheRecentes;

  try {
    const info = await obterInfoCompleta();
    if (!info) return [];

    // Filtra animes com 'adicionado_em', ordena do mais recente para o mais antigo e pega apenas os 15 primeiros
    cacheRecentes = Object.entries(info)
      .filter(([_, anime]) => anime.adicionado_em)
      .sort((a, b) => new Date(b[1].adicionado_em) - new Date(a[1].adicionado_em))
      .slice(0, 15)
      .map(([id]) => ({ id }));

    return cacheRecentes;
  } catch (erro) {
    console.error('❌ [Repository] Falha ao processar animes recentes:', erro);
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
