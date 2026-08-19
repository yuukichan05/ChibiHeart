// js/modules/perfil.js

import { buscarPerfilDB, salvarPerfilDB, limparPerfilDB } from './db.js';

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

/**
 * Configura os ouvintes de eventos do perfil (upload de foto, editar nome e logout)
 */
export function inicializarPerfil() {
  // Carrega os dados na tela
  atualizarInterfacePerfil();

  // 1. Alterar Foto de Perfil via Upload
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

  // 2. Ouvintes das opções do perfil
  const opcoesItems = document.querySelectorAll('.perfil-opcoes .opcao-item');
  opcoesItems.forEach((item) => {
    const texto = item.textContent || '';

    // Editar Nome
    if (texto.includes('Editar Nome')) {
      item.addEventListener('click', async () => {
        const perfil = await buscarPerfilDB();
        const novoNome = prompt('Digite seu novo nome:', perfil.nome);

        if (novoNome !== null && novoNome.trim() !== '') {
          perfil.nome = novoNome.trim();
          await salvarPerfilDB(perfil);
          await atualizarInterfacePerfil();
        }
      });
    }

    // Sair da Conta (Logout)
    if (item.classList.contains('logout')) {
      item.addEventListener('click', async () => {
        const confirmou = confirm('Deseja realmente sair da sua conta?');
        if (confirmou) {
          await limparPerfilDB();
          await atualizarInterfacePerfil();
          window.location.hash = '#inicio';
        }
      });
    }
  });
}

/**
 * Executado quando a rota #perfil é aberta
 */
export async function gerenciarTelaPerfil() {
  await atualizarInterfacePerfil();
}
