// js/modules/db.js

const DB_NAME = "ChibiHeartDB";
const DB_VERSION = 2; // Incrementado para criar novas stores
const STORES = {
  PROGRESSO: "progresso",
  PERFIL: "perfil"
};

/**
 * Inicializa e abre a conexão com o IndexedDB
 */
function abrirBanco() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    // Atualiza a estrutura do banco se a versão mudar
    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Store para o progresso dos episódios
      if (!db.objectStoreNames.contains(STORES.PROGRESSO)) {
        db.createObjectStore(STORES.PROGRESSO, { keyPath: "id" });
      }

      // Nova Store para o Perfil do Usuário
      if (!db.objectStoreNames.contains(STORES.PERFIL)) {
        db.createObjectStore(STORES.PERFIL, { keyPath: "id" });
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject("Erro ao abrir IndexedDB: " + event.target.error);
  });
}

/* ==========================================================================
   MÉTODOS DE PERFIL (NOVO)
   ========================================================================== */

const PERFIL_KEY = "usuario_atual";

const perfilPadrao = {
  id: PERFIL_KEY,
  nome: "Usuário Chibi",
  email: "usuario@chibiheart.com",
  foto: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSP-d8FnyUc7-qF7238NfPxfjaILuYofuXX40GH3RCUFJES5zDqFP3ptKs&s=10"
};

/**
 * Busca os dados do perfil salvo no IndexedDB
 */
export async function buscarPerfilDB() {
  try {
    const db = await abrirBanco();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.PERFIL, "readonly");
      const store = transaction.objectStore(STORES.PERFIL);
      const request = store.get(PERFIL_KEY);

      request.onsuccess = (e) => {
        resolve(e.target.result || perfilPadrao);
      };
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (erro) {
    console.error("❌ [DB] Falha ao buscar perfil:", erro);
    return perfilPadrao;
  }
}

/**
 * Salva ou atualiza os dados do perfil no IndexedDB
 * @param {Object} perfil
 */
export async function salvarPerfilDB(perfil) {
  try {
    const db = await abrirBanco();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.PERFIL, "readwrite");
      const store = transaction.objectStore(STORES.PERFIL);

      const registro = {
        ...perfil,
        id: PERFIL_KEY,
        atualizadoEm: Date.now()
      };

      const request = store.put(registro);
      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (erro) {
    console.error("❌ [DB] Falha ao salvar perfil:", erro);
  }
}

/**
 * Limpa os dados do perfil (Logout)
 */
export async function limparPerfilDB() {
  try {
    const db = await abrirBanco();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.PERFIL, "readwrite");
      const store = transaction.objectStore(STORES.PERFIL);
      const request = store.delete(PERFIL_KEY);

      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (erro) {
    console.error("❌ [DB] Falha ao limpar perfil:", erro);
  }
}

/* ==========================================================================
   MÉTODOS DE PROGRESSO DOS EPISÓDIOS
   ========================================================================== */

/**
 * Salva ou atualiza o progresso de um episódio
 */
export async function salvarProgressoDB(epId, tempo, total) {
  try {
    const db = await abrirBanco();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.PROGRESSO, "readwrite");
      const store = transaction.objectStore(STORES.PROGRESSO);

      const concluido = total > 0 ? (tempo / total) >= 0.85 : false;

      const registro = {
        id: epId,
        tempo,
        total,
        concluido,
        atualizadoEm: Date.now()
      };

      const request = store.put(registro);
      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (erro) {
    console.error("❌ [DB] Falha ao salvar progresso:", erro);
  }
}

/**
 * Marca ou desmarca manualmente um episódio como concluído no banco
 */
export async function alternarConcluidoDB(epId, concluido = true) {
  try {
    const db = await abrirBanco();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.PROGRESSO, "readwrite");
      const store = transaction.objectStore(STORES.PROGRESSO);

      const requestGet = store.get(epId);

      requestGet.onsuccess = (e) => {
        const existente = e.target.result || {};
        const total = existente.total || 100;

        const registro = {
          ...existente,
          id: epId,
          tempo: concluido ? total : 0,
          total: total,
          concluido: concluido,
          atualizadoEm: Date.now()
        };

        const requestPut = store.put(registro);
        requestPut.onsuccess = () => resolve(true);
        requestPut.onerror = (err) => reject(err.target.error);
      };

      requestGet.onerror = (err) => reject(err.target.error);
    });
  } catch (erro) {
    console.error("❌ [DB] Falha ao alterar status de concluído:", erro);
  }
}

/**
 * Busca o progresso de um episódio específico
 */
export async function buscarProgressoDB(epId) {
  try {
    const db = await abrirBanco();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.PROGRESSO, "readonly");
      const store = transaction.objectStore(STORES.PROGRESSO);
      const request = store.get(epId);

      request.onsuccess = (e) => resolve(e.target.result || null);
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (erro) {
    console.error("❌ [DB] Falha ao buscar progresso:", erro);
    return null;
  }
}

/**
 * Busca o progresso de TODOS os episódios de uma vez
 */
export async function buscarTodoProgressoDB() {
  try {
    const db = await abrirBanco();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.PROGRESSO, "readonly");
      const store = transaction.objectStore(STORES.PROGRESSO);
      const request = store.getAll();

      request.onsuccess = (e) => {
        const mapa = {};
        const resultados = e.target.result || [];
        resultados.forEach(item => {
          mapa[item.id] = item;
        });
        resolve(mapa);
      };
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (erro) {
    console.error("❌ [DB] Falha ao listar progressos:", erro);
    return {};
  }
}
