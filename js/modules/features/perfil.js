import {
  buscarPerfilDB,
  salvarPerfilDB,
  sincronizarUploadGithub
} from '../database/db.js';

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

function abrirModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('active');
}

function fecharModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('active');
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
 * Sincroniza a interface com o banco IndexedDB (Atualiza todas as instâncias de avatares)
 */
export async function atualizarInterfacePerfil() {
  const perfil = await buscarPerfilDB();

  // Elementos do Perfil Principal
  const elNome = document.getElementById('perfil-nome');
  const elEmail = document.getElementById('perfil-email');
  const elFoto = document.getElementById('perfil-foto');
  const elHeaderAvatares = document.querySelectorAll('.header-profile-avatar');

  // Elementos da Tela de Configurações
  const elConfigFoto = document.getElementById('config-foto');
  const elConfigNome = document.getElementById('config-nome');
  const elConfigLocalizacao = document.getElementById('config-localizacao');

  if (elNome) elNome.textContent = perfil.nome;
  if (elEmail) elEmail.textContent = perfil.email;

  if (elFoto) {
    elFoto.src = perfil.foto;
    elFoto.classList.add('loaded');
  }

  // Atualização dos elementos da tela de Configurações
  if (elConfigFoto && perfil.foto) {
    elConfigFoto.src = perfil.foto;
    elConfigFoto.classList.add('loaded');
  }

  if (elConfigNome && perfil.nome) {
    elConfigNome.textContent = perfil.nome;
  }

  if (elConfigLocalizacao && perfil.localizacao) {
    elConfigLocalizacao.textContent = perfil.localizacao;
  }

  if (elHeaderAvatares.length > 0) {
    elHeaderAvatares.forEach(avatar => {
      avatar.src = perfil.foto;
      avatar.classList.add('loaded');
    });
  }

  if (perfil.githubToken) {
    atualizarStatusDotGithub('online', 'Conectado e Sincronizado');
  } else {
    atualizarStatusDotGithub('off', 'Desconectado (Nenhuma chave configurada)');
  }

  await atualizarBadgeNotificacao();
}

export function inicializarPerfil() {
  atualizarInterfacePerfil();

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
          atualizarStatusDotGithub('error', resUpload.erro || 'Armazenada localmente (Erro na nuvem)');
        }
      } catch (erro) {
        console.error('Erro ao processar foto:', erro);
        atualizarStatusDotGithub('error', 'Falha ao processar imagem');
      } finally {
        inputFoto.value = '';
      }
    });
  }

  // 2. Modal Editar Nome
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
          atualizarStatusDotGithub('error', resUpload.erro || 'Salvo apenas localmente');
        }
      }
    });
  }
}

export async function gerenciarTelaPerfil() {
  await atualizarInterfacePerfil();
}
