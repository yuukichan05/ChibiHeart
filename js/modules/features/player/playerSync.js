import { 
  salvarProgressoDB, 
  sincronizarUploadGithub 
} from "../../database/db.js";

let timerCincoMinutos = null;
let timerPausaCincoSegundos = null;
let assistiuAlgo = false;

export function getAssistiuAlgo() {
  return assistiuAlgo;
}

export function setAssistiuAlgo(valor) {
  assistiuAlgo = valor;
}

// Limpa os timers ativos de sincronização
export function limparTimersSync() {
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
export function iniciarTimerCincoMinutos(videoElement, epIdAtual) {
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
  }, 5 * 60 * 1000);
}

// Agenda sincronização para 5s após o vídeo ser pausado
export function agendarSyncPausaCincoSegundos(videoElement, epIdAtual) {
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
  }, 5000);
}
