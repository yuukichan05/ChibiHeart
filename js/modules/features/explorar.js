import { obterInfoCompleta } from '../database/repository.js';

const cardObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    const card = entry.target;
    const img = card.querySelector('img');

    if (!img) return;

    if (entry.isIntersecting) {
      const urlCapa = img.dataset.src;
      if (urlCapa && !img.src) {
        const imgBuffer = new Image();
        imgBuffer.src = urlCapa;
        imgBuffer.onload = () => {
          if (card.parentElement) {
            img.src = urlCapa;
            img.classList.add('loaded');
          }
        };
        imgBuffer.onerror = () => {
          img.removeAttribute('src');
          img.classList.remove('loaded');
        };
      }
    } else {
      if (img.src) {
        img.dataset.src = img.src;
        img.removeAttribute('src');
        img.classList.remove('loaded');
      }
    }
  });
}, {
  root: null,
  rootMargin: '300px 0px',
  threshold: 0
});

let dadosAnimes = null;
let filtrosInicializados = false;

// Estado local dos filtros ativos
const filtrosAtivos = {
  genero: 'todos',
  temporada: 'todos',
  ano: 'todos'
};

// Armazenamento das opções extraídas do banco
const opcoesDisponiveis = {
  genero: [],
  temporada: [],
  ano: []
};

// Mapeamento e ordem das temporadas
const MAPA_TEMPORADAS = {
  spring: 'Primavera',
  summer: 'Verão',
  fall: 'Outono',
  winter: 'Inverno'
};

const ORDEM_TEMPORADAS = ['winter', 'spring', 'summer', 'fall'];

function criarElementoCard(animeId, anime, modelo) {
  const clone = modelo.content.cloneNode(true);
  const linkCard = clone.querySelector("a");
  const imgCard = clone.querySelector("img");
  const tituloCard = clone.querySelector(".card-title");

  if (linkCard && imgCard && tituloCard) {
    linkCard.href = `#info?anime=${animeId}`;
    tituloCard.textContent = anime.titulo || animeId;
    imgCard.alt = `Capa de ${anime.titulo || animeId}`;
    
    imgCard.dataset.src = anime.poster || anime.banner || "";
    imgCard.removeAttribute("src");

    cardObserver.observe(linkCard);
  }

  return clone;
}

function popularOpcoesFiltro(animes) {
  const generosSet = new Set();
  const temporadasSet = new Set();
  const anosSet = new Set();

  Object.values(animes).forEach(anime => {
    if (Array.isArray(anime.generos)) {
      anime.generos.forEach(g => {
        if (g && typeof g === 'string') generosSet.add(g.trim());
      });
    }
    if (anime.temporada && typeof anime.temporada === 'string') {
      temporadasSet.add(anime.temporada.toLowerCase().trim());
    }
    if (anime.ano) {
      anosSet.add(String(anime.ano).trim());
    }
  });

  opcoesDisponiveis.genero = [
    { valor: 'todos', rotulo: 'Todos os Gêneros' },
    ...Array.from(generosSet)
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .map(g => ({ valor: g, rotulo: g }))
  ];

  opcoesDisponiveis.temporada = [
    { valor: 'todos', rotulo: 'Todas as Temporadas' },
    ...Array.from(temporadasSet)
      .sort((a, b) => {
        const idxA = ORDEM_TEMPORADAS.indexOf(a);
        const idxB = ORDEM_TEMPORADAS.indexOf(b);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        return a.localeCompare(b);
      })
      .map(t => ({
        valor: t,
        rotulo: MAPA_TEMPORADAS[t] || (t.charAt(0).toUpperCase() + t.slice(1))
      }))
  ];

  opcoesDisponiveis.ano = [
    { valor: 'todos', rotulo: 'Todos os Anos' },
    ...Array.from(anosSet)
      .sort((a, b) => Number(b) - Number(a))
      .map(a => ({ valor: a, rotulo: a }))
  ];
}

