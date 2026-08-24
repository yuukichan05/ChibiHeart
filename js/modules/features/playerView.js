// js/modules/features/playerView.js

import { 
  salvarProgressoDB, 
  buscarProgressoDB, 
  buscarTodoProgressoDB, 
  sincronizarUploadGithub 
} from "../database/db.js";
import { obterAnimePorId } from "../database/repository.js";

let todosEpisodiosAtuais = [];
let epIdAtual = null;
let animeIdAtual = null;
let hideControlsTimeout = null;
let listenersAtivos = false;

// Controle de I/O e Sincronização em Tempo Real
let ultimoTempoSalvoDB = 0;
let timerCincoMinutos = null;
let timerPausaCincoSegundos = null;
let assistiuAlgo = false;

function makeEpisodeId(animeId, seasonIdx, episodeIdx) {
  const s = String(seasonIdx).padStart(2, '0');
  const e = String(episodeIdx).padStart(2, '0');
  return `${animeId}_s${s}e${e}`;
}

// Formata segundos em MM:SS ou HH:MM:SS
function formatarTempo(segundos) {
  if (isNaN(segundos) || segundos < 0) return "00:00";
  const horas = Math.floor(segundos / 3600);
  const minutos = Math.floor((segundos % 3600) / 60);
  const seg = Math.floor(segundos % 60);

  if (horas > 0) {
    return `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}:${String(seg).padStart(2, '0')}`;
  }
  return `${String(minutos).padStart(2, '0')}:${String(seg).padStart(2, '0')}`;
}

// Limpa os timers ativos de sincronização
function limparTimersSync() {
  if (timerCincoMinutos) {
    clearInterval(timerCincoMinutos);
    timerCincoMinutos = null;
  }
  if (timerPausaCincoSegundos) {
    clearTimeout(timerPausaCincoSegundos);
    timerPausaCincoSegundos = null;
  }
}

// Inicia o cronômetro de 5 minutos enquanto assiste
function iniciarTimerCincoMinutos(videoElement) {
  limparTimersSync();

  timerCincoMinutos = setInterval(async () => {
    if (!videoElement || videoElement.paused || !epIdAtual) return;

    const tempoAtual = Math.floor(videoElement.currentTime);
    const duracaoTotal = Math.floor(videoElement.duration || 0);

    if (tempoAtual > 0) {
      console.log("⏰ [Player 5min Sync] Sincronizando progresso com a nuvem...");
      await salvarProgressoDB(epIdAtual, tempoAtual, duracaoTotal);
      await sincronizarUploadGithub();
    }
  }, 5 * 60 * 1000); // 5 minutos
}

// Agenda sincronização para 5s após o vídeo ser pausado
function agendarSyncPausaCincoSegundos(videoElement) {
  if (timerPausaCincoSegundos) clearTimeout(timerPausaCincoSegundos);

  timerPausaCincoSegundos = setTimeout(async () => {
    if (!epIdAtual || !videoElement) return;

    const tempoAtual = Math.floor(videoElement.currentTime);
    const duracaoTotal = Math.floor(videoElement.duration || 0);

    if (tempoAtual > 0) {
      console.log("⏸️ [Player 5s Pause Sync] Enviando atualização de pausa para a nuvem...");
      await salvarProgressoDB(epIdAtual, tempoAtual, duracaoTotal);
      await sincronizarUploadGithub();
    }
  }, 5000); // 5 segundos
}

// OTIMIZAÇÃO SPA: Limpeza profunda para liberar GPU/RAM ao trocar de tela
export function limparPlayer() {
  limparTimersSync();

  const videoElement = document.getElementById("player-video");
  if (videoElement) {
    videoElement.pause();
    videoElement.removeAttribute("src");
    videoElement.load(); // Desaloca os buffers de vídeo da memória RAM/GPU
  }
  if (hideControlsTimeout) {
    clearTimeout(hideControlsTimeout);
    hideControlsTimeout = null;
  }

  epIdAtual = null;
  animeIdAtual = null;
  ultimoTempoSalvoDB = 0;
}

// Chamado pela main.js ao trocar de rota para verificar se algo foi assistido
export async function verificarESincronizarAoSairDoPlayer() {
  limparTimersSync();

  if (assistiuAlgo) {
    console.log("🚪 [Player Exit] Algo foi assistido. Sincronizando dados com a nuvem...");
    assistiuAlgo = false;

    const videoElement = document.getElementById("player-video");
    if (videoElement && epIdAtual) {
      const tempoAtual = Math.floor(videoElement.currentTime);
      const duracaoTotal = Math.floor(videoElement.duration || 0);
      if (tempoAtual > 0) {
        await salvarProgressoDB(epIdAtual, tempoAtual, duracaoTotal);
      }
    }

    // CORREÇÃO: Força o corte imediato do player antes de aguardar a API externa
    limparPlayer();

    await sincronizarUploadGithub();
  } else {
    // Garante que o player seja desligado se nada tiver sido assistido
    limparPlayer();
  }
}

