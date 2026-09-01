// js/data/database/repository.js

import { animesData } from '../../../dados/index.js';

// 1. Configuração do Tempo de Vida do Cache (ex: 5 minutos em milissegundos)
const CACHE_TTL = 5 * 60 * 1000; 

// Estruturas para armazenar os dados e o timestamp do momento da gravação
let cacheInfo = { dados: null, timestamp: 0 };
let cacheRecomendados = { dados: null, timestamp: 0 };
let cacheRecentes = { dados: null, timestamp: 0 };

/**
 * Helper para verificar se os dados em cache ainda estão dentro do tempo limite
 */
function cacheValido(cache) {
  return cache.dados !== null && (Date.now() - cache.timestamp < CACHE_TTL);
}

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
 * Sanitiza o título do episódio para remover numerações duplicadas do tipo "01. 01. Título" -> "01. Título".
 * Mantém inalterado se for apenas "01. Título", "01 Título" ou se for filme (sem números).
 */
function sanitizarTituloEpisodio(titulo) {
  if (!titulo || typeof titulo !== 'string') return titulo;
  
  // Regex busca padrões como "01. 01. " ou "01.01. " no início da string e remove a primeira ocorrência
  return titulo.replace(/^(\d{2}\.\s*)(\d{2}\.\s*)/, '$2');
}

/**
 * Avalia a data de lançamento do anime. Se o status for "Anunciado" 
 * e a data de lançamento/estreia já tiver chegado, converte o status para "Em exibição".
 * Também garante que episódios sem thumb recebam o banner da obra como fallback
 * e sanitiza títulos de episódios duplicados.
 */
function normalizarAnime(anime) {
  if (!anime) return anime;

  let animeAtualizado = { ...anime };

  // 1. Normalização do Status
  const dataReferencia = animeAtualizado.data_lancamento || animeAtualizado.data_estreia;

  if (animeAtualizado.status === "Anunciado" && dataReferencia) {
    const dataLancamento = new Date(dataReferencia);
    const agora = new Date();

    if (!isNaN(dataLancamento.getTime()) && dataLancamento <= agora) {
      animeAtualizado.status = "Em exibição";
    }
  }

  // 2. Fallback de Thumb e Sanitização dos Títulos dos Episódios
  if (Array.isArray(animeAtualizado.temporadas)) {
    const fallbackImage = animeAtualizado.banner || animeAtualizado.poster || '';

    animeAtualizado.temporadas = animeAtualizado.temporadas.map(temporada => {
      if (!Array.isArray(temporada.episodios)) return temporada;

      const episodiosTratados = temporada.episodios.map(episodio => {
        const thumbVazio = !episodio.thumb || episodio.thumb.trim() === '';
        
        return {
          ...episodio,
          titulo: sanitizarTituloEpisodio(episodio.titulo),
          thumb: thumbVazio ? fallbackImage : episodio.thumb
        };
      });

      return {
        ...temporada,
        episodios: episodiosTratados
      };
    });
  }

  return animeAtualizado;
}

/**
 * Retorna os dados completos do objeto de animes com os status, thumbs e títulos atualizados.
 */
export async function obterInfoCompleta() {
  if (cacheValido(cacheInfo)) return cacheInfo.dados;

  try {
    const dadosTratados = {};

    for (const [id, anime] of Object.entries(animesData)) {
      dadosTratados[id] = normalizarAnime(anime);
    }

    cacheInfo = {
      dados: dadosTratados,
      timestamp: Date.now()
    };

    return cacheInfo.dados;
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
  try {
    const info = await obterInfoCompleta();
    if (!info) return [];

    const todosDestaques = Object.entries(info)
      .filter(([_, anime]) => anime.destaque === true);

    const destaquesEmbaralhados = embaralharArray(todosDestaques);

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
  if (cacheValido(cacheRecentes)) return cacheRecentes.dados;

  try {
    const info = await obterInfoCompleta();
    if (!info) return [];

    const dados = Object.entries(info)
      .filter(([_, anime]) => anime.adicionado_em)
      .sort((a, b) => new Date(b[1].adicionado_em) - new Date(a[1].adicionado_em))
      .slice(0, 15)
      .map(([id]) => ({ id }));

    cacheRecentes = {
      dados: dados,
      timestamp: Date.now()
    };

    return cacheRecentes.dados;
  } catch (erro) {
    console.error('❌ [Repository] Falha ao processar animes recentes:', erro);
    return [];
  }
}

/**
 * Limpa o cache caso precise forçar a atualização dos dados sem recarregar a página
 */
export function limparCacheRepository() {
  cacheInfo = { dados: null, timestamp: 0 };
  cacheRecomendados = { dados: null, timestamp: 0 };
  cacheRecentes = { dados: null, timestamp: 0 };
}
