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
