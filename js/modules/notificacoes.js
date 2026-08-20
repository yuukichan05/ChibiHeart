import {
  buscarNotificacoesDB,
  salvarNotificacaoDB,
  limparNotificacoesDB,
  marcarNotificacoesLidasDB,
  sincronizarUploadGithub
} from './db.js';

/**
 * Retorna o título formatado da seção de data (Ex: "20 de Agosto de 2026")
 */
function obterTituloDataGrupo(timestamp) {
  if (!timestamp) return "Data desconhecida";
  const data = new Date(timestamp);

  const dia = data.getDate();
  const meses = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];
  const mes = meses[data.getMonth()];
  const ano = data.getFullYear();

  return `${dia} de ${mes} de ${ano}`;
}

/**
 * Retorna a hora formatada (ex: "hoje às 14:30", "ontem às 20:15", "18/08/2026 às 10:00")
 */
function formatarDataStatus(timestamp) {
  if (!timestamp) return "";

  const agora = new Date();
  const data = new Date(timestamp);

  const hora = String(data.getHours()).padStart(2, "0");
  const min = String(data.getMinutes()).padStart(2, "0");
  const horaFormatada = `${hora}:${min}`;

  const hojeMeiaNoite = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const dataMeiaNoite = new Date(data.getFullYear(), data.getMonth(), data.getDate());

  const diffMs = hojeMeiaNoite - dataMeiaNoite;
  const diffDias = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDias === 0) return `hoje às ${horaFormatada}`;
  if (diffDias === 1) return `ontem às ${horaFormatada}`;

  const dia = String(data.getDate()).padStart(2, "0");
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const ano = data.getFullYear();
  return `${dia}/${mes}/${ano} às ${horaFormatada}`;
}

/**
 * Agrupa os registros por Dia Civil (YYYY-MM-DD)
 */
function agruparPorData(listaItens) {
  const gruposMap = new Map();

  listaItens.forEach((item) => {
    const timestamp = item.timestamp || Date.now();
    const dataObj = new Date(timestamp);

    const chaveData = `${dataObj.getFullYear()}-${String(dataObj.getMonth() + 1).padStart(2, '0')}-${String(dataObj.getDate()).padStart(2, '0')}`;

    if (!gruposMap.has(chaveData)) {
      gruposMap.set(chaveData, {
        tituloData: obterTituloDataGrupo(timestamp),
        itens: []
      });
    }
    gruposMap.get(chaveData).itens.push(item);
  });

  return Array.from(gruposMap.values());
}

/**
 * Adiciona uma nova notificação diretamente no IndexedDB
 */
export async function adicionarNotificacao({ titulo, mensagem, tipo = 'info' }) {
  const novaNotificacao = {
    id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    titulo,
    mensagem,
    tipo,
    timestamp: Date.now(),
    lida: false
  };

  await salvarNotificacaoDB(novaNotificacao);
  await atualizarBadgeNotificacao();
}

/**
 * Atualiza o número no badge vermelho do cabeçalho
 */
export async function atualizarBadgeNotificacao() {
  const badge = document.getElementById("notificacao-badge");
  if (!badge) return;

  const lista = await buscarNotificacoesDB();
  const naoLidas = lista.filter(n => !n.lida).length;

  if (naoLidas > 0) {
    badge.textContent = naoLidas > 99 ? '99+' : String(naoLidas);
    badge.style.display = "flex";
  } else {
    badge.style.display = "none";
  }
}

/**
 * Marca todas as notificações como lidas no banco
 */
export async function marcarTodasComoLidas() {
  await marcarNotificacoesLidasDB();
  await atualizarBadgeNotificacao();
}

/**
 * Limpa todas as notificações no banco local e atualiza a nuvem
 */
export async function limparNotificacoes() {
  await limparNotificacoesDB();
  await atualizarBadgeNotificacao();
  await gerenciarTelaNotificacoes();

  // Envia os dados com a lista de notificações zerada para o GitHub
  sincronizarUploadGithub(true).catch(() => {});
}

/**
 * Renderiza e gerencia a View de Notificações (#notificacoes)
 */
export async function gerenciarTelaNotificacoes() {
  const hash = window.location.hash;
  if (!hash.startsWith("#notificacoes")) return;

  const container = document.getElementById("container-lista-notificacoes");
  const template = document.getElementById("modelo-card-notificacao");
  const msgVazio = document.getElementById("notificacoes-vazio");
  const btnLimpar = document.getElementById("btn-limpar-notificacoes");

  if (!container || !template) return;

  if (btnLimpar) {
    btnLimpar.onclick = async () => await limparNotificacoes();
  }

  const lista = await buscarNotificacoesDB();
  container.replaceChildren();

  if (lista.length === 0) {
    if (msgVazio) msgVazio.style.display = "block";
    return;
  }

  if (msgVazio) msgVazio.style.display = "none";

  const grupos = agruparPorData(lista);
  const frag = document.createDocumentFragment();

  const iconesPorTipo = {
    sucesso: 'check_circle',
    erro: 'error',
    alerta: 'warning',
    info: 'info'
  };

  grupos.forEach((grupo) => {
    const grupoDiv = document.createElement("div");
    grupoDiv.className = "notificacao-grupo-data";

    const tituloHeader = document.createElement("h3");
    tituloHeader.className = "data-grupo-titulo";
    tituloHeader.textContent = grupo.tituloData;
    grupoDiv.appendChild(tituloHeader);

    grupo.itens.forEach((notif) => {
      const clone = template.content.cloneNode(true);
      const card = clone.querySelector(".notificacao-card");
      const elIcone = clone.querySelector(".notificacao-icone");
      const elTitulo = clone.querySelector(".notificacao-titulo");
      const elHora = clone.querySelector(".notificacao-hora");
      const elMensagem = clone.querySelector(".notificacao-mensagem");

      if (card) {
        card.classList.add(notif.tipo || 'info');
        if (!notif.lida) card.classList.add("nao-lida");
      }

      if (elIcone) {
        elIcone.textContent = iconesPorTipo[notif.tipo] || 'info';
      }

      if (elTitulo) elTitulo.textContent = notif.titulo;
      if (elHora) elHora.textContent = formatarDataStatus(notif.timestamp);
      if (elMensagem) elMensagem.textContent = notif.mensagem;

      grupoDiv.appendChild(clone);
    });

    frag.appendChild(grupoDiv);
  });

  container.appendChild(frag);

  await marcarTodasComoLidas();
}
