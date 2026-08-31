// js/data/database/repository.js

import { animesData } from '../../../dados/index.js';

let cacheInfo = null;
let cacheRecomendados = null;
let cacheRecentes = null;

/**
 * Função auxiliar interna para embaralhar arrays (Fisher-Yates)
 */
function embaralharArray(array) {
  let copia = [...array];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

/**
 * Retorna os dados completos do objeto de animes
 */
export async function obterInfoCompleta() {
  if (cacheInfo) return cacheInfo;

  try {
    cacheInfo = animesData;
    return cacheInfo;
  } catch (erro) {
    console.error('❌ [Repository] Falha crítica ao carregar info:', erro);
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
 * Busca a lista de animes recomendados (Destaques).
 * Pega TODOS os animes com destaque === true, embaralha a lista completa
 * e seleciona 15 aleatórios a cada carregamento.
 */
export async function obterRecomendados() {
  // Nota: Não utilizamos cacheRecomendados aqui para permitir
  // que a cada navegação/recarregamento os 15 exibidos sejam dinâmicos.

  try {
    const info = await obterInfoCompleta();
    if (!info) return [];

    // 1. Filtra TODOS os animes que possuem destaque === true
    const todosDestaques = Object.entries(info)
      .filter(([_, anime]) => anime.destaque === true);

    // 2. Embaralha a lista completa de destaques
    const destaquesEmbaralhados = embaralharArray(todosDestaques);

    // 3. Pega os 15 primeiros da lista embaralhada
    return destaquesEmbaralhados
      .slice(0, 15)
      .map(([id]) => ({ id }));

  } catch (erro) {
    console.error('❌ [Repository] Falha ao processar animes recomendados:', erro);
    return [];
  }
}

/**
 * Busca os 15 animes adicionados mais recentemente,
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
 * Limpa o cache caso precise forçar a atualização dos dados sem recarregar a página
 */
export function limparCacheRepository() {
  cacheInfo = null;
  cacheRecomendados = null;
  cacheRecentes = null;
}
