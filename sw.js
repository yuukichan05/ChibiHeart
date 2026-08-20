const CACHE_NAME = 'chibiheart-v9';

// Arquivos para guardar em cache estático (sincronizados com a estrutura do projeto)
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  
  // CSS
  './css/main.css',
  './css/modules/animacoes.css',
  './css/modules/historico.css',
  './css/modules/notifi.css',
  './css/modules/perfil.css',
  './css/modules/pesquisa.css',
  './css/modules/player.css',
  './css/modules/trakt.css',
  './css/modules/views.css',

  // JSON
  './dados/info.json',

  // JS
  './js/main.js',
  './js/modules/continuarAssistindo.js',
  './js/modules/db.js',
  './js/modules/historico.js',
  './js/modules/info.js',
  './js/modules/inicio.js',
  './js/modules/notificacoes.js',
  './js/modules/perfil.js',
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
      console.log('[SW] Cache v9: Guardando arquivos atualizados...');
      return Promise.all(
        ASSETS_TO_CACHE.map(url => {
          return cache.add(url).catch(err => console.error(`[SW] Erro ao cachear: ${url}`, err));
        })
      );
    })
  );
  self.skipWaiting();
});

// Ativação e limpeza de caches antigas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[SW] Apagando cache antiga:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Interceptação de requisições
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = req.url;

  // 1. Ignora requisições não-HTTP/HTTPS
  if (!url.startsWith('http')) return;

  // 2. REGRA DE SEGURANÇA PARA MÍDIA (VÍDEOS E ÁUDIOS)
  const isVideo = req.headers.get('range') || 
                  url.match(/\.(mp4|webm|m3u8|ts|m4s)(\?.*)?$/i) ||
                  req.destination === 'video' ||
                  req.destination === 'audio';

  if (isVideo) {
    return; // Passa direto para a rede sem interceptar
  }

  // 3. Estratégia Network First com fallback para Cache
  event.respondWith(
    fetch(req)
      .then((response) => {
        // Suporte a arquivos locais e capas/thumbs de domínios externos (CORS/opaque)
        const isAllowedType = response.type === 'basic' || response.type === 'cors' || response.type === 'opaque';
        const isValidStatus = response.status === 200 || response.status === 0;

        if (req.method === 'GET' && isValidStatus && isAllowedType) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(req, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(req);
      })
  );
});
