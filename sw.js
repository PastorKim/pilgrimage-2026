const CACHE_NAME = 'pilgrimage-2026-v4';
const TILE_CACHE = 'pilgrimage-tiles-v4';   // 지도 타일 전용 (용량 관리)
const PHOTO_CACHE = 'pilgrimage-photos-v4'; // 사진 전용

// 핵심 앱 파일 (항상 캐시)
const CORE_ASSETS = [
  '/pilgrimage-2026/',
  '/pilgrimage-2026/index.html',
  '/pilgrimage-2026/manifest.json',
  '/pilgrimage-2026/icon-192.png',
  '/pilgrimage-2026/icon-512.png',
  '/pilgrimage-2026/apple-touch-icon.png',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap',
];

// 타일 캐시 최대 개수 (용량 제한 - 약 50MB)
const MAX_TILES = 3000;

// ===== 설치 =====
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CORE_ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

// ===== 활성화: 오래된 캐시 정리 =====
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => ![CACHE_NAME, TILE_CACHE, PHOTO_CACHE].includes(key))
            .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ===== 타일 캐시 용량 관리 =====
async function trimTileCache() {
  const cache = await caches.open(TILE_CACHE);
  const keys = await cache.keys();
  if (keys.length > MAX_TILES) {
    // 오래된 타일부터 삭제 (FIFO)
    const toDelete = keys.slice(0, keys.length - MAX_TILES);
    await Promise.all(toDelete.map(k => cache.delete(k)));
  }
}

// ===== 네트워크 요청 처리 =====
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // ① 지도 타일 (CARTO)
  // 전략: 캐시 우선 → 없으면 네트워크 후 캐시 저장
  // → 한 번 본 곳은 오프라인에서도 보임
  if (url.hostname.includes('carto') || url.hostname.includes('basemaps')) {
    event.respondWith(
      caches.open(TILE_CACHE).then(async cache => {
        const cached = await cache.match(event.request);
        if (cached) return cached;

        try {
          const response = await fetch(event.request);
          if (response.ok) {
            cache.put(event.request, response.clone());
            // 용량 초과 시 오래된 타일 정리 (비동기)
            trimTileCache();
          }
          return response;
        } catch {
          // 오프라인 + 캐시 없음 → 투명 PNG 반환 (흰 타일 방지)
          return new Response(
            atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='),
            { headers: { 'Content-Type': 'image/png' } }
          );
        }
      })
    );
    return;
  }

  // ② 사진 파일 (GitHub)
  // 전략: 캐시 우선 → 없으면 네트워크 후 캐시
  if (url.hostname.includes('githubusercontent')) {
    event.respondWith(
      caches.open(PHOTO_CACHE).then(async cache => {
        const cached = await cache.match(event.request);
        if (cached) return cached;

        try {
          const response = await fetch(event.request);
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        } catch {
          return new Response('', { status: 408 });
        }
      })
    );
    return;
  }

  // ③ Leaflet, 폰트 등 외부 라이브러리
  // 전략: 캐시 우선 → 없으면 네트워크 후 캐시
  if (url.hostname.includes('cdnjs') || url.hostname.includes('fonts')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        const cached = await cache.match(event.request);
        if (cached) return cached;

        try {
          const response = await fetch(event.request);
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        } catch {
          return new Response('', { status: 408 });
        }
      })
    );
    return;
  }

  // ④ 앱 파일 (index.html 등)
  // 전략: 네트워크 우선 → 실패 시 캐시 (항상 최신 유지)
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request)
        .then(cached => cached || caches.match('/pilgrimage-2026/index.html'))
      )
  );
});