export async function gerenciarTelaPlayer() {
  const hash = window.location.hash;

  if (!hash.startsWith("#player")) {
    limparPlayer();
    return;
  }

  const params = new URLSearchParams(hash.split("?")[1]);
  const animeId = params.get("anime");
  const epId = params.get("ep");

  if (!animeId || !epId) return;

  try {
    const anime = await obterAnimePorId(animeId);
    if (!anime) return;

    let episodioAtual = null;
    let todosEpisodios = [];
    let temporadaAtualNome = "";

    const temporadas = Array.isArray(anime.temporadas)
      ? anime.temporadas
      : Array.isArray(anime.episodios)
        ? [{ nome: "Temporada Única", episodios: anime.episodios }]
        : [];

    let temporadaEncontrada = null;

    for (let tIdx = 0; tIdx < temporadas.length; tIdx++) {
      const temp = temporadas[tIdx];
      const eps = Array.isArray(temp.episodios) ? temp.episodios : [];

      const epAchado = eps.find((ep, eIdx) => {
        const indexEp = typeof ep.index === 'number' ? ep.index : eIdx + 1;
        const idEp = ep.id || makeEpisodeId(animeId, tIdx + 1, indexEp);
        return idEp === epId;
      });

      if (epAchado) {
        temporadaEncontrada = { temp, tIdx };
        break;
      }
    }

    if (temporadaEncontrada) {
      const { temp, tIdx } = temporadaEncontrada;
      temporadaAtualNome = temp.nome || "Temporada Única";
      const eps = Array.isArray(temp.episodios) ? temp.episodios : [];

      eps.forEach((ep, eIdx) => {
        const indexEp = typeof ep.index === 'number' ? ep.index : eIdx + 1;
        const idEp = ep.id || makeEpisodeId(animeId, tIdx + 1, indexEp);

        const epFormatado = { ...ep, index: indexEp, id: idEp, temporadaNome: temporadaAtualNome };
        todosEpisodios.push(epFormatado);

        if (idEp === epId) {
          episodioAtual = epFormatado;
        }
      });
    }

    if (!episodioAtual) return;

    todosEpisodiosAtuais = todosEpisodios;
    epIdAtual = epId;
    animeIdAtual = animeId;
    ultimoTempoSalvoDB = 0;
    assistiuAlgo = false; // Reseta a flag ao iniciar novo episódio

    const videoElement = document.getElementById("player-video");
    const containerPlayer = document.getElementById("custom-player-container");
    const controlsOverlay = document.getElementById("custom-player-controls");

    const btnPlay = document.getElementById("btn-player-play");
    const btnRewind = document.getElementById("btn-player-rewind");
    const btnForward = document.getElementById("btn-player-forward");
    const progressBar = document.getElementById("player-progress");
    const timeDisplay = document.getElementById("player-time-display");
    const btnFullscreen = document.getElementById("btn-player-fullscreen");

    const metaTag = document.getElementById("player-meta-tag");
    const tituloEp = document.getElementById("player-titulo-ep");
    const btnVerTodos = document.getElementById("lnk-ver-todos");

    if (videoElement) {
      videoElement.src = episodioAtual.video || "";
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

        function mostrarControles() {
          controlsOverlay.classList.remove("controls-hidden");
        }

        function ocultarControles() {
          if (!videoElement.paused) {
            controlsOverlay.classList.add("controls-hidden");
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

        btnPlay.addEventListener("click", togglePlay);
        videoElement.addEventListener("click", togglePlay);

        videoElement.addEventListener("play", () => {
          btnPlay.innerHTML = `<span class="material-symbols-outlined">pause</span>`;
          resetAutoOcultarControles();
          assistiuAlgo = true;

          // Inicia o timer de 5 minutos e cancela eventual timer de pausa
          iniciarTimerCincoMinutos(videoElement);
        });

        videoElement.addEventListener("pause", () => {
          btnPlay.innerHTML = `<span class="material-symbols-outlined">play_arrow</span>`;
          mostrarControles();

          // Salva o progresso localmente
          const tempoAtual = Math.floor(videoElement.currentTime);
          const duracaoTotal = Math.floor(videoElement.duration || 0);
          if (tempoAtual > 0 && epIdAtual) {
            salvarProgressoDB(epIdAtual, tempoAtual, duracaoTotal);
            ultimoTempoSalvoDB = tempoAtual;
          }

          // Cancela timer de 5min e agenda envio para 5s após a pausa
          limparTimersSync();
          agendarSyncPausaCincoSegundos(videoElement);
        });

        btnRewind.addEventListener("click", (e) => {
          e.stopPropagation();
          videoElement.currentTime = Math.max(0, videoElement.currentTime - 10);
          resetAutoOcultarControles();
        });

        btnForward.addEventListener("click", (e) => {
          e.stopPropagation();
          videoElement.currentTime = Math.min(videoElement.duration || 0, videoElement.currentTime + 10);
          resetAutoOcultarControles();
        });

        videoElement.addEventListener("timeupdate", () => {
          const tempoAtual = videoElement.currentTime;
          const duracaoTotal = videoElement.duration || 0;

          if (tempoAtual > 2) {
            assistiuAlgo = true;
          }

          if (duracaoTotal > 0) {
            const porcentagem = (tempoAtual / duracaoTotal) * 100;
            progressBar.value = porcentagem;
            progressBar.style.background = `linear-gradient(to right, #ff4081 ${porcentagem}%, rgba(255,255,255,0.3) ${porcentagem}%)`;
          }

          timeDisplay.textContent = `${formatarTempo(tempoAtual)} • ${formatarTempo(duracaoTotal)}`;

          // Salva localmente no DB a cada 10 segundos
          const segAtual = Math.floor(tempoAtual);
          if (segAtual >= 15 && (segAtual - ultimoTempoSalvoDB >= 10)) {
            ultimoTempoSalvoDB = segAtual;
            salvarProgressoDB(epIdAtual, segAtual, Math.floor(duracaoTotal));
          }
        });

        progressBar.addEventListener("input", () => {
          const duracaoTotal = videoElement.duration || 0;
          if (duracaoTotal > 0) {
            videoElement.currentTime = (progressBar.value / 100) * duracaoTotal;
          }
        });

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

        btnFullscreen.addEventListener("click", toggleFullscreen);

        const atualizarIconeFullscreen = () => {
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

        containerPlayer.addEventListener("mousemove", resetAutoOcultarControles);
        containerPlayer.addEventListener("touchstart", resetAutoOcultarControles, { passive: true });
      }

      setTimeout(() => {
        videoElement.play().catch(e => console.log("Autoplay bloqueado pelo navegador:", e));
      }, 200);
    }

    const numTemp = temporadaAtualNome.replace(/\D/g, "").padStart(2, "0") || "01";
    const numEp = String(episodioAtual.index || 1).padStart(2, "0");

    if (metaTag) metaTag.textContent = `${anime.titulo || "Anime"} T${numTemp}E${numEp}`;
    if (tituloEp) tituloEp.textContent = episodioAtual.titulo || "Episódio sem título";
    if (btnVerTodos) btnVerTodos.href = `#info?anime=${animeId}`;

    const indexAtual = todosEpisodios.findIndex(e => e.id === epId);
    const proximosEpisodios = todosEpisodios.slice(indexAtual + 1);

    await renderizarProximos(proximosEpisodios, animeId);

  } catch (erro) {
    console.error("Erro ao carregar dados do player:", erro);
  }
}

async function renderizarProximos(lista, animeId) {
  const container = document.getElementById("player-lista-proximos");
  const template = document.getElementById("modelo-card-player");

  if (!container || !template) return;

  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  if (!Array.isArray(lista) || lista.length === 0) {
    const p = document.createElement("p");
    p.className = "badge-tag";
    p.style.marginTop = "12px";
    p.textContent = "Nenhum episódio seguinte disponível nesta temporada.";
    container.appendChild(p);
    return;
  }

  const mapaProgresso = await buscarTodoProgressoDB();
  const fragment = document.createDocumentFragment();

  lista.forEach(ep => {
    const clone = template.content.cloneNode(true);

    const img = clone.querySelector(".player-ep-thumb");
    const duracao = clone.querySelector(".player-ep-duration");
    const titulo = clone.querySelector(".player-card-title");
    const card = clone.querySelector(".card-player-ep");

    const containerBarra = clone.querySelector(".barra-progresso-container");
    const preenchimentoBarra = clone.querySelector(".barra-progresso-preenchimento");

    if (img) {
      img.src = ep.thumb || "";
      img.alt = ep.titulo || "Episódio";
    }
    if (duracao) duracao.textContent = ep.duracao || "--min";
    if (titulo) titulo.textContent = ep.titulo || "Episódio";

    if (card) {
      card.style.cursor = "pointer";
      card.dataset.epId = ep.id;
    }

    if (mapaProgresso[ep.id]) {
      const dadosEp = mapaProgresso[ep.id];
      if (dadosEp.total > 0 && dadosEp.tempo > 0) {
        const porcentagem = (dadosEp.tempo / dadosEp.total) * 100;

        if (containerBarra && preenchimentoBarra) {
          containerBarra.style.display = "block";
          preenchimentoBarra.style.width = `${Math.min(porcentagem, 100)}%`;
        }
      }
    }

    fragment.appendChild(clone);
  });

  container.appendChild(fragment);

  if (!container.dataset.hasListener) {
    container.dataset.hasListener = "true";
    container.addEventListener("click", (e) => {
      const card = e.target.closest(".card-player-ep");
      if (!card) return;

      e.preventDefault();
      const epId = card.dataset.epId;
      if (epId && animeIdAtual) {
        const novaUrl = `${window.location.pathname}#player?anime=${animeIdAtual}&ep=${epId}`;
        window.location.replace(novaUrl);
      }
    });
  }
}
