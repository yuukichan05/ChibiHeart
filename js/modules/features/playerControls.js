import { 
  salvarProgressoDB, 
  buscarProgressoDB, 
  sincronizarUploadGithub 
} from "../../data/database/db.js";
import { formatarTempo, exibirToast, atualizarBotaoAudio } from "./playerUiUtils.js";
import { 
  limparTimersSync, 
  iniciarTimerCincoMinutos, 
  agendarSyncPausaCincoSegundos, 
  getAssistiuAlgo,
  setAssistiuAlgo 
} from "./playerSync.js";

let todosEpisodiosAtuais = [];
let epIdAtual = null;
let animeIdAtual = null;
let hideControlsTimeout = null;
let listenersAtivos = false;

let ultimoTempoSalvoDB = 0;
let idiomaAtual = 'leg';
let urlDubAtual = '';
let urlLegAtual = '';

// Gerenciamento de Legendas e JASSUB
let jassubInstance = null;
let faixasLegendaDisponiveis = [];
let faixaLegendaAtivaIndex = -1;

/**
 * Extrai faixas de legenda do MKV usando mkv-demuxer
 * @param {string} urlVideo - URL do arquivo MKV
 * @returns {Promise<Array>} Array de faixas com { id, title, lang, data }
 */
async function extrairLegendasMKV(urlVideo) {
  if (!urlVideo) {
    console.warn("URL do vídeo não fornecida");
    return [];
  }

  try {
    console.log("🔄 Lendo legendas do MKV...", urlVideo);
    exibirToast("Lendo legendas do arquivo...");

    // Faz download apenas do header do MKV (onde ficam os metadados)
    const response = await fetch(urlVideo, {
      headers: { Range: "bytes=0-10485760" } // 10MB
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();

    // Verificar se mkv-demuxer está disponível
    if (typeof window.MKVDemuxer === "undefined") {
      console.warn("⚠️ MKV Demuxer não carregado. Tentando fallback manual...");
      return extrairLegendasFallback(arrayBuffer);
    }

    // Usar mkv-demuxer para extrair informações
    const demuxer = new window.MKVDemuxer.Demuxer(new Uint8Array(arrayBuffer));
    const tracks = [];

    console.log(`📋 Total de faixas no arquivo: ${demuxer.tracks.length}`);

    // Iterar sobre as faixas disponíveis
    for (let i = 0; i < demuxer.tracks.length; i++) {
      const track = demuxer.tracks[i];

      console.log(`Faixa ${i}: tipo=${track.type}, codec=${track.codec}, name=${track.name}`);

      // Verificar se é uma faixa de subtítulos
      if (track.type === "subtitles") {
        tracks.push({
          id: i,
          title: track.name || `Legenda ${i + 1}`,
          lang: track.language || "Unknown",
          type: track.codec, // "S_TEXT/ASS", "S_TEXT/UTF8", etc.
          trackId: track.number
        });

        console.log(`✅ Legenda encontrada: ${track.name || `Legenda ${i + 1}`}`);
      }
    }

    if (tracks.length === 0) {
      console.log("⚠️ Nenhuma faixa de subtítulo encontrada no demuxer");
    }

    return tracks;

  } catch (erro) {
    console.error("❌ Erro ao extrair legendas:", erro);
    return [];
  }
}

/**
 * Fallback para extrair legendas manualmente (se mkv-demuxer falhar)
 * Procura por padrões binários conhecidos do MKV
 */
function extrairLegendasFallback(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const decoder = new TextDecoder("utf-8", { fatal: false });
  
  const tracks = [];
  let trackIndex = 0;

  console.log("🔍 Usando fallback de extração manual de legendas...");

  // Procurar por marcadores conhecidos de faixas de subtítulo no MKV
  for (let i = 0; i < bytes.length - 20; i++) {
    const slice = bytes.slice(i, i + 50);
    const text = decoder.decode(slice);

    // Procurar por CodecID de subtítulo
    if (text.includes("S_TEXT/ASS") || text.includes("S_TEXT/UTF8")) {
      console.log(`📍 Encontrado codec de legenda em offset ${i}`);

      tracks.push({
        id: trackIndex,
        title: `Legenda ${trackIndex + 1}`,
        lang: "Português",
        type: text.includes("S_TEXT/ASS") ? "S_TEXT/ASS" : "S_TEXT/UTF8",
        trackId: trackIndex
      });
      
      trackIndex++;
      i += 100; // Pular para evitar duplicatas
    }
  }

  if (tracks.length === 0) {
    console.log("❌ Nenhuma legenda encontrada no fallback");
  }

  return tracks;
}

/**
 * Carrega o conteúdo ASS de uma faixa específica
 * @param {number} trackIndex - Índice da faixa
 * @param {string} urlVideo - URL do MKV
 */
async function carregarConteudoLegenda(trackIndex, urlVideo) {
  try {
    console.log(`📥 Carregando conteúdo da legenda ${trackIndex}...`);

    const response = await fetch(urlVideo, {
      headers: { Range: "bytes=0-52428800" } // 50MB para garantir todo conteúdo
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();

    if (typeof window.MKVDemuxer === "undefined") {
      console.warn("MKV Demuxer não disponível para carregar conteúdo");
      return null;
    }

    const demuxer = new window.MKVDemuxer.Demuxer(new Uint8Array(arrayBuffer));
    
    if (!demuxer.tracks[trackIndex]) {
      console.warn(`Faixa ${trackIndex} não encontrada`);
      return null;
    }

    const track = demuxer.tracks[trackIndex];

    if (track.type !== "subtitles") {
      console.warn(`Faixa ${trackIndex} não é uma faixa de legendas`);
      return null;
    }

    // Tentar extrair dados da faixa
    if (track.data) {
      const decoder = new TextDecoder("utf-8", { fatal: false });
      const conteudo = decoder.decode(track.data);
      console.log("✅ Conteúdo da legenda carregado com sucesso");
      return conteudo;
    }

    console.warn("Faixa não possui dados extraíveis");
    return null;
  } catch (erro) {
    console.error("❌ Erro ao carregar legenda:", erro);
    return null;
  }
}

/**
 * Cria um arquivo ASS válido a partir do conteúdo extraído
 */
function criarArquivoASS(conteudoLegenda, titulo = "Legenda") {
  // Se já é um ASS válido, retornar como está
  if (conteudoLegenda && conteudoLegenda.includes("[Script Info]")) {
    return conteudoLegenda;
  }

  // Caso contrário, criar um ASS mínimo válido
  const assTemplate = `[Script Info]
Title: ${titulo}
ScriptType: v4.00+
PlayDepth: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${conteudoLegenda || "Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,"}`;

  return assTemplate;
}

/**
 * Altera ou desativa a legenda ativa no JASSUB
 */
async function ativarFaixaLegenda(indexTrack, videoElement, urlVideo) {
  // Destruir instância anterior
  if (jassubInstance) {
    try {
      jassubInstance.destroy();
    } catch (e) {}
    jassubInstance = null;
  }

  faixaLegendaAtivaIndex = indexTrack;
  atualizarUIListaLegendas();

  if (indexTrack === -1 || !faixasLegendaDisponiveis[indexTrack]) {
    exibirToast("Legendas desativadas.");
    return;
  }

  if (typeof JASSUB === "undefined") {
    console.warn("⚠️ JASSUB não carregado no HTML global.");
    exibirToast("Erro: JASSUB não disponível");
    return;
  }

  const faixaSelecionada = faixasLegendaDisponiveis[indexTrack];

  try {
    // Carregar conteúdo da legenda
    let conteudoLegenda = await carregarConteudoLegenda(indexTrack, urlVideo);

    // Se não conseguir carregar, usar um template vazio
    if (!conteudoLegenda) {
      console.warn("Usando template ASS padrão para faixa", indexTrack);
      conteudoLegenda = criarArquivoASS("", faixaSelecionada.title);
    } else {
      conteudoLegenda = criarArquivoASS(conteudoLegenda, faixaSelecionada.title);
    }

    // Inicializar JASSUB
    jassubInstance = new JASSUB({
      video: videoElement,
      subContent: conteudoLegenda,
      fonts: [],
      workerUrl: "https://cdn.jsdelivr.net/npm/jassub@latest/dist/jassub-worker.js",
      legacyWasmUrl: "https://cdn.jsdelivr.net/npm/jassub@latest/dist/jassub-worker.wasm",
      onError: (error) => {
        console.error("❌ Erro JASSUB:", error);
        exibirToast("Erro ao renderizar legenda");
      }
    });

    exibirToast(`✅ Legenda: ${faixaSelecionada.title}`);
    console.log("✅ Legenda ativada:", faixaSelecionada.title);

  } catch (erro) {
    console.error("❌ Erro ao ativar legenda:", erro);
    exibirToast("Erro ao ativar legenda");
  }
}

/**
 * Atualiza o DOM do menu de legendas
 */
function atualizarUIListaLegendas() {
  const listaContainer = document.getElementById("subtitles-list");
  if (!listaContainer) return;

  listaContainer.innerHTML = "";

  // Opção: Desativar legendas
  const liDesativado = document.createElement("li");
  liDesativado.className = `subtitles-item ${faixaLegendaAtivaIndex === -1 ? "active" : ""}`;
  liDesativado.dataset.track = "-1";
  liDesativado.textContent = "Desativado";
  listaContainer.appendChild(liDesativado);

  // Opções de legendas disponíveis
  if (faixasLegendaDisponiveis.length === 0) {
    const liSemLegenda = document.createElement("li");
    liSemLegenda.className = "subtitles-item disabled";
    liSemLegenda.textContent = "Nenhuma legenda disponível";
    liSemLegenda.style.opacity = "0.5";
    liSemLegenda.style.pointerEvents = "none";
    listaContainer.appendChild(liSemLegenda);
  } else {
    faixasLegendaDisponiveis.forEach((track, idx) => {
      const li = document.createElement("li");
      li.className = `subtitles-item ${faixaLegendaAtivaIndex === idx ? "active" : ""}`;
      li.dataset.track = String(idx);
      li.textContent = `${track.title} (${track.lang || "Unknown"})`;
      listaContainer.appendChild(li);
    });
  }
}

/**
 * Inicializa o menu de legendas quando o vídeo está pronto
 */
export async function inicializarMenuLegendas(urlVideo, videoElement) {
  if (!urlVideo) {
    console.warn("❌ URL do vídeo não fornecida");
    atualizarUIListaLegendas(); // Mostrar "Nenhuma legenda disponível"
    return;
  }

  console.log("📹 Inicializando legendas para:", urlVideo);

  // IMPORTANTE: Aguardar o vídeo carregar antes de ler as legendas
  // Isso evita que a mensagem "nenhuma legenda disponível" apareça antes de terminar
  return new Promise((resolve) => {
    const videoReady = () => {
      console.log("✅ Vídeo pronto para ler legendas");
      extrairLegendasMKV(urlVideo).then((legendas) => {
        faixasLegendaDisponiveis = legendas;

        // Atualizar UI
        atualizarUIListaLegendas();

        // Se houver legendas, ativar a primeira por padrão
        if (faixasLegendaDisponiveis.length > 0) {
          console.log(`🎬 Ativando primeira legenda de ${faixasLegendaDisponiveis.length} disponíveis`);
          ativarFaixaLegenda(0, videoElement, urlVideo).then(() => resolve());
        } else {
          console.log("ℹ️ Nenhuma legenda encontrada no arquivo");
          exibirToast("Nenhuma legenda disponível neste episódio");
          resolve();
        }
      }).catch((erro) => {
        console.error("❌ Erro ao extrair legendas:", erro);
        atualizarUIListaLegendas();
        resolve();
      });
    };

    // Verificar diferentes eventos para ter certeza que o vídeo está pronto
    if (videoElement.readyState >= 1) {
      // Vídeo já tem metadados carregados
      videoReady();
    } else {
      // Aguardar carregamento dos metadados
      videoElement.addEventListener('loadedmetadata', videoReady, { once: true });
      
      // Timeout de segurança (5 segundos)
      setTimeout(() => {
        if (videoElement.readyState >= 1) {
          videoReady();
        } else {
          console.warn("⚠️ Timeout aguardando metadados do vídeo");
          atualizarUIListaLegendas();
          resolve();
        }
      }, 5000);
    }
  });
}

export function limparPlayer() {
  limparTimersSync();

  if (jassubInstance) {
    try {
      jassubInstance.destroy();
    } catch (e) {}
    jassubInstance = null;
  }

  faixasLegendaDisponiveis = [];
  faixaLegendaAtivaIndex = -1;

  const videoElement = document.getElementById("player-video");
  if (videoElement) {
    videoElement.pause();
    videoElement.removeAttribute("src");
    videoElement.load();
  }
  if (hideControlsTimeout) {
    clearTimeout(hideControlsTimeout);
    hideControlsTimeout = null;
  }

  epIdAtual = null;
  animeIdAtual = null;
  ultimoTempoSalvoDB = 0;
  urlDubAtual = '';
  urlLegAtual = '';
  idiomaAtual = 'leg';
}

export async function verificarESincronizarAoSairDoPlayer() {
  limparTimersSync();

  if (getAssistiuAlgo()) {
    setAssistiuAlgo(false);

    const videoElement = document.getElementById("player-video");
    if (videoElement && epIdAtual) {
      const tempoAtual = Math.floor(videoElement.currentTime);
      const duracaoTotal = Math.floor(videoElement.duration || 0);
      if (tempoAtual > 0) {
        await salvarProgressoDB(epIdAtual, tempoAtual, duracaoTotal);
      }
    }

    limparPlayer();
    await sincronizarUploadGithub();
  } else {
    limparPlayer();
  }
}

function atualizarBarraProgressoEBuffer() {
  const progressBar = document.getElementById("player-progress");
  const videoElement = document.getElementById("player-video");

  if (!progressBar || !videoElement || !videoElement.duration) return;

  const tempoAtual = videoElement.currentTime;
  const duracaoTotal = videoElement.duration;

  const pctProgresso = (tempoAtual / duracaoTotal) * 100;
  progressBar.value = pctProgresso;

  let pctBuffer = 0;
  if (videoElement.buffered.length > 0) {
    for (let i = 0; i < videoElement.buffered.length; i++) {
      if (videoElement.buffered.start(i) <= tempoAtual && tempoAtual <= videoElement.buffered.end(i)) {
        pctBuffer = (videoElement.buffered.end(i) / duracaoTotal) * 100;
        break;
      }
    }
  }

  if (pctBuffer < pctProgresso) pctBuffer = pctProgresso;

  progressBar.style.background = `linear-gradient(to right, 
    #a855f7 0%, 
    #a855f7 ${pctProgresso}%, 
    rgba(255, 255, 255, 0.4) ${pctProgresso}%, 
    rgba(255, 255, 255, 0.4) ${pctBuffer}%, 
    rgba(255, 255, 255, 0.15) ${pctBuffer}%, 
    rgba(255, 255, 255, 0.15) 100%)`;
}

export function inicializarPlayer({ episodioAtual, animeId, epId, todosEpisodios }) {
  todosEpisodiosAtuais = todosEpisodios;
  epIdAtual = epId;
  animeIdAtual = animeId;
  ultimoTempoSalvoDB = 0;
  setAssistiuAlgo(false);

  // Mapeia dinamicamente do seu banco JS (url_leg ou url_dub)
  urlDubAtual = episodioAtual.url_dub || episodioAtual.video_dub || "";
  urlLegAtual = episodioAtual.url_leg || episodioAtual.video_leg || episodioAtual.video || "";

  const temAmbos = Boolean(urlDubAtual && urlLegAtual);
  idiomaAtual = urlLegAtual ? 'leg' : 'dub';

  const videoInicial = (idiomaAtual === 'leg') ? urlLegAtual : urlDubAtual;

  const videoElement = document.getElementById("player-video");
  const containerPlayer = document.getElementById("custom-player-container");
  const controlsOverlay = document.getElementById("custom-player-controls");

  const btnPlay = document.getElementById("btn-player-play");
  const btnRewind = document.getElementById("btn-player-rewind");
  const btnForward = document.getElementById("btn-player-forward");
  const progressBar = document.getElementById("player-progress");
  const timeDisplay = document.getElementById("player-time-display");
  const btnFullscreen = document.getElementById("btn-player-fullscreen");
  const btnAudio = document.getElementById("btn-player-audio");
  
  const btnSubtitles = document.getElementById("btn-player-subtitles");
  const menuSubtitles = document.getElementById("player-subtitles-menu");
  const listSubtitles = document.getElementById("subtitles-list");

  atualizarBotaoAudio(btnAudio, idiomaAtual, temAmbos);

  if (!videoElement) return;

  videoElement.src = videoInicial;
  videoElement.poster = episodioAtual.thumb || "";

  // Inicializar legendas APÓS o vídeo estar configurado e pronto
  inicializarMenuLegendas(videoInicial, videoElement);

  async function restaurarTempoSalvo() {
    const progressoSalvo = await buscarProgressoDB(epIdAtual);
    if (progressoSalvo && progressoSalvo.tempo > 0) {
      videoElement.currentTime = progressoSalvo.tempo;
      ultimoTempoSalvoDB = Math.floor(progressoSalvo.tempo);
    }
  }

  videoElement.addEventListener('loadedmetadata', restaurarTempoSalvo, { once: true });

  if (!listenersAtivos) {
    listenersAtivos = true;

    let isHoveringContainer = false;

    function mostrarControles() {
      if (controlsOverlay) controlsOverlay.classList.remove("controls-hidden");
      if (containerPlayer) containerPlayer.classList.remove("hide-cursor");
    }

    function ocultarControles() {
      if (controlsOverlay && !videoElement.paused) {
        controlsOverlay.classList.add("controls-hidden");
        if (menuSubtitles) menuSubtitles.classList.add("hidden");
        if (isHoveringContainer && containerPlayer) {
          containerPlayer.classList.add("hide-cursor");
        }
      }
    }

    function resetAutoOcultarControles() {
      mostrarControles();
      if (hideControlsTimeout) clearTimeout(hideControlsTimeout);
      if (!videoElement.paused) {
        hideControlsTimeout = setTimeout(ocultarControles, 3000);
      }
    }

    const togglePlay = () => {
      if (videoElement.paused) {
        videoElement.play().catch(e => console.log("Autoplay bloqueado:", e));
      } else {
        videoElement.pause();
      }
    };

    if (btnPlay) btnPlay.addEventListener("click", togglePlay);
    videoElement.addEventListener("click", togglePlay);

    // Menu de Legendas
    if (btnSubtitles && menuSubtitles) {
      btnSubtitles.addEventListener("click", (e) => {
        e.stopPropagation();
        menuSubtitles.classList.toggle("hidden");
        resetAutoOcultarControles();
      });
    }

    if (listSubtitles) {
      listSubtitles.addEventListener("click", async (e) => {
        const item = e.target.closest(".subtitles-item");
        if (!item) return;

        const trackIdx = parseInt(item.dataset.track, 10);
        await ativarFaixaLegenda(trackIdx, videoElement, videoInicial);
        if (menuSubtitles) menuSubtitles.classList.add("hidden");
      });
    }

    videoElement.addEventListener("play", () => {
      if (btnPlay) btnPlay.innerHTML = `<span class="material-symbols-outlined">pause</span>`;
      resetAutoOcultarControles();
      setAssistiuAlgo(true);
      iniciarTimerCincoMinutos(videoElement, epIdAtual);
    });

    videoElement.addEventListener("pause", () => {
      if (btnPlay) btnPlay.innerHTML = `<span class="material-symbols-outlined">play_arrow</span>`;
      mostrarControles();

      const tempoAtual = Math.floor(videoElement.currentTime);
      const duracaoTotal = Math.floor(videoElement.duration || 0);
      if (tempoAtual > 0 && epIdAtual) {
        salvarProgressoDB(epIdAtual, tempoAtual, duracaoTotal);
        ultimoTempoSalvoDB = tempoAtual;
      }

      limparTimersSync();
      agendarSyncPausaCincoSegundos(videoElement, epIdAtual);
    });

    if (btnRewind) {
      btnRewind.addEventListener("click", (e) => {
        e.stopPropagation();
        videoElement.currentTime = Math.max(0, videoElement.currentTime - 10);
        resetAutoOcultarControles();
      });
    }

    if (btnForward) {
      btnForward.addEventListener("click", (e) => {
        e.stopPropagation();
        videoElement.currentTime = Math.min(videoElement.duration || 0, videoElement.currentTime + 10);
        resetAutoOcultarControles();
      });
    }

    videoElement.addEventListener("progress", atualizarBarraProgressoEBuffer);

    videoElement.addEventListener("timeupdate", () => {
      const tempoAtual = videoElement.currentTime;
      const duracaoTotal = videoElement.duration || 0;

      if (tempoAtual > 2) setAssistiuAlgo(true);

      atualizarBarraProgressoEBuffer();

      if (timeDisplay) {
        timeDisplay.textContent = `${formatarTempo(tempoAtual)} • ${formatarTempo(duracaoTotal)}`;
      }

      const segAtual = Math.floor(tempoAtual);
      if (segAtual >= 15 && (segAtual - ultimoTempoSalvoDB >= 10)) {
        ultimoTempoSalvoDB = segAtual;
        salvarProgressoDB(epIdAtual, segAtual, Math.floor(duracaoTotal));
      }
    });

    if (progressBar) {
      progressBar.addEventListener("input", () => {
        const duracaoTotal = videoElement.duration || 0;
        if (duracaoTotal > 0) {
          videoElement.currentTime = (progressBar.value / 100) * duracaoTotal;
        }
      });
    }

    const toggleFullscreen = () => {
      if (!containerPlayer) return;
      const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement;

      if (!isFullscreen) {
        if (containerPlayer.requestFullscreen) containerPlayer.requestFullscreen();
      } else {
        if (document.exitFullscreen) document.exitFullscreen();
      }
    };

    if (btnFullscreen) btnFullscreen.addEventListener("click", toggleFullscreen);

    if (containerPlayer) {
      containerPlayer.addEventListener("mousemove", resetAutoOcultarControles);
      containerPlayer.addEventListener("touchstart", resetAutoOcultarControles, { passive: true });
    }
  }

  setTimeout(() => {
    videoElement.play().catch(e => console.log("Autoplay bloqueado:", e));
  }, 200);
}
