// js/modules/features/playerUiUtils.js

export function makeEpisodeId(animeId, seasonIdx, episodeIdx) {
  const s = String(seasonIdx).padStart(2, '0');
  const e = String(episodeIdx).padStart(2, '0');
  return `${animeId}_s${s}e${e}`;
}

// Formata segundos em MM:SS ou HH:MM:SS
export function formatarTempo(segundos) {
  if (isNaN(segundos) || segundos < 0) return "00:00";
  const horas = Math.floor(segundos / 3600);
  const minutos = Math.floor((segundos % 3600) / 60);
  const seg = Math.floor(segundos % 60);

  if (horas > 0) {
    return `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}:${String(seg).padStart(2, '0')}`;
  }
  return `${String(minutos).padStart(2, '0')}:${String(seg).padStart(2, '0')}`;
}

// Exibe notificação temporária de 5 segundos na tela
export function exibirToast(mensagem) {
  const toastExistente = document.getElementById("player-toast-msg");
  if (toastExistente) toastExistente.remove();

  const toast = document.createElement("div");
  toast.id = "player-toast-msg";
  toast.textContent = mensagem;

  Object.assign(toast.style, {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    color: "#fff",
    padding: "12px 24px",
    borderRadius: "8px",
    boxShadow: "0 4px 10px rgba(0,0,0,0.3)",
    zIndex: "9999",
    fontFamily: "sans-serif",
    fontSize: "14px",
    transition: "opacity 0.4s ease, transform 0.4s ease",
    opacity: "0",
    transform: "translateY(20px)",
    pointerEvents: "none"
  });

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  });

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(20px)";
    setTimeout(() => toast.remove(), 400);
  }, 5000);
}

// Atualiza o estado visual do botão de áudio DUB / LEG
export function atualizarBotaoAudio(btnAudio, idioma, temAmbos) {
  if (!btnAudio) return;

  btnAudio.disabled = false;
  btnAudio.style.cursor = "pointer";

  if (temAmbos) {
    btnAudio.style.opacity = "1";
    btnAudio.style.filter = "none";
    btnAudio.textContent = idioma === 'dub' ? "Dublado" : "Legendado";
    btnAudio.title = `Clique para alternar para ${idioma === 'dub' ? 'Legendado' : 'Dublado'}`;
  } else {
    btnAudio.style.opacity = "0.7";
    btnAudio.style.filter = "none";
    btnAudio.title = "Clique para verificar a disponibilidade";

    if (idioma === 'dub') {
      btnAudio.textContent = "Dublado";
    } else if (idioma === 'leg') {
      btnAudio.textContent = "Legendado";
    } else {
      btnAudio.textContent = "Vídeo";
    }
  }
}
