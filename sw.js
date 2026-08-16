const CACHE_NAME = 'chibiheart-v2'; // Incrementado para v2 para limpar o lixo da v1

// Arquivos para guardar em cache estático (Caminhos atualizados conforme seu tree)
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  
  // CSS - Estrutura nova
  './css/main.css',
  './css/modules/base.css',
  './css/modules/componentes.css',
  './css/modules/layout.css',
  './css/modules/player.css',
  './css/modules/views.css',

  // JSON - Pasta dados/
  './dados/add_recent.json',
  './dados/destaque_principal_card.json',
  './dados/hero_banner.json',
  './dados/info.json',
  './dados/novos_episodios.json',

  // JS - Estrutura nova
  './js/main.js',
  './js/modules/db.js',
  './js/modules/info.js',
  './js/modules/inicio.js',
  './js/modules/pesquisa.js',
  './js/modules/playerView.js',
  './js/modules/repository.js',

  // Imagens (Ícones PWA)
  './imagem/icon_solid_192.png',
  './imagem/icon_solid_512.png',
  './imagem/icon_transparent_192.png',
  './imagem/icon_transparent_512.png'
];

// Instalação do Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Cache v2: Guardando arquivos atualizados...');
      // Usamos map para capturar erros individuais se um arquivo falhar
      return Promise.all(
        ASSETS_TO_CACHE.map(url => {
          return cache.add(url).catch(err => console.error(`[SW] Erro ao cachear: ${url}`, err));
        })
      );
    })
  );
  self.skipWaiting();
});

// Ativação e limpeza de caches antigas (v1 será apagada aqui)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[SW] Apagando cache antiga (v1):', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Interceptação de requisições (Network First com Fallback para Cache)
self.addEventListener('fetch', (event) => {
  // Ignora requisições de extensões ou esquemas que não sejam http/https
  if (!(event.request.url.indexOf('http') === 0)) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
