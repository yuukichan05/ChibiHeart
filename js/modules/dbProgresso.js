// dbProgresso.js - Operações de Progresso de Reprodução dos Episódios

import { abrirBanco, STORES, sincronizarUploadGithub } from './db.js';

export async function salvarProgressoDB(epId, tempo, total, dispararSync = false) {
  try {
    const db = await abrirBanco();
    const concluido = total > 0 ? (tempo / total) >= 0.85 : false;

    const registro = {
      id: epId,
      tempo,
      total,
      concluido,
      atualizadoEm: Date.now()
    };

    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.PROGRESSO, "readwrite");
      const req = tx.objectStore(STORES.PROGRESSO).put(registro);
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e.target.error);
    });

    if (dispararSync) {
      sincronizarUploadGithub(false, true).catch(() => {});
    }
    return true;
  } catch (erro) {
    console.error("❌ [DB] Falha ao salvar progresso:", erro);
  }
}

export async function alternarConcluidoDB(epId, concluido = true) {
  try {
    const db = await abrirBanco();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.PROGRESSO, "readwrite");
      const store = tx.objectStore(STORES.PROGRESSO);

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

    sincronizarUploadGithub(false, true).catch(() => {});
    return true;
  } catch (erro) {
    console.error("❌ [DB] Falha ao alterar status de concluído:", erro);
  }
}

export async function buscarProgressoDB(epId) {
  try {
    const db = await abrirBanco();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.PROGRESSO, "readonly");
      const req = tx.objectStore(STORES.PROGRESSO).get(epId);
      req.onsuccess = (e) => resolve(e.target.result || null);
      req.onerror = (e) => reject(e.target.error);
    });
  } catch {
    return null;
  }
}

export async function buscarTodoProgressoListaDB() {
  try {
    const db = await abrirBanco();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.PROGRESSO, "readonly");
      const req = tx.objectStore(STORES.PROGRESSO).getAll();
      req.onsuccess = (e) => resolve(e.target.result || []);
      req.onerror = (e) => reject(e.target.error);
    });
  } catch {
    return [];
  }
}

export async function buscarTodoProgressoDB() {
  const lista = await buscarTodoProgressoListaDB();
  const mapa = {};
  lista.forEach(item => { mapa[item.id] = item; });
  return mapa;
}
