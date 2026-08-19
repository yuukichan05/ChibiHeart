const CACHE_NAME = 'chibiheart-v3'; // Incrementado para v3 para forçar a limpeza do lixo em disco

// Arquivos para guardar em cache estático
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  
  // CSS
  './css/main.css',
  './css/modules/trakt.css',
  './css/modules/player.css',
  './css/modules/views.css',
  './css/modules/perfil.css',

  // JSON
  './dados/info.json',

  // JS
  './js/main.js',
  './js/modules/db.js',
  './js/modules/info.js',
  './js/modules/perfil.js',
  './js/modules/inicio.js',
  './js/modules/pesquisa.js',
  './js/modules/playerView.js',
  './js/modules/repository.js',
  './js/modules/historico.js'
  './js/modules/continuarAssistindo.js',

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
      console.log('[SW] Cache v3: Guardando arquivos atualizados...');
      return Promise.all(
        ASSETS_TO_CACHE.map(url => {
          return cache.add(url).catch(err => console.error(`[SW] Erro ao cachear: ${url}`, err));
        })
      );
    })
  );
  self.skipWaiting();
});

// Ativação e limpeza de caches antigas (v1 e v2 serão apagadas aqui)
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

  // 1. Ignora requisições que não sejam HTTP/HTTPS
  if (!url.startsWith('http')) return;

  // 2. REGRA DE SEGURANÇA PARA MÍDIA (VÍDEOS E AUDIOS)
  // Deixa o navegador processar os vídeos sem interceptação ou cache
  const isVideo = req.headers.get('range') || 
                  url.match(/\.(mp4|webm|m3u8|ts|m4s)(\?.*)?$/i) ||
                  req.destination === 'video' ||
                  req.destination === 'audio';

  if (isVideo) {
    return; // Passa direto para o navegador lidar nativamente
  }

  // 3. Estratégia Network First com Fallback para Cache (apenas para arquivos leves)
  event.respondWith(
    fetch(req)
      .then((response) => {
        // Apenas faz cache se a resposta for válida e for um método GET
        if (req.method === 'GET' && response.status === 200 && response.type === 'basic') {
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
