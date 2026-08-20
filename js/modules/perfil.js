import {
  buscarPerfilDB,
  salvarPerfilDB,
  limparTudoDB,
  exportarDadosDB,
  importarDadosDB,
  obterDataHoraFormatada,
  sincronizarDownloadGithub,
  sincronizarUploadGithub
} from './db.js';

import {
  adicionarNotificacao,
  atualizarBadgeNotificacao
} from './notificacoes.js';

/**
 * Redimensiona e comprime imagens de perfil para evitar ultrapassar limites
 */
function comprimirImagemBase64(arquivo, maxLargura = 300, maxAltura = 300, qualidade = 0.85) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.readAsDataURL(arquivo);
    leitor.onload = (evento) => {
      const img = new Image();
      img.src = evento.target?.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let largura = img.width;
        let altura = img.height;

        if (largura > altura) {
          if (largura > maxLargura) {
            altura = Math.round((altura * maxLargura) / largura);
            largura = maxLargura;
          }
        } else {
          if (altura > maxAltura) {
            largura = Math.round((largura * maxAltura) / altura);
            altura = maxAltura;
          }
        }

        canvas.width = largura;
        canvas.height = altura;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, largura, altura);

        resolve(canvas.toDataURL('image/jpeg', qualidade));
      };
      img.onerror = (erro) => reject(erro);
    };
    leitor.onerror = (erro) => reject(erro);
  });
}

/**
 * Atualiza o indicador visual do ponto de status do GitHub
 */
export function atualizarStatusDotGithub(status, mensagem = '') {
  const dot = document.getElementById('github-status-dot');
  if (!dot) return;

  dot.className = `status-dot ${status}`;
  dot.title = mensagem || {
    off: 'Desconectado',
    error: 'Erro de sincronização',
    syncing: 'Sincronizando...',
    online: 'Conectado e Sincronizado'
  }[status];
}

/**
 * Sincroniza a interface com o banco IndexedDB
 */
export async function atualizarInterfacePerfil() {
  const perfil = await buscarPerfilDB();

  const elNome = document.getElementById('perfil-nome');
  const elEmail = document.getElementById('perfil-email');
  const elFoto = document.getElementById('perfil-foto');
  const elHeaderAvatar = document.querySelector('.header-profile-avatar');

  if (elNome) elNome.textContent = perfil.nome;
  if (elEmail) elEmail.textContent = perfil.email;

  if (elFoto) {
    elFoto.src = perfil.foto;
    elFoto.classList.add('loaded');
  }

  if (elHeaderAvatar) {
    elHeaderAvatar.src = perfil.foto;
    elHeaderAvatar.classList.add('loaded');
  }

  if (perfil.githubToken) {
    atualizarStatusDotGithub('online', 'Conectado e Sincronizado');
  } else {
    atualizarStatusDotGithub('off', 'Desconectado (Nenhuma chave configurada)');
  }

  await atualizarBadgeNotificacao();
}

async function executarExportacao() {
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

function abrirModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('active');
}

function fecharModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('active');
}

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
    atualizarStatusDotGithub('error', resDownload.erro || 'Erro ao sincronizar');
  }
}

export function inicializarPerfil() {
  atualizarInterfacePerfil();
  autoSincronizarGithub();

  // 1. Alterar Foto de Perfil
  const inputFoto = document.getElementById('input-foto-perfil');
  if (inputFoto) {
    inputFoto.addEventListener('change', async (event) => {
      const arquivo = event.target.files?.[0];
      if (!arquivo) return;

      try {
        atualizarStatusDotGithub('syncing', 'Otimizando e salvando foto...');
        const fotoBase64 = await comprimirImagemBase64(arquivo);

        const perfil = await buscarPerfilDB();
        perfil.foto = fotoBase64;
        await salvarPerfilDB(perfil, true);

        await adicionarNotificacao({
          titulo: 'Foto Atualizada',
          mensagem: 'Foto de perfil alterada com sucesso.',
          tipo: 'sucesso'
        });

        await atualizarInterfacePerfil();

        atualizarStatusDotGithub('syncing', 'Sincronizando no GitHub...');
        const resUpload = await sincronizarUploadGithub(true);

        if (resUpload.sucesso) {
          atualizarStatusDotGithub('online', 'Foto sincronizada com a nuvem!');
        } else {
          atualizarStatusDotGithub('error', 'Armazenada localmente (Erro ao subir nuvem)');
        }
      } catch (erro) {
        console.error('Erro ao processar foto:', erro);
        atualizarStatusDotGithub('error', 'Falha ao processar imagem');
      } finally {
        inputFoto.value = '';
      }
    });
  }

  // 2. Exportar Dados
  const btnExportar = document.getElementById('btn-exportar-dados');
  if (btnExportar) {
    btnExportar.addEventListener('click', () => executarExportacao());
  }

  // 3. Restaurar Dados de arquivo local
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

  // 4. Modal Editar Nome
  const btnEditarNome = document.getElementById('btn-editar-nome');
  const btnFecharModalNome = document.getElementById('btn-fechar-modal-nome');
  const btnCancelarModalNome = document.getElementById('btn-cancelar-nome');
  const btnSalvarModalNome = document.getElementById('btn-salvar-nome');
  const inputNovoNome = document.getElementById('input-novo-nome');

  if (btnEditarNome) {
    btnEditarNome.addEventListener('click', async () => {
      const perfil = await buscarPerfilDB();
      if (inputNovoNome) inputNovoNome.value = perfil.nome;
      abrirModal('modal-editar-nome');
      setTimeout(() => inputNovoNome?.focus(), 100);
    });
  }

  if (btnFecharModalNome) btnFecharModalNome.addEventListener('click', () => fecharModal('modal-editar-nome'));
  if (btnCancelarModalNome) btnCancelarModalNome.addEventListener('click', () => fecharModal('modal-editar-nome'));

  if (btnSalvarModalNome) {
    btnSalvarModalNome.addEventListener('click', async () => {
      const novoNome = inputNovoNome?.value.trim();
      if (novoNome) {
        atualizarStatusDotGithub('syncing', 'Salvando nome...');
        const perfil = await buscarPerfilDB();
        perfil.nome = novoNome;
        await salvarPerfilDB(perfil, true);

        await adicionarNotificacao({
          titulo: 'Nome de Perfil Alterado',
          mensagem: `Seu nome de usuário foi atualizado para "${novoNome}".`,
          tipo: 'sucesso'
        });

        await atualizarInterfacePerfil();
        fecharModal('modal-editar-nome');

        atualizarStatusDotGithub('syncing', 'Sincronizando nome no GitHub...');
        const resUpload = await sincronizarUploadGithub(true);

        if (resUpload.sucesso) {
          atualizarStatusDotGithub('online', 'Nome sincronizado!');
        } else {
          atualizarStatusDotGithub('error', 'Salvo apenas localmente');
        }
      }
    });
  }

  // 5. Configurar Chave GitHub
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
      
      // Salva sem alterar atualizadoEm artificialmente
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
        atualizarStatusDotGithub('error', 'Token inválido');
        if (msgStatusGithub) {
          msgStatusGithub.textContent = 'Falha ao conectar. Verifique se o token tem permissão de "gist".';
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

  // 6. Fluxo de Logout
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

export async function gerenciarTelaPerfil() {
  await atualizarInterfacePerfil();
  await autoSincronizarGithub();
}
