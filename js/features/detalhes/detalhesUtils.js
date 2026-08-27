// js/modules/features/detalhes/detalhesUtils.js

/**
 * Verifica se um episódio ou filme possui algum link de vídeo válido.
 */
export function temVideoDisponivel(ep) {
    if (!ep) return false;
    return Boolean(ep.video || ep.url_dub || ep.url_leg || ep.video_dub || ep.video_leg);
}

/**
 * Gera um ID padronizado para o episódio.
 */
export function makeEpisodeId(animeId, seasonIdx, episodeIdx) {
    const s = String(seasonIdx).padStart(2, '0');
    const e = String(episodeIdx).padStart(2, '0');
    return `${animeId}_s${s}e${e}`;
}

/**
 * Remove numerações do início do título do episódio.
 */
export function stripLeadingNumber(title) {
    if (!title || typeof title !== 'string') return title || '';
    return title.replace(/^\s*\d{1,3}(?:[.\)\-:]\s*|\s+-\s*|\.\s*)*/, '').trim();
}

/**
 * Formata a estação do ano e ano para exibição (ex: spring + 2025 -> Primavera 2025).
 */
export function formatarEstacao(estacao, ano) {
    if (!estacao) return '';
    const mapaEstacoes = {
        spring: 'Primavera',
        summer: 'Verão',
        fall: 'Outono',
        winter: 'Inverno'
    };
    const nomeEstacao = mapaEstacoes[String(estacao).toLowerCase()] || estacao;
    return ano ? `${nomeEstacao} ${ano}` : nomeEstacao;
}

/**
 * Normaliza o texto de exibição do tipo do título.
 */
export function formatarTipo(tipo) {
    if (!tipo) return '';
    const tipoLower = String(tipo).toLowerCase();
    const mapaTipos = {
        serie: 'Série',
        filme: 'Filme',
        ova: 'OVA',
        especial: 'Especial'
    };
    return mapaTipos[tipoLower] || tipo;
}

/**
 * Formata a data ISO (ex: "2026-08-26T18:13:00Z") para exibição (ex: "26 de ago.").
 */
export function formatarDataEpisodio(dataIso) {
    if (!dataIso) return '';
    const data = new Date(dataIso);
    if (isNaN(data.getTime())) return '';
    return data.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
}

/**
 * Verifica se o episódio foi lançado nos últimos X dias.
 */
export function ehLancamentoRecente(dataIso, dias = 7) {
    if (!dataIso) return false;
    const dataEp = new Date(dataIso);
    const hoje = new Date();
    const diffDias = (hoje - dataEp) / (1000 * 60 * 60 * 24);
    return diffDias >= 0 && diffDias <= dias;
}

/**
 * Verifica se o episódio é uma estreia futura (ainda não lançado).
 */
export function ehEpisodioFuturo(dataIso) {
    if (!dataIso) return false;
    return new Date(dataIso) > new Date();
}
