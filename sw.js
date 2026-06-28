const CACHE_NAME = 'pilgrimage-2026-v2';

// 오프라인에서도 작동할 핵심 파일들
const CORE_ASSETS = [
  '/pilgrimage-2026/',
  '/pilgrimage-2026/index.html',
  '/pilgrimage-2026/manifest.json',
  '/pilgrimage-2026/icon-192.png',
  '/pilgrimage-2026/icon-512.png',
  '/pilgrimage-2026/apple-touch-icon.png',
  // Leaflet 라이브러리
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  // 폰트
  'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap',
];

// ===== 설치: 핵심 파일 캐시 =====
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] 핵심 파일 캐싱 중...');
      return cache.addAll(CORE_ASSETS).catch(err => {
        console.warn('[SW] 일부 파일 캐싱 실패 (무시):', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ===== 활성화: 오래된 캐시 삭제 =====
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME)
            .map(key => {
              console.log('[SW] 오래된 캐시 삭제:', key);
              return caches.delete(key);
            })
      )
    ).then(() => self.clients.claim())
  );
});

// ===== 네트워크 요청 처리 =====
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 지도 타일: 네트워크 우선, 실패 시 캐시
  if (url.hostname.includes('carto') || url.hostname.includes('tile')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 사진 파일: 캐시 우선, 없으면 네트워크
  if (url.hostname.includes('githubusercontent')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        }).catch(() => new Response('', { status: 408 }));
      })
    );
    return;
  }

  // 나머지: 캐시 우선, 없으면 네트워크
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // 오프라인 + 캐시 없음 → index.html 반환
        if (event.request.destination === 'document') {
          return caches.match('/pilgrimage-2026/index.html');
        }
      });
    })
  );
});
