// dbCore.js - Conexão IndexedDB, Configurações Base, Perfil e Notificações

export const DB_NAME = "ChibiHeartDB";
export const DB_VERSION = 3;
export const STORES = {
  PROGRESSO: "progresso",
  PERFIL: "perfil",
  NOTIFICACOES: "notificacoes"
};

export const PERFIL_KEY = "usuario_atual";
export const perfilPadrao = {
  id: PERFIL_KEY,
  nome: "Usuário Chibi",
  email: "usuario@chibiheart.com",
  foto: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSP-d8FnyUc7-qF7238NfPxfjaILuYofuXX40GH3RCUFJES5zDqFP3ptKs&s=10",
  githubToken: "",
  gistId: "",
  atualizadoEm: 0
};

export function notificarAtualizacaoDados() {
  window.dispatchEvent(new CustomEvent('dadosAtualizados'));
}

export function obterDataHoraFormatada() {
  const agora = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${agora.getFullYear()}-${pad(agora.getMonth() + 1)}-${pad(agora.getDate())}_${pad(agora.getHours())}-${pad(agora.getMinutes())}-${pad(agora.getSeconds())}`;
}

export function abrirBanco() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORES.PROGRESSO)) db.createObjectStore(STORES.PROGRESSO, { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORES.PERFIL)) db.createObjectStore(STORES.PERFIL, { keyPath: "id" });
      if (!db.objectStoreNames.contains(STORES.NOTIFICACOES)) db.createObjectStore(STORES.NOTIFICACOES, { keyPath: "id" });
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject("Erro ao abrir IndexedDB: " + event.target.error);
  });
}

// ==========================================
// OPERAÇÕES DE PERFIL
// ==========================================

export async function buscarPerfilDB() {
  try {
    const db = await abrirBanco();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.PERFIL, "readonly");
      const store = transaction.objectStore(STORES.PERFIL);
      const request = store.get(PERFIL_KEY);

      request.onsuccess = (e) => {
        const resultado = e.target.result;
        resolve(resultado ? { ...perfilPadrao, ...resultado } : perfilPadrao);
      };
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (erro) {
    console.error("❌ [DB] Falha ao buscar perfil:", erro);
    return perfilPadrao;
  }
}

export async function salvarPerfilDB(perfil, atualizarTimestamp = true) {
  try {
    const db = await abrirBanco();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.PERFIL, "readwrite");
      const store = transaction.objectStore(STORES.PERFIL);

      const registro = {
        ...perfilPadrao,
        ...perfil,
        id: PERFIL_KEY,
        atualizadoEm: atualizarTimestamp ? Date.now() : (perfil.atualizadoEm || 0)
      };

      const request = store.put(registro);
      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (erro) {
    console.error("❌ [DB] Falha ao salvar perfil:", erro);
  }
}

// ==========================================
// OPERAÇÕES DE NOTIFICAÇÕES
// ==========================================

export async function buscarNotificacoesDB() {
  try {
    const db = await abrirBanco();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.NOTIFICACOES, "readonly");
      const req = tx.objectStore(STORES.NOTIFICACOES).getAll();

      req.onsuccess = () => {
        const lista = req.result || [];
        lista.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        resolve(lista);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  } catch {
    return [];
  }
}

export async function salvarNotificacaoDB(notificacao) {
  try {
    const db = await abrirBanco();
    const listaAtual = await buscarNotificacoesDB();

    listaAtual.unshift(notificacao);
    const listaFormatada = listaAtual.slice(0, 50);

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.NOTIFICACOES, "readwrite");
      const store = tx.objectStore(STORES.NOTIFICACOES);
      store.clear();

      listaFormatada.forEach((item) => store.put(item));

      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
    });
  } catch (erro) {
    console.error("❌ [DB] Erro ao salvar notificação:", erro);
  }
}

export async function marcarNotificacoesLidasDB() {
  try {
    const db = await abrirBanco();
    const lista = await buscarNotificacoesDB();
    let alterou = false;

    lista.forEach(n => {
      if (!n.lida) {
        n.lida = true;
        alterou = true;
      }
    });

    if (!alterou) return;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.NOTIFICACOES, "readwrite");
      const store = tx.objectStore(STORES.NOTIFICACOES);
      store.clear();
      lista.forEach(item => store.put(item));
      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
    });
  } catch (erro) {
    console.error("❌ [DB] Erro ao marcar lidas:", erro);
  }
}

export async function limparNotificacoesDB() {
  try {
    const db = await abrirBanco();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.NOTIFICACOES, "readwrite");
      tx.objectStore(STORES.NOTIFICACOES).clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
    });
  } catch (erro) {
    console.error("❌ [DB] Erro ao limpar notificações:", erro);
  }
}

// ==========================================
// LIMPEZA TOTAL DO BANCO DE DADOS
// ==========================================

export async function limparTudoDB() {
  try {
    const db = await abrirBanco();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.PERFIL, STORES.PROGRESSO, STORES.NOTIFICACOES], "readwrite");

      tx.objectStore(STORES.PERFIL).clear();
      tx.objectStore(STORES.PROGRESSO).clear();
      tx.objectStore(STORES.NOTIFICACOES).clear();

      tx.oncomplete = () => {
        notificarAtualizacaoDados();
        resolve(true);
      };
      tx.onerror = (e) => reject(e.target.error);
    });
  } catch (erro) {
    console.error("❌ [DB] Falha ao limpar banco de dados completo:", erro);
  }
}
