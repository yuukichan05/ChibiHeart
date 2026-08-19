// js/modules/perfil.js

import {
  buscarPerfilDB,
  salvarPerfilDB,
  limparTudoDB,
  exportarDadosDB,
  importarDadosDB
} from './db.js';

/**
 * Sincroniza a interface (Header e Tela de Perfil) com o banco IndexedDB
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
}

/* ==========================================================================
   FUNÇÕES AUXILIARES DE MODAIS E BACKUP
   ========================================================================== */

async function executarExportacao() {
  try {
    const dados = await exportarDadosDB();
    const jsonString = JSON.stringify(dados, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const dataFormatada = new Date().toISOString().slice(0, 10);
    const linkDownload = document.createElement('a');
    linkDownload.href = url;
    linkDownload.download = `chibiheart_backup_${dataFormatada}.json`;
    linkDownload.click();

    URL.revokeObjectURL(url);
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

/**
 * Configura os ouvintes de eventos do perfil
 */
export function inicializarPerfil() {
  atualizarInterfacePerfil();

  // 1. Alterar Foto de Perfil
  const inputFoto = document.getElementById('input-foto-perfil');
  if (inputFoto) {
    inputFoto.addEventListener('change', (event) => {
      const arquivo = event.target.files?.[0];
      if (!arquivo) return;

      const reader = new FileReader();
      reader.onload = async (e) => {
        const fotoBase64 = e.target?.result;
        if (fotoBase64) {
          const perfil = await buscarPerfilDB();
          perfil.foto = fotoBase64;
          await salvarPerfilDB(perfil);
          await atualizarInterfacePerfil();
        }
      };
      reader.readAsDataURL(arquivo);
    });
  }

  // 2. Exportar Dados (Ação Direta)
  const btnExportar = document.getElementById('btn-exportar-dados');
  if (btnExportar) {
    btnExportar.addEventListener('click', () => executarExportacao());
  }

  // 3. Restaurar Dados
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

          const sucesso = await importarDadosDB(conteudo);

          if (sucesso) {
            await atualizarInterfacePerfil();
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
        const perfil = await buscarPerfilDB();
        perfil.nome = novoNome;
        await salvarPerfilDB(perfil);
        await atualizarInterfacePerfil();
        fecharModal('modal-editar-nome');
      }
    });
  }

  // 5. Fluxo Customizado de Logout (Sair da Conta)
  const btnLogout = document.querySelector('.opcao-item.logout');
  const btnFecharAlerta = document.getElementById('btn-fechar-modal-alerta');
  const btnJaFizBackup = document.getElementById('btn-ja-fiz-backup');
  const btnFazerBackupAgora = document.getElementById('btn-fazer-backup-agora');
  const btnCancelarLogout = document.getElementById('btn-cancelar-logout');
  const btnConfirmarLogout = document.getElementById('btn-confirmar-logout');

  // Clicar em "Sair da Conta" -> Abre Modal 1 (Recomendação Backup)
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      abrirModal('modal-alerta-backup');
    });
  }

  if (btnFecharAlerta) {
    btnFecharAlerta.addEventListener('click', () => fecharModal('modal-alerta-backup'));
  }

  // "Já fiz backup, prosseguir" -> Fecha Modal 1 e Abre Modal 2 (Confirmação)
  if (btnJaFizBackup) {
    btnJaFizBackup.addEventListener('click', () => {
      fecharModal('modal-alerta-backup');
      abrirModal('modal-confirmar-logout');
    });
  }

  // "Fazer backup agora" -> Faz download do JSON -> Fecha Modal 1 e Abre Modal 2
  if (btnFazerBackupAgora) {
    btnFazerBackupAgora.addEventListener('click', async () => {
      await executarExportacao();
      fecharModal('modal-alerta-backup');
      abrirModal('modal-confirmar-logout');
    });
  }

  // Modal 2: "Não" -> Cancela e fecha o modal
  if (btnCancelarLogout) {
    btnCancelarLogout.addEventListener('click', () => fecharModal('modal-confirmar-logout'));
  }

  // Modal 2: "Sim, sair" -> Executa a limpeza do IndexedDB e desloga
  if (btnConfirmarLogout) {
    btnConfirmarLogout.addEventListener('click', async () => {
      await limparTudoDB();
      await atualizarInterfacePerfil();
      fecharModal('modal-confirmar-logout');
      window.location.hash = '#inicio';
    });
  }
}

/**
 * Executado quando a rota #perfil é aberta
 */
export async function gerenciarTelaPerfil() {
  await atualizarInterfacePerfil();
}
