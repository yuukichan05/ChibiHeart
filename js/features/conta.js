import {
  limparTudoDB,
  exportarDadosDB,
  importarDadosDB,
  obterDataHoraFormatada,
  sincronizarDownloadGithub,
  sincronizarUploadGithub,
  buscarPerfilDB,
  salvarPerfilDB
} from '../data/database/db.js';

import {
  adicionarNotificacao
} from './notificacoes.js';

import {
  atualizarInterfacePerfil,
  atualizarStatusDotGithub
} from './perfil.js';

// Utilitários de Modal internos
function abrirModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('active');
}

function fecharModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('active');
}

/**
 * Exporta os dados da conta em formato JSON
 */
export async function executarExportacao() {
  try {
    const dados = await exportarDadosDB();
    const jsonString = JSON.stringify(dados, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const dataHora = obterDataHoraFormatada();
    const linkDownload = document.createElement('a');
    linkDownload.href = url;
    linkDownload.download = `chibiheart_backup_${dataHora}.json`;
    linkDownload.click();

    URL.revokeObjectURL(url);

    await adicionarNotificacao({
      titulo: 'Backup Local Exportado',
      mensagem: `Arquivo JSON baixado com sucesso (${dataHora}).`,
      tipo: 'sucesso'
    });

    sincronizarUploadGithub().catch(() => {});
    return true;
  } catch (erro) {
    alert('Erro ao exportar os dados da conta.');
    console.error(erro);
    return false;
  }
}

/**
 * Sincroniza dados com a nuvem (GitHub)
 */
export async function autoSincronizarGithub() {
  const perfil = await buscarPerfilDB();
  if (!perfil.githubToken) {
    atualizarStatusDotGithub('off');
    return;
  }

  atualizarStatusDotGithub('syncing', 'Verificando atualizações...');
  const resDownload = await sincronizarDownloadGithub(true);

  if (resDownload.sucesso) {
    await atualizarInterfacePerfil();
    atualizarStatusDotGithub('online', 'Conectado e Sincronizado');
  } else {
    const detalheErro = resDownload.erro || 'Erro ao sincronizar';
    atualizarStatusDotGithub('error', detalheErro);
  }
}

/**
 * Inicializa os ouvintes de evento referentes à conta
 */
export function inicializarConta() {
  // 1. Exportar Dados
  const btnExportar = document.getElementById('btn-exportar-dados');
  if (btnExportar) {
    btnExportar.addEventListener('click', () => executarExportacao());
  }

  // 2. Restaurar Dados
  const btnRestaurar = document.getElementById('btn-restaurar-dados');
  const inputRestaurar = document.getElementById('input-restaurar-dados');

  if (btnRestaurar && inputRestaurar) {
    btnRestaurar.addEventListener('click', () => inputRestaurar.click());

    inputRestaurar.addEventListener('change', (event) => {
      const arquivo = event.target.files?.[0];
      if (!arquivo) return;

      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const conteudo = JSON.parse(e.target?.result);

          if (!conteudo || typeof conteudo !== 'object' || (!conteudo.perfil && !conteudo.progresso)) {
            throw new Error("Arquivo inválido.");
          }

          const sucesso = await importarDadosDB(conteudo, true);

          if (sucesso) {
            await adicionarNotificacao({
              titulo: 'Backup Restaurado',
              mensagem: 'Dados da conta e histórico importados e mesclados com sucesso.',
              tipo: 'sucesso'
            });

            await atualizarInterfacePerfil();
            await sincronizarUploadGithub(true);
            alert('Dados da conta e histórico restaurados com sucesso!');
          }
        } catch (erro) {
          alert('O arquivo selecionado não é um backup válido.');
          console.error(erro);
        } finally {
          inputRestaurar.value = '';
        }
      };
      reader.readAsText(arquivo);
    });
  }

  // 3. Configurar Chave GitHub
  const btnConfigGithub = document.getElementById('btn-config-github');
  const btnFecharModalGithub = document.getElementById('btn-fechar-modal-github');
  const btnCancelarGithub = document.getElementById('btn-cancelar-github');
  const btnSalvarGithub = document.getElementById('btn-salvar-github');
  const btnRemoverGithub = document.getElementById('btn-remover-github-token');
  const inputGithubToken = document.getElementById('input-github-token');
  const msgStatusGithub = document.getElementById('github-modal-msg');

  if (btnConfigGithub) {
    btnConfigGithub.addEventListener('click', async () => {
      const perfil = await buscarPerfilDB();
      if (inputGithubToken) inputGithubToken.value = perfil.githubToken || '';
      if (msgStatusGithub) msgStatusGithub.textContent = '';
      if (btnRemoverGithub) btnRemoverGithub.style.display = perfil.githubToken ? 'block' : 'none';

      abrirModal('modal-github-token');
    });
  }

  if (btnFecharModalGithub) btnFecharModalGithub.addEventListener('click', () => fecharModal('modal-github-token'));
  if (btnCancelarGithub) btnCancelarGithub.addEventListener('click', () => fecharModal('modal-github-token'));

  if (btnSalvarGithub) {
    btnSalvarGithub.addEventListener('click', async () => {
      const token = inputGithubToken?.value.trim();

      if (!token) {
        if (msgStatusGithub) {
          msgStatusGithub.textContent = 'Por favor, digite o token.';
          msgStatusGithub.className = 'modal-msg-status erro';
        }
        return;
      }

      if (msgStatusGithub) {
        msgStatusGithub.textContent = 'Testando conexão e sincronizando...';
        msgStatusGithub.className = 'modal-msg-status info';
      }

      atualizarStatusDotGithub('syncing', 'Conectando...');

      const perfil = await buscarPerfilDB();
      perfil.githubToken = token;
      perfil.gistId = '';
      
      await salvarPerfilDB(perfil, false);

      const resDownload = await sincronizarDownloadGithub(true);

      if (resDownload.sucesso) {
        await adicionarNotificacao({
          titulo: 'GitHub Conectado',
          mensagem: 'Sua conta foi associada e o histórico sincronizado com sucesso.',
          tipo: 'sucesso'
        });

        await atualizarInterfacePerfil();
        atualizarStatusDotGithub('online', 'Sincronizado');
        fecharModal('modal-github-token');
      } else {
        const detalheErro = resDownload.erro || 'Falha ao comunicar com a API';
        atualizarStatusDotGithub('error', detalheErro);
        
        if (msgStatusGithub) {
          msgStatusGithub.textContent = `Erro do sistema: ${detalheErro}`;
          msgStatusGithub.className = 'modal-msg-status erro';
        }
      }
    });
  }

  if (btnRemoverGithub) {
    btnRemoverGithub.addEventListener('click', async () => {
      const perfil = await buscarPerfilDB();
      perfil.githubToken = '';
      perfil.gistId = '';
      await salvarPerfilDB(perfil, false);

      await adicionarNotificacao({
        titulo: 'GitHub Desconectado',
        mensagem: 'A chave de sincronização do GitHub foi removida.',
        tipo: 'alerta'
      });

      await atualizarInterfacePerfil();
      atualizarStatusDotGithub('off');
      fecharModal('modal-github-token');
    });
  }

  // 4. Botão Sincronizar Agora (Manual)
  const btnSincronizarAgora = document.getElementById('btn-sincronizar-agora');
  if (btnSincronizarAgora) {
    btnSincronizarAgora.addEventListener('click', async () => {
      const perfil = await buscarPerfilDB();

      if (!perfil.githubToken) {
        alert('Você precisa configurar seu token do GitHub antes de sincronizar.');
        abrirModal('modal-github-token');
        return;
      }

      atualizarStatusDotGithub('syncing', 'Sincronizando dados...');

      const res = await sincronizarDownloadGithub(true);

      if (res.sucesso) {
        await atualizarInterfacePerfil();
        atualizarStatusDotGithub('online', 'Sincronizado com sucesso');

        await adicionarNotificacao({
          titulo: 'Sincronização Manual',
          mensagem: 'Seus dados foram atualizados com o GitHub.',
          tipo: 'sucesso'
        });
      } else {
        const detalheErro = res.erro || res.motivo || 'Erro ao sincronizar';
        atualizarStatusDotGithub('error', detalheErro);
        alert(`Falha na sincronização: ${detalheErro}`);
      }
    });
  }

  // 5. Fluxo de Logout
  const btnLogout = document.querySelector('.opcao-item.logout');
  const btnFecharAlerta = document.getElementById('btn-fechar-modal-alerta');
  const btnJaFizBackup = document.getElementById('btn-ja-fiz-backup');
  const btnFazerBackupAgora = document.getElementById('btn-fazer-backup-agora');
  const btnCancelarLogout = document.getElementById('btn-cancelar-logout');
  const btnConfirmarLogout = document.getElementById('btn-confirmar-logout');

  if (btnLogout) btnLogout.addEventListener('click', () => abrirModal('modal-alerta-backup'));
  if (btnFecharAlerta) btnFecharAlerta.addEventListener('click', () => fecharModal('modal-alerta-backup'));

  if (btnJaFizBackup) {
    btnJaFizBackup.addEventListener('click', () => {
      fecharModal('modal-alerta-backup');
      abrirModal('modal-confirmar-logout');
    });
  }

  if (btnFazerBackupAgora) {
    btnFazerBackupAgora.addEventListener('click', async () => {
      await executarExportacao();
      fecharModal('modal-alerta-backup');
      abrirModal('modal-confirmar-logout');
    });
  }

  if (btnCancelarLogout) btnCancelarLogout.addEventListener('click', () => fecharModal('modal-confirmar-logout'));

  if (btnConfirmarLogout) {
    btnConfirmarLogout.addEventListener('click', async () => {
      await limparTudoDB();
      await atualizarInterfacePerfil();
      fecharModal('modal-confirmar-logout');
      window.location.hash = '#inicio';
    });
  }
}