function abrirModalFiltro(tipo) {
  const modalOverlay = document.getElementById('modal-filtro-overlay');
  const modalTitulo = document.getElementById('modal-filtro-titulo');
  const modalOpcoes = document.getElementById('modal-filtro-opcoes');

  if (!modalOverlay || !modalTitulo || !modalOpcoes) return;

  const titulos = {
    genero: 'Selecionar Gênero',
    temporada: 'Selecionar Temporada',
    ano: 'Selecionar Ano'
  };

  modalTitulo.textContent = titulos[tipo] || 'Selecionar Filtro';
  modalOpcoes.innerHTML = '';

  const listaOpcoes = opcoesDisponiveis[tipo] || [];
  const valorAtual = filtrosAtivos[tipo];

  listaOpcoes.forEach(opcao => {
    const btnOpcao = document.createElement('button');
    btnOpcao.type = 'button';
    btnOpcao.className = `opcao-item ${opcao.valor === valorAtual ? 'selecionado' : ''}`;
    
    btnOpcao.innerHTML = `
      <span>${opcao.rotulo}</span>
      <span class="material-symbols-outlined icone-check">check</span>
    `;

    btnOpcao.addEventListener('click', () => {
      selecionarFiltro(tipo, opcao.valor, opcao.rotulo);
      fecharModalFiltro();
    });

    modalOpcoes.appendChild(btnOpcao);
  });

  modalOverlay.classList.remove('hidden');
  modalOverlay.setAttribute('aria-hidden', 'false');
}

function fecharModalFiltro() {
  const modalOverlay = document.getElementById('modal-filtro-overlay');
  if (modalOverlay) {
    modalOverlay.classList.add('hidden');
    modalOverlay.setAttribute('aria-hidden', 'true');
  }
}

function selecionarFiltro(tipo, valor, rotulo) {
  filtrosAtivos[tipo] = valor;

  const rotuloElem = document.getElementById(`rotulo-filtro-${tipo}`);
  if (rotuloElem) {
    rotuloElem.textContent = rotulo;
  }

  aplicarFiltros();
}

function aplicarFiltros() {
  const grade = document.getElementById('grade-explorar');
  const modelo = document.getElementById('modelo-card-anime');

  if (!grade || !modelo || !dadosAnimes) return;

  grade.replaceChildren();

  const animesFiltrados = Object.entries(dadosAnimes).filter(([_, anime]) => {
    const atendeGenero = filtrosAtivos.genero === 'todos' || 
      (Array.isArray(anime.generos) && anime.generos.includes(filtrosAtivos.genero));

    const atendeTemporada = filtrosAtivos.temporada === 'todos' || 
      (anime.temporada && anime.temporada.toLowerCase() === filtrosAtivos.temporada.toLowerCase());

    const atendeAno = filtrosAtivos.ano === 'todos' || 
      String(anime.ano) === String(filtrosAtivos.ano);

    return atendeGenero && atendeTemporada && atendeAno;
  });

  if (animesFiltrados.length === 0) {
    grade.innerHTML = `<p class="mensagem-vazia">Nenhum anime encontrado com os filtros selecionados.</p>`;
    return;
  }

  animesFiltrados.forEach(([animeId, anime]) => {
    grade.appendChild(criarElementoCard(animeId, anime, modelo));
  });
}

function configurarEventosModal() {
  const btnGenero = document.getElementById('btn-filtro-genero');
  const btnTemporada = document.getElementById('btn-filtro-temporada');
  const btnAno = document.getElementById('btn-filtro-ano');
  const btnFechar = document.getElementById('btn-fechar-modal-filtro');
  const modalOverlay = document.getElementById('modal-filtro-overlay');

  btnGenero?.addEventListener('click', () => abrirModalFiltro('genero'));
  btnTemporada?.addEventListener('click', () => abrirModalFiltro('temporada'));
  btnAno?.addEventListener('click', () => abrirModalFiltro('ano'));

  btnFechar?.addEventListener('click', fecharModalFiltro);

  modalOverlay?.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
      fecharModalFiltro();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalOverlay && !modalOverlay.classList.contains('hidden')) {
      fecharModalFiltro();
    }
  });
}

export async function gerenciarTelaExplorar() {
  if (!dadosAnimes) {
    dadosAnimes = await obterInfoCompleta();
  }

  if (!dadosAnimes) return;

  if (!filtrosInicializados) {
    popularOpcoesFiltro(dadosAnimes);
    configurarEventosModal();
    filtrosInicializados = true;
  }

  aplicarFiltros();
}
