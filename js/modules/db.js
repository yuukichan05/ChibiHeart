// js/modules/db.js

import { adicionarNotificacao } from './notificacoes.js';

const DB_NAME = "ChibiHeartDB";
const DB_VERSION = 3;
const STORES = {
  PROGRESSO: "progresso",
  PERFIL: "perfil",
  NOTIFICACOES: "notificacoes"
};

const GIST_FILENAME = "chibiheart_sync_backup.json";
const GIST_DESCRIPTION = "[ChibiHeart Streaming] Backup Automático de Conta";

let timerReSincronizacao = null;

// ==========================================================================
// CONTROLE DE TRAVA/BLOQUEIO DE SINCRONIZAÇÃO (3 SEGUNDOS)
// ==========================================================================
let ultimoSyncTimestamp = 0;
const SYNC_LOCK_MS = 30 * 1000;

function sincronizacaoBloqueada() {
  const agora = Date.now();
  if (agora - ultimoSyncTimestamp < SYNC_LOCK_MS) {
    console.log(`⏳ [Sync Lock] Sincronização ignorada (aguarde ${SYNC_LOCK_MS / 1000}s entre chamadas).`);
    return true;
  }
  return false;
}

function registrarSincronizacao() {
  ultimoSyncTimestamp = Date.now();
}

/**
 * Conexão com o IndexedDB
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

      if (!db.objectStoreNames.contains(STORES.NOTIFICACOES)) {
        db.createObjectStore(STORES.NOTIFICACOES, { keyPath: "id" });
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject("Erro ao abrir IndexedDB: " + event.target.error);
  });
}

/* ==========================================================================
   MÉTODOS DE PERFIL E CONFIGURAÇÃO
   ========================================================================== */

const PERFIL_KEY = "usuario_atual";

const perfilPadrao = {
  id: PERFIL_KEY,
  nome: "Usuário Chibi",
  email: "usuario@chibiheart.com",
  foto: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSP-d8FnyUc7-qF7238NfPxfjaILuYofuXX40GH3RCUFJES5zDqFP3ptKs&s=10",
  githubToken: "",
  gistId: "",
  atualizadoEm: Date.now()
};

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

/* ==========================================================================
   MÉTODOS DA STORE DE NOTIFICAÇÕES (IndexedDB)
   ========================================================================== */

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

export async function limparTudoDB() {
  try {
    const db = await abrirBanco();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.PERFIL, STORES.PROGRESSO, STORES.NOTIFICACOES], "readwrite");

      tx.objectStore(STORES.PERFIL).clear();
      tx.objectStore(STORES.PROGRESSO).clear();
      tx.objectStore(STORES.NOTIFICACOES).clear();

      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
    });
  } catch (erro) {
    console.error("❌ [DB] Falha ao limpar banco de dados completo:", erro);
  }
}

/* ==========================================================================
   EXPORTAÇÃO E IMPORTAÇÃO COMPLETA DE DADOS
   ========================================================================== */

export function obterDataHoraFormatada() {
  const agora = new Date();
  const pad = (n) => String(n).padStart(2, '0');

  return `${agora.getFullYear()}-${pad(agora.getMonth() + 1)}-${pad(agora.getDate())}_${pad(agora.getHours())}-${pad(agora.getMinutes())}-${pad(agora.getSeconds())}`;
}

export async function obterMaiorTimestampLocal() {
  const perfil = await buscarPerfilDB();
  const progressos = await buscarTodoProgressoListaDB();
  const notificacoes = await buscarNotificacoesDB();

  let maxTs = perfil.atualizadoEm || 0;

  progressos.forEach(p => {
    if (p.atualizadoEm && p.atualizadoEm > maxTs) maxTs = p.atualizadoEm;
  });

  notificacoes.forEach(n => {
    if (n.timestamp && n.timestamp > maxTs) maxTs = n.timestamp;
  });

  return maxTs || Date.now();
}

export async function exportarDadosDB() {
  try {
    const db = await abrirBanco();
    const perfilAtual = await buscarPerfilDB();

    const perfilSeguro = {
      ...perfilAtual,
      githubToken: "",
      gistId: ""
    };

    const progressoData = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.PROGRESSO, "readonly");
      const req = tx.objectStore(STORES.PROGRESSO).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = (e) => reject(e.target.error);
    });

    const notificacoesData = await buscarNotificacoesDB();
    const timestampLocal = await obterMaiorTimestampLocal();

    return {
      versao: 2,
      exportadoEm: new Date(timestampLocal).toISOString(),
      timestampModificacao: timestampLocal,
      perfil: [perfilSeguro],
      progresso: progressoData,
      notificacoes: notificacoesData
    };
  } catch (erro) {
    console.error("❌ [DB] Erro ao exportar dados:", erro);
    throw erro;
  }
}

