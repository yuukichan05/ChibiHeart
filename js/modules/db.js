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

// CONTROLE DE TRAVA DE SINCRONIZAÇÃO (30 SEGUNDOS E EXECUÇÃO ATIVA)
let ultimoSyncTimestamp = 0;
let syncEmAndamento = false;
const SYNC_LOCK_MS = 30 * 1000;

/**
 * Notifica a aplicação de que os dados locais mudaram para re-renderizar a tela ativa.
 * Disparado APENAS quando todas as operações de banco/nuvem estão 100% concluídas.
 */
export function notificarAtualizacaoDados() {
  window.dispatchEvent(new CustomEvent('dadosAtualizados'));
}

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
  atualizadoEm: 0
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

/* ==========================================================================
   MÉTODOS DA STORE DE NOTIFICAÇÕES
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

/* ==========================================================================
   EXPORTAÇÃO, MESCLAGEM E IMPORTAÇÃO DE DADOS
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

  return maxTs;
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
      exportadoEm: new Date(timestampLocal || Date.now()).toISOString(),
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

async function mesclarProgressoDB(progressoRemoto = []) {
  const db = await abrirBanco();
  const progressosLocais = await buscarTodoProgressoListaDB();
  const mapa = new Map(progressosLocais.map(p => [p.id, p]));

  progressoRemoto.forEach(itemRemoto => {
    if (!itemRemoto || !itemRemoto.id) return;
    const itemLocal = mapa.get(itemRemoto.id);

    if (!itemLocal) {
      mapa.set(itemRemoto.id, itemRemoto);
    } else {
      const tsRemoto = itemRemoto.atualizadoEm || 0;
      const tsLocal = itemLocal.atualizadoEm || 0;

      if (tsRemoto > tsLocal || (itemRemoto.tempo || 0) > (itemLocal.tempo || 0)) {
        mapa.set(itemRemoto.id, itemRemoto);
      }
    }
  });

  const listaMesclada = Array.from(mapa.values());

  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.PROGRESSO, "readwrite");
    const store = tx.objectStore(STORES.PROGRESSO);
    store.clear();
    listaMesclada.forEach(item => store.put(item));
    tx.oncomplete = () => resolve(true);
    tx.onerror = (e) => reject(e.target.error);
  });

  return listaMesclada;
}

async function mesclarNotificacoesDB(notificacoesRemotas = []) {
  const notificacoesLocais = await buscarNotificacoesDB();
  const mapa = new Map();

  notificacoesLocais.forEach(n => { if (n.id) mapa.set(n.id, n); });
  notificacoesRemotas.forEach(n => { if (n.id && !mapa.has(n.id)) mapa.set(n.id, n); });

  const listaMesclada = Array.from(mapa.values())
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    .slice(0, 50);

  const db = await abrirBanco();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.NOTIFICACOES, "readwrite");
    const store = tx.objectStore(STORES.NOTIFICACOES);
    store.clear();
    listaMesclada.forEach(item => store.put(item));
    tx.oncomplete = () => resolve(true);
    tx.onerror = (e) => reject(e.target.error);
  });

  return listaMesclada;
}

async function mesclarPerfilDB(perfilRemotoArr = []) {
  const perfilRemoto = Array.isArray(perfilRemotoArr) ? perfilRemotoArr[0] : perfilRemotoArr;
  const perfilLocal = await buscarPerfilDB();

  if (!perfilRemoto) return perfilLocal;

  const tsRemoto = perfilRemoto.atualizadoEm || 0;
  const tsLocal = perfilLocal.atualizadoEm || 0;

  const usarRemoto = tsRemoto > tsLocal || (perfilLocal.nome === perfilPadrao.nome && perfilRemoto.nome !== perfilPadrao.nome);

  const perfilMesclado = {
    ...perfilPadrao,
    ...(usarRemoto ? perfilRemoto : perfilLocal),
    githubToken: perfilLocal.githubToken || perfilRemoto.githubToken || "",
    gistId: perfilLocal.gistId || perfilRemoto.gistId || "",
    id: PERFIL_KEY,
    atualizadoEm: Math.max(tsRemoto, tsLocal)
  };

  await salvarPerfilDB(perfilMesclado, false);
  return perfilMesclado;
}

export async function importarDadosDB(dados, mesclar = true) {
  if (!dados || typeof dados !== "object") return false;

  try {
    if (mesclar) {
      await mesclarPerfilDB(dados.perfil);
      await mesclarProgressoDB(dados.progresso);
      await mesclarNotificacoesDB(dados.notificacoes);
    } else {
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
    }

    return true;
  } catch (erro) {
    console.error("❌ [DB] Erro ao importar/mesclar dados:", erro);
    return false;
  }
}

/* ==========================================================================
   SINCRONIZAÇÃO INTELIGENTE COM O GITHUB GIST
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
    await sincronizarDownloadGithub(true);
  }, 5 * 60 * 1000);
}

/**
 * Envia dados locais para o GitHub Gist de forma silenciosa.
 */
