// dbSync.js - Exportação, Importação e Sincronização em Nuvem (GitHub Gist)

import { adicionarNotificacao } from '../features/notificacoes.js';
import {
  abrirBanco,
  STORES,
  PERFIL_KEY,
  perfilPadrao,
  buscarPerfilDB,
  salvarPerfilDB,
  buscarNotificacoesDB,
  notificarAtualizacaoDados,
  buscarTodoProgressoListaDB
} from './db.js';

const GIST_FILENAME = "chibiheart_sync_backup.json";
const GIST_DESCRIPTION = "[ChibiHeart Streaming] Backup Automático de Conta";

let timerReSincronizacao = null;

let ultimoSyncTimestamp = 0;
let syncEmAndamento = false;
const SYNC_LOCK_MS = 5 * 1000;

function sincronizacaoBloqueada() {
  const agora = Date.now();
  if (agora - ultimoSyncTimestamp < SYNC_LOCK_MS) {
    console.log(`⏳ [Sync Lock] Aguarde ${SYNC_LOCK_MS / 1000}s entre chamadas.`);
    return true;
  }
  return false;
}

function registrarSincronizacao() {
  ultimoSyncTimestamp = Date.now();
}

export async function obterMaiorTimestampLocal() {
  const perfil = await buscarPerfilDB();
  const progressos = await buscarTodoProgressoListaDB();
  const notificacoes = await buscarNotificacoesDB();

  let maxTs = perfil.atualizadoEm || 0;
  progressos.forEach(p => { if (p.atualizadoEm && p.atualizadoEm > maxTs) maxTs = p.atualizadoEm; });
  notificacoes.forEach(n => { if (n.timestamp && n.timestamp > maxTs) maxTs = n.timestamp; });

  return maxTs;
}

export async function exportarDadosDB() {
  try {
    const db = await abrirBanco();
    const perfilAtual = await buscarPerfilDB();

    const perfilSeguro = { ...perfilAtual, githubToken: "", gistId: "" };

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

async function obterOuCriarGistId(token) {
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json'
  };

  const responseList = await fetch('https://api.github.com/gists', { headers });
  if (responseList.status === 403 || responseList.status === 429) throw new Error('RATE_LIMIT');
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

  timerReSincronizacao = setTimeout(async () => {
    await sincronizarDownloadGithub(true);
  }, 5 * 60 * 1000);
}

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

    if (response.status === 403 || response.status === 429) throw new Error('RATE_LIMIT');
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

export async function sincronizarDownloadGithub(forcar = false) {
  const perfil = await buscarPerfilDB();
  if (!perfil.githubToken) return { sucesso: false, motivo: 'no_token' };

  if (syncEmAndamento) return { sucesso: false, motivo: 'ja_em_execucao' };

  if (!forcar && sincronizacaoBloqueada()) {
    return { sucesso: false, motivo: 'bloqueado_tempo' };
  }

  syncEmAndamento = true;
  registrarSincronizacao();

  try {
    if (!navigator.onLine) throw new Error('OFFLINE');

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

    if (response.status === 403 || response.status === 429) throw new Error('RATE_LIMIT');
    if (!response.ok) throw new Error('ERRO_CONEXAO');

    const gist = await response.json();
    const conteudoTexto = gist.files[GIST_FILENAME]?.content;

    if (!conteudoTexto) {
      await sincronizarUploadGithub(true, true);
    } else {
      const dadosRemotos = JSON.parse(conteudoTexto);
      const tsLocalAntes = await obterMaiorTimestampLocal();
      const tsRemoto = dadosRemotos.timestampModificacao || 0;

      await importarDadosDB(dadosRemotos, true);

      if (tsLocalAntes > tsRemoto) {
        await sincronizarUploadGithub(true, true);
      }
    }

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