export async function importarDadosDB(dados) {
  if (!dados || typeof dados !== "object") return false;

  try {
    const db = await abrirBanco();
    const perfilLocalAtual = await buscarPerfilDB();

    let listaPerfil = Array.isArray(dados.perfil) ? dados.perfil : (dados.perfil ? [dados.perfil] : []);

    if (listaPerfil.length > 0) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.PERFIL, "readwrite");
        const store = tx.objectStore(STORES.PERFIL);
        store.clear();

        listaPerfil.forEach((item) => {
          store.put({
            ...perfilPadrao,
            ...item,
            githubToken: perfilLocalAtual.githubToken || item.githubToken || "",
            gistId: perfilLocalAtual.gistId || item.gistId || "",
            id: PERFIL_KEY,
            atualizadoEm: item.atualizadoEm || Date.now()
          });
        });

        tx.oncomplete = () => resolve(true);
        tx.onerror = (e) => reject(e.target.error);
      });
    }

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

    if (Array.isArray(dados.notificacoes)) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORES.NOTIFICACOES, "readwrite");
        const store = tx.objectStore(STORES.NOTIFICACOES);
        store.clear();
        dados.notificacoes.forEach((item) => store.put(item));
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
   SINCRONIZAÇÃO INTELIGENTE COM BLOQUEIO DE 3 SEGUNDOS
   ========================================================================== */

async function obterOuCriarGistId(token) {
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json'
  };

  const responseList = await fetch('https://api.github.com/gists', { headers });
  if (responseList.status === 403 || responseList.status === 429) {
    throw new Error('RATE_LIMIT');
  }
  if (!responseList.ok) throw new Error('Token do GitHub inválido ou sem acesso.');

  const gists = await responseList.json();
  const gistExistente = gists.find(g => g.description === GIST_DESCRIPTION || g.files[GIST_FILENAME]);

  if (gistExistente) return gistExistente.id;

  const dadosIniciais = await exportarDadosDB();
  const responseCreate = await fetch('https://api.github.com/gists', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description: GIST_DESCRIPTION,
      public: false,
      files: { [GIST_FILENAME]: { content: JSON.stringify(dadosIniciais, null, 2) } }
    })
  });

  if (!responseCreate.ok) throw new Error('Falha ao criar Gist de backup no GitHub.');
  const novoGist = await responseCreate.json();
  return novoGist.id;
}

export function agendarReSincronizacaoCincoMinutos() {
  if (timerReSincronizacao) clearTimeout(timerReSincronizacao);

  console.warn("⏳ [Sync Engine] Re-sincronização agendada para daqui a 5 minutos...");

  timerReSincronizacao = setTimeout(async () => {
    console.log("🔄 [Sync Engine] Executando tentativa automática de re-sincronização...");
    await sincronizarUploadGithub(true);
  }, 5 * 60 * 1000);
}