export async function sincronizarUploadGithub(forcar = false, silencioso = true) {
  const perfil = await buscarPerfilDB();
  if (!perfil.githubToken) return { sucesso: false, motivo: 'no_token' };

  if (!forcar && sincronizacaoBloqueada()) {
    return { sucesso: false, motivo: 'bloqueado_tempo' };
  }

  try {
    let gistId = perfil.gistId;
    if (!gistId) {
      gistId = await obterOuCriarGistId(perfil.githubToken);
      perfil.gistId = gistId;
      await salvarPerfilDB(perfil, false);
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
      throw new Error('RATE_LIMIT');
    }

    if (!response.ok) throw new Error('Falha ao atualizar backup na nuvem.');

    if (!silencioso) {
      await adicionarNotificacao({
        titulo: 'Sincronização Concluída',
        mensagem: 'Seus dados foram atualizados e salvos com sucesso na nuvem.',
        tipo: 'sucesso'
      });
    }

    return { sucesso: true };
  } catch (erro) {
    console.error('❌ [Sync Upload Error]:', erro);
    return { sucesso: false, erro: erro.message };
  }
}

/**
 * Fluxo Unificado de Sincronização:
 * 1. Baixa dados da Nuvem
 * 2. Mescla no IndexedDB Local
 * 3. Faz Upload Silencioso do Resultado Mesclado
 * 4. Exibe APENAS 1 notificação de sucesso e re-renderiza a tela.
 */
export async function sincronizarDownloadGithub(forcar = false) {
  const perfil = await buscarPerfilDB();
  if (!perfil.githubToken) return { sucesso: false, motivo: 'no_token' };

  // IMPEDE CHAMADAS SIMULTÂNEAS/CONCORRENTES
  if (syncEmAndamento) return { sucesso: false, motivo: 'ja_em_execucao' };

  if (!forcar && sincronizacaoBloqueada()) {
    return { sucesso: false, motivo: 'bloqueado_tempo' };
  }

  syncEmAndamento = true;
  registrarSincronizacao();

  try {
    if (!navigator.onLine) {
      throw new Error('OFFLINE');
    }

    let gistId = perfil.gistId;
    if (!gistId) {
      gistId = await obterOuCriarGistId(perfil.githubToken);
      perfil.gistId = gistId;
      await salvarPerfilDB(perfil, false);
    }

    const response = await fetch(`https://api.github.com/gists/${gistId}`, {
      headers: {
        'Authorization': `Bearer ${perfil.githubToken}`,
        'Accept': 'application/vnd.github+json'
      }
    });

    if (response.status === 403 || response.status === 429) {
      throw new Error('RATE_LIMIT');
    }

    if (!response.ok) throw new Error('ERRO_CONEXAO');

    const gist = await response.json();
    const conteudoTexto = gist.files[GIST_FILENAME]?.content;

    if (!conteudoTexto) {
      await sincronizarUploadGithub(true, true);
    } else {
      const dadosRemotos = JSON.parse(conteudoTexto);

      // 1. MESCLA NO INDEXEDDB
      await importarDadosDB(dadosRemotos, true);

      // 2. ENVIA DE VOLTA A VERSÃO UNIFICADA (SILENCIOSO)
      await sincronizarUploadGithub(true, true);
    }

    // 3. APENAS 1 NOTIFICAÇÃO DE SUCESSO
    await adicionarNotificacao({
      titulo: 'Sincronização Concluída',
      mensagem: 'Seus dados foram atualizados e salvos com sucesso na nuvem.',
      tipo: 'sucesso'
    });

    // 4. RE-RENDERIZA A INTERFACE SOMENTE APÓS O PROCESSO ESTAR 100% FINALIZADO
    notificarAtualizacaoDados();

    return { sucesso: true };

  } catch (erro) {
    console.error('❌ [Sync Engine Error]:', erro);

    let mensagemErro = 'Falha ao conectar com a nuvem. Tentando novamente em 5 minutos.';

    if (erro.message === 'RATE_LIMIT') {
      mensagemErro = 'Limite de requisições do GitHub atingido. Nova tentativa em 5 minutos.';
    } else if (erro.message === 'OFFLINE' || !navigator.onLine) {
      mensagemErro = 'Sem conexão com a internet. Seus dados locais estão salvos.';
    }

    await adicionarNotificacao({
      titulo: 'Sincronização Indisponível',
      mensagem: mensagemErro,
      tipo: 'alerta'
    });

    agendarReSincronizacaoCincoMinutos();
    return { sucesso: false, erro: erro.message };

  } finally {
    syncEmAndamento = false;
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
