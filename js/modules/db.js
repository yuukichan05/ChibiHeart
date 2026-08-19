// js/modules/db.js

const DB_NAME = "ChibiHeartDB";
const DB_VERSION = 2;
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

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(STORES.PROGRESSO)) {
        db.createObjectStore(STORES.PROGRESSO, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(STORES.PERFIL)) {
        db.createObjectStore(STORES.PERFIL, { keyPath: "id" });
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject("Erro ao abrir IndexedDB: " + event.target.error);
  });
}

/* ==========================================================================
   MÉTODOS DE PERFIL
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
        const resultado = e.target.result;
        if (resultado) {
          resolve({ ...perfilPadrao, ...resultado });
        } else {
          resolve(perfilPadrao);
        }
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
 */
export async function salvarPerfilDB(perfil) {
  try {
    const db = await abrirBanco();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.PERFIL, "readwrite");
      const store = transaction.objectStore(STORES.PERFIL);

      const registro = {
        ...perfilPadrao,
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
 * Limpa TODOS os dados do banco (Perfil e Histórico)
 */
export async function limparTudoDB() {
  try {
    const db = await abrirBanco();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORES.PERFIL, STORES.PROGRESSO], "readwrite");

      transaction.objectStore(STORES.PERFIL).clear();
      transaction.objectStore(STORES.PROGRESSO).clear();

      transaction.oncomplete = () => resolve(true);
      transaction.onerror = (e) => reject(e.target.error);
    });
  } catch (erro) {
    console.error("❌ [DB] Falha ao limpar banco de dados completo:", erro);
  }
}

/* ==========================================================================
   MÉTODOS DE BACKUP / RESTAURAÇÃO DE DADOS DA CONTA
   ========================================================================== */

/**
 * Extrai todos os dados salvos garantindo que o perfil atual nunca vá vazio
 */
export async function exportarDadosDB() {
  try {
    const db = await abrirBanco();

    // Busca o perfil ativo (inclusive o padrão caso não tenha sido editado ainda)
    const perfilAtual = await buscarPerfilDB();

    const progressoData = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.PROGRESSO, "readonly");
      const req = tx.objectStore(STORES.PROGRESSO).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = (e) => reject(e.target.error);
    });

    return {
      versao: 1,
      exportadoEm: new Date().toISOString(),
      perfil: [perfilAtual],
      progresso: progressoData
    };
  } catch (erro) {
    console.error("❌ [DB] Erro ao exportar dados:", erro);
    throw erro;
  }
}

/**
 * Importa e sobrescreve as stores de Perfil e Progresso
 */
export async function importarDadosDB(dados) {
  if (!dados || typeof dados !== "object") return false;

  try {
    const db = await abrirBanco();

    // Importa dados do Perfil (aceita Array ou Objeto simples)
    let listaPerfil = [];
    if (Array.isArray(dados.perfil)) {
      listaPerfil = dados.perfil;
    } else if (dados.perfil && typeof dados.perfil === "object") {
      listaPerfil = [dados.perfil];
    }

    if (listaPerfil.length > 0) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.PERFIL, "readwrite");
        const store = tx.objectStore(STORES.PERFIL);
        store.clear();

        listaPerfil.forEach((item) => {
          const registro = {
            ...perfilPadrao,
            ...item,
            id: PERFIL_KEY,
            atualizadoEm: Date.now()
          };
          store.put(registro);
        });

        tx.oncomplete = () => resolve(true);
        tx.onerror = (e) => reject(e.target.error);
      });
    }

    // Importa dados de Progresso
    if (Array.isArray(dados.progresso)) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.PROGRESSO, "readwrite");
        const store = tx.objectStore(STORES.PROGRESSO);
        store.clear();
        dados.progresso.forEach((item) => store.put(item));
        tx.oncomplete = () => resolve(true);
        tx.onerror = (e) => reject(e.target.error);
      });
    }

    return true;
  } catch (erro) {
    console.error("❌ [DB] Erro ao importar dados:", erro);
    return false;
  }
}

/* ==========================================================================
   MÉTODOS DE PROGRESSO DOS EPISÓDIOS
   ========================================================================== */

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