export async function sincronizarUploadGithub(forcar = false) {
  const perfil = await buscarPerfilDB();
  if (!perfil.githubToken) return { sucesso: false, motivo: 'no_token' };

  // Aplica o bloqueio de 3 segundos se não for uma ação forçada
  if (!forcar && sincronizacaoBloqueada()) {
    return { sucesso: false, motivo: 'bloqueado_tempo' };
  }

  registrarSincronizacao();

  try {
    let gistId = perfil.gistId;
    if (!gistId) {
      gistId = await obterOuCriarGistId(perfil.githubToken);
      perfil.gistId = gistId;
      await salvarPerfilDB(perfil);
    }

    const dadosLocais = await exportarDadosDB();

    const response = await fetch(`https://api.github.com/gists/${gistId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${perfil.githubToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github+json'
      },
      body: JSON.stringify({
        files: { [GIST_FILENAME]: { content: JSON.stringify(dadosLocais, null, 2) } }
      })
    });

    if (response.status === 403 || response.status === 429) {
      await adicionarNotificacao({
        titulo: 'Limite de Requisições do GitHub',
        mensagem: 'O GitHub bloqueou o envio por limite de taxa. Nova tentativa agendada para 5 minutos.',
        tipo: 'alerta'
      });
      agendarReSincronizacaoCincoMinutos();
      return { sucesso: false, erro: 'Rate Limit' };
    }

    if (!response.ok) throw new Error('Não foi possível atualizar o Gist no GitHub.');

    await adicionarNotificacao({
      titulo: 'Sincronizado com a Nuvem',
      mensagem: 'Seu histórico local mais recente foi salvo na sua conta do GitHub com sucesso.',
      tipo: 'sucesso'
    });

    return { sucesso: true };
  } catch (erro) {
    console.error('❌ [Sync Upload Error]:', erro);

    await adicionarNotificacao({
      titulo: 'Sincronização em Espera',
      mensagem: `Sincronização pendente. Mantendo banco local intacto. Tentando novamente em 5 minutos.`,
      tipo: 'alerta'
    });

    agendarReSincronizacaoCincoMinutos();
    return { sucesso: false, erro: erro.message };
  }
}

export async function sincronizarDownloadGithub(forcar = false) {
  const perfil = await buscarPerfilDB();
  if (!perfil.githubToken) return { sucesso: false, motivo: 'no_token' };

  if (!forcar && sincronizacaoBloqueada()) {
    return { sucesso: false, motivo: 'bloqueado_tempo' };
  }

  registrarSincronizacao();

  try {
    let gistId = perfil.gistId;
    if (!gistId) {
      gistId = await obterOuCriarGistId(perfil.githubToken);
      perfil.gistId = gistId;
      await salvarPerfilDB(perfil);
    }

    const response = await fetch(`https://api.github.com/gists/${gistId}`, {
      headers: {
        'Authorization': `Bearer ${perfil.githubToken}`,
        'Accept': 'application/vnd.github+json'
      }
    });

    if (response.status === 403 || response.status === 429) {
      await adicionarNotificacao({
        titulo: 'Aviso de Rate Limit',
        mensagem: 'Não foi possível verificar a nuvem devido a limites do GitHub. Banco local mantido. Tentando em 5min.',
        tipo: 'alerta'
      });
      agendarReSincronizacaoCincoMinutos();
      return { sucesso: false, erro: 'Rate Limit' };
    }

    if (!response.ok) throw new Error('Erro ao buscar backup na nuvem.');

    const gist = await response.json();
    const conteudoTexto = gist.files[GIST_FILENAME]?.content;

    if (!conteudoTexto) {
      return await sincronizarUploadGithub(true);
    }

    const dadosRemotos = JSON.parse(conteudoTexto);
    const timestampRemoto = dadosRemotos.timestampModificacao || (dadosRemotos.exportadoEm ? new Date(dadosRemotos.exportadoEm).getTime() : 0);
    const timestampLocal = await obterMaiorTimestampLocal();

    if (timestampLocal >= timestampRemoto) {
      console.log("🛡️ [Sync Engine] Banco local é mais recente ou igual. Enviando atualização local para a nuvem...");
      return await sincronizarUploadGithub(true);
    }

    console.log("☁️ [Sync Engine] Backup na nuvem é mais recente. Atualizando banco de dados local...");
    await importarDadosDB(dadosRemotos);

    await adicionarNotificacao({
      titulo: 'Conta Atualizada da Nuvem',
      mensagem: 'Os dados mais recentes salvos na nuvem foram sincronizados neste dispositivo.',
      tipo: 'sucesso'
    });

    return { sucesso: true, dados: dadosRemotos };
  } catch (erro) {
    console.error('❌ [Sync Download Error]:', erro);

    await adicionarNotificacao({
      titulo: 'Falha na Conexão',
      mensagem: 'Erro ao conectar à nuvem. Seus dados locais estão seguros. Re-sincronizando em 5min.',
      tipo: 'alerta'
    });

    agendarReSincronizacaoCincoMinutos();
    return { sucesso: false, erro: erro.message };
  }
}

/* ==========================================================================
   PROGRESSO DOS EPISÓDIOS
   ========================================================================== */

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

    // Sincronização condicional (pode ser chamada diretamente pelo Player nos intervalos específicos)
    if (dispararSync) {
      sincronizarUploadGithub().catch(() => {});
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

    sincronizarUploadGithub().catch(() => {});
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

async function buscarTodoProgressoListaDB() {
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
