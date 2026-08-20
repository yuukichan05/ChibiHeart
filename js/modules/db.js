// js/modules/db.js

const DB_NAME = "ChibiHeartDB";
const DB_VERSION = 2;
const STORES = {
  PROGRESSO: "progresso",
  PERFIL: "perfil"
};

const GIST_FILENAME = "chibiheart_sync_backup.json";
const GIST_DESCRIPTION = "[ChibiHeart Streaming] Backup Automático de Conta";

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
   MÉTODOS DE PERFIL E CONFIGURAÇÃO
   ========================================================================== */

const PERFIL_KEY = "usuario_atual";

const perfilPadrao = {
  id: PERFIL_KEY,
  nome: "Usuário Chibi",
  email: "usuario@chibiheart.com",
  foto: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSP-d8FnyUc7-qF7238NfPxfjaILuYofuXX40GH3RCUFJES5zDqFP3ptKs&s=10",
  githubToken: "",
  gistId: ""
};

/**
 * Busca os dados do perfil e configurações salvos no IndexedDB
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
 * Salva ou atualiza os dados do perfil/chaves no IndexedDB
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
 * Retorna uma string formatada com Data e Hora para o nome do arquivo de backup
 * Exemplo: 2026-08-20_01-14-05
 */
export function obterDataHoraFormatada() {
  const agora = new Date();
  const pad = (n) => String(n).padStart(2, '0');

  const ano = agora.getFullYear();
  const mes = pad(agora.getMonth() + 1);
  const dia = pad(agora.getDate());
  const horas = pad(agora.getHours());
  const minutos = pad(agora.getMinutes());
  const segundos = pad(agora.getSeconds());

  return `${ano}-${mes}-${dia}_${horas}-${minutos}-${segundos}`;
}

/**
 * Extrai todos os dados garantindo a remoção do token para evitar vazamento
 */
export async function exportarDadosDB() {
  try {
    const db = await abrirBanco();
    const perfilAtual = await buscarPerfilDB();

    // REMOVE O TOKEN E O ID DO GIST ANTES DE GERAR O JSON
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

    return {
      versao: 1,
      exportadoEm: new Date().toISOString(),
      perfil: [perfilSeguro],
      progresso: progressoData
    };
  } catch (erro) {
    console.error("❌ [DB] Erro ao exportar dados:", erro);
    throw erro;
  }
}

/**
 * Importa e sobrescreve as stores de Perfil e Progresso preservando credenciais locais
 */
export async function importarDadosDB(dados) {
  if (!dados || typeof dados !== "object") return false;

  try {
    const db = await abrirBanco();
    const perfilLocalAtual = await buscarPerfilDB();

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
            // Mantém as chaves locais intactas durante a restauração
            githubToken: perfilLocalAtual.githubToken || item.githubToken || "",
            gistId: perfilLocalAtual.gistId || item.gistId || "",
            id: PERFIL_KEY,
            atualizadoEm: Date.now()
          };
          store.put(registro);
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

    return true;
  } catch (erro) {
    console.error("❌ [DB] Erro ao importar dados:", erro);
    return false;
  }
}

/* ==========================================================================
   SINCRONIZAÇÃO VIA GITHUB GIST (API REST)
   ========================================================================== */

/**
 * Busca ou cria o Gist de backup no GitHub
 */
async function obterOuCriarGistId(token) {
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json'
  };

  const responseList = await fetch('https://api.github.com/gists', { headers });
  if (!responseList.ok) throw new Error('Chave Token inválida ou sem permissão de Gist.');

  const gists = await responseList.json();
  const gistExistente = gists.find(g => g.description === GIST_DESCRIPTION || g.files[GIST_FILENAME]);

  if (gistExistente) {
    return gistExistente.id;
  }

  const dadosIniciais = await exportarDadosDB();
  const responseCreate = await fetch('https://api.github.com/gists', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description: GIST_DESCRIPTION,
      public: false,
      files: {
        [GIST_FILENAME]: {
          content: JSON.stringify(dadosIniciais, null, 2)
        }
      }
    })
  });

  if (!responseCreate.ok) throw new Error('Erro ao criar arquivo Gist de sincronização.');
  const novoGist = await responseCreate.json();
  return novoGist.id;
}

/**
 * Envia o backup local atual para o GitHub (Upload)
 */
export async function sincronizarUploadGithub() {
  const perfil = await buscarPerfilDB();
  if (!perfil.githubToken) return { sucesso: false, motivo: 'no_token' };

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
        files: {
          [GIST_FILENAME]: {
            content: JSON.stringify(dadosLocais, null, 2)
          }
        }
      })
    });

    if (!response.ok) throw new Error('Falha ao enviar backup para o GitHub.');
    return { sucesso: true };
  } catch (erro) {
    console.error('❌ [Sync] Erro de Upload:', erro);
    return { sucesso: false, erro: erro.message };
  }
}

/**
 * Baixa o backup do GitHub e restaura localmente (Download)
 */
export async function sincronizarDownloadGithub() {
  const perfil = await buscarPerfilDB();
  if (!perfil.githubToken) return { sucesso: false, motivo: 'no_token' };

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

    if (!response.ok) throw new Error('Erro ao buscar arquivo no GitHub.');

    const gist = await response.json();
    const conteudoTexto = gist.files[GIST_FILENAME]?.content;

    if (conteudoTexto) {
      const dadosRemotos = JSON.parse(conteudoTexto);
      await importarDadosDB(dadosRemotos);
      return { sucesso: true, dados: dadosRemotos };
    }

    return { sucesso: false, erro: 'Conteúdo vazio' };
  } catch (erro) {
    console.error('❌ [Sync] Erro de Download:', erro);
    return { sucesso: false, erro: erro.message };
  }
}

/* ==========================================================================
   MÉTODOS DE PROGRESSO DOS EPISÓDIOS
   ========================================================================== */

export async function salvarProgressoDB(epId, tempo, total) {
  try {
    const db = await abrirBanco();
    const result = await new Promise((resolve, reject) => {
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

    sincronizarUploadGithub().catch(() => {});
    return result;
  } catch (erro) {
    console.error("❌ [DB] Falha ao salvar progresso:", erro);
  }
}

export async function alternarConcluidoDB(epId, concluido = true) {
  try {
    const db = await abrirBanco();
    const result = await new Promise((resolve, reject) => {
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

    sincronizarUploadGithub().catch(() => {});
    return result;
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
