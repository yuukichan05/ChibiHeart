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
let idiomaAtual = 'dub';
let urlDubAtual = '';
let urlLegAtual = '';

// Desaloca buffers e limpa o player
export function limparPlayer() {
  limparTimersSync();

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
  idiomaAtual = 'dub';
}

// Chamado ao trocar de rota para verificar se algo foi assistido e sincronizar
export async function verificarESincronizarAoSairDoPlayer() {
  limparTimersSync();

  if (getAssistiuAlgo()) {
    console.log("🚪 [Player Exit] Algo foi assistido. Sincronizando dados com a nuvem...");
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

export function inicializarPlayer({ episodioAtual, animeId, epId, todosEpisodios }) {
  todosEpisodiosAtuais = todosEpisodios;
  epIdAtual = epId;
  animeIdAtual = animeId;
  ultimoTempoSalvoDB = 0;
  setAssistiuAlgo(false);

  // Seleção e verificação de URLs de mídia
  urlDubAtual = episodioAtual.url_dub || episodioAtual.video_dub || "";
  urlLegAtual = episodioAtual.url_leg || episodioAtual.video_leg || "";
  const urlVideoUnico = episodioAtual.video || "";

  const keys = Object.keys(episodioAtual);
  const idxDub = keys.findIndex(k => k === "url_dub" || k === "video_dub");
  const idxLeg = keys.findIndex(k => k === "url_leg" || k === "video_leg");

  const temAmbos = Boolean(urlDubAtual && urlLegAtual);

  if (temAmbos) {
    if (idxLeg !== -1 && idxDub !== -1 && idxLeg < idxDub) {
      idiomaAtual = 'leg';
    } else {
      idiomaAtual = 'dub';
    }
  } else if (urlDubAtual) {
    idiomaAtual = 'dub';
  } else if (urlLegAtual) {
    idiomaAtual = 'leg';
  } else {
    idiomaAtual = 'unico';
  }

  let videoInicial = "";
  if (idiomaAtual === 'dub') videoInicial = urlDubAtual;
  else if (idiomaAtual === 'leg') videoInicial = urlLegAtual;
  else videoInicial = urlVideoUnico || urlDubAtual || urlLegAtual;

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

  atualizarBotaoAudio(btnAudio, idiomaAtual, temAmbos);

  if (!videoElement) return;

  videoElement.src = videoInicial;
  videoElement.poster = episodioAtual.thumb || "";

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

    // Controla se o mouse está sobre o contêiner do vídeo
    let isHoveringContainer = false;

    function mostrarControles() {
      if (controlsOverlay) controlsOverlay.classList.remove("controls-hidden");
      if (containerPlayer) containerPlayer.classList.remove("hide-cursor");
    }

    function ocultarControles() {
      if (controlsOverlay && !videoElement.paused) {
        controlsOverlay.classList.add("controls-hidden");
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

    const alternarAudioHandler = () => {
      if (!urlDubAtual || !urlLegAtual) {
        let nomeAudioFaltante = "alternativo";
        
        if (idiomaAtual === 'dub') {
          nomeAudioFaltante = 'legendado';
        } else if (idiomaAtual === 'leg') {
          nomeAudioFaltante = 'dublado';
        }

        exibirToast(`Áudio ${nomeAudioFaltante} indisponível para este episódio.`);
        return;
      }

      const tempoAtual = videoElement.currentTime;
      const estavaPausado = videoElement.paused;

      idiomaAtual = (idiomaAtual === 'dub') ? 'leg' : 'dub';
      const novaUrl = (idiomaAtual === 'dub') ? urlDubAtual : urlLegAtual;

      videoElement.src = novaUrl;

      const sincronizarAposTroca = () => {
        videoElement.currentTime = tempoAtual;
        if (!estavaPausado) {
          videoElement.play().catch(e => console.log("Erro ao retomar áudio:", e));
        }
      };

      videoElement.addEventListener('loadedmetadata', sincronizarAposTroca, { once: true });
      atualizarBotaoAudio(document.getElementById("btn-player-audio"), idiomaAtual, true);
    };

    if (btnAudio) {
      btnAudio.addEventListener("click", (e) => {
        e.stopPropagation();
        alternarAudioHandler();
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

    videoElement.addEventListener("timeupdate", () => {
      const tempoAtual = videoElement.currentTime;
      const duracaoTotal = videoElement.duration || 0;

      if (tempoAtual > 2) {
        setAssistiuAlgo(true);
      }

      if (progressBar && duracaoTotal > 0) {
        const porcentagem = (tempoAtual / duracaoTotal) * 100;
        progressBar.value = porcentagem;
        progressBar.style.background = `linear-gradient(to right, #ff4081 ${porcentagem}%, rgba(255,255,255,0.3) ${porcentagem}%)`;
      }

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

    const avancarProximoEpisodio = () => {
      const indexAtualIndex = todosEpisodiosAtuais.findIndex(e => e.id === epIdAtual);
      if (indexAtualIndex !== -1 && indexAtualIndex + 1 < todosEpisodiosAtuais.length) {
        const proximoEp = todosEpisodiosAtuais[indexAtualIndex + 1];
        const novaUrl = `${window.location.pathname}#player?anime=${animeIdAtual}&ep=${proximoEp.id}`;
        window.location.replace(novaUrl);
      }
    };

    videoElement.addEventListener("ended", async () => {
      limparTimersSync();
      const duracaoTotal = Math.floor(videoElement.duration || 0);
      if (duracaoTotal > 0 && epIdAtual) {
        await salvarProgressoDB(epIdAtual, duracaoTotal, duracaoTotal);
        await sincronizarUploadGithub();
      }
      avancarProximoEpisodio();
    });

    const toggleFullscreen = () => {
      if (!containerPlayer) return;
      const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement;

      if (!isFullscreen) {
        if (containerPlayer.requestFullscreen) {
          containerPlayer.requestFullscreen().catch(err => console.error(err));
        } else if (containerPlayer.webkitRequestFullscreen) {
          containerPlayer.webkitRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(err => console.error(err));
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        }
      }
    };

    if (btnFullscreen) btnFullscreen.addEventListener("click", toggleFullscreen);

    const atualizarIconeFullscreen = () => {
      if (!btnFullscreen) return;
      const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement;

      if (isFullscreen) {
        btnFullscreen.innerHTML = `<span class="material-symbols-outlined">fullscreen_exit</span>`;
        btnFullscreen.setAttribute("aria-label", "Sair da Tela Cheia");
        if (screen.orientation && screen.orientation.lock) {
          screen.orientation.lock('landscape').catch(() => {});
        }
      } else {
        btnFullscreen.innerHTML = `<span class="material-symbols-outlined">fullscreen</span>`;
        btnFullscreen.setAttribute("aria-label", "Tela Cheia");
        if (screen.orientation && screen.orientation.unlock) {
          screen.orientation.unlock();
        }
      }
    };

    document.addEventListener("fullscreenchange", atualizarIconeFullscreen);
    document.addEventListener("webkitfullscreenchange", atualizarIconeFullscreen);

    // Atalhos globais de teclado
    window.addEventListener("keydown", (e) => {
      if (!window.location.hash.startsWith("#player")) return;

      const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : "";
      if (activeTag === "input" || activeTag === "textarea" || document.activeElement.isContentEditable) {
        return;
      }

      const duracaoTotal = videoElement.duration || 0;
      let teclaTratada = true;

      switch (e.key.toLowerCase()) {
        case " ":
        case "k":
          togglePlay();
          break;
        case "j":
          videoElement.currentTime = Math.max(0, videoElement.currentTime - 10);
          break;
        case "l":
          videoElement.currentTime = Math.min(duracaoTotal, videoElement.currentTime + 10);
          break;
        case "arrowleft":
          videoElement.currentTime = Math.max(0, videoElement.currentTime - 5);
          break;
        case "arrowright":
          videoElement.currentTime = Math.min(duracaoTotal, videoElement.currentTime + 5);
          break;
        case "arrowup":
          videoElement.volume = Math.min(1, videoElement.volume + 0.1);
          videoElement.muted = false;
          break;
        case "arrowdown":
          videoElement.volume = Math.max(0, videoElement.volume - 0.1);
          break;
        case "f":
          toggleFullscreen();
          break;
        case "m":
          videoElement.muted = !videoElement.muted;
          break;
        case "n":
          avancarProximoEpisodio();
          break;
        default:
          if (e.key >= "0" && e.key <= "9" && duracaoTotal > 0) {
            const pct = parseInt(e.key, 10) / 10;
            videoElement.currentTime = duracaoTotal * pct;
          } else {
            teclaTratada = false;
          }
          break;
      }

      if (teclaTratada) {
        e.preventDefault();
        resetAutoOcultarControles();
      }
    });

    if (containerPlayer) {
      containerPlayer.addEventListener("mousemove", resetAutoOcultarControles);
      containerPlayer.addEventListener("touchstart", resetAutoOcultarControles, { passive: true });

      containerPlayer.addEventListener("mouseenter", () => {
        isHoveringContainer = true;
      });

      containerPlayer.addEventListener("mouseleave", () => {
        isHoveringContainer = false;
        containerPlayer.classList.remove("hide-cursor");
      });
    }
  }

  setTimeout(() => {
    videoElement.play().catch(e => console.log("Autoplay bloqueado pelo navegador:", e));
  }, 200);
}
