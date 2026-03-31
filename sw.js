const CACHE_NAME = "checkly-v1";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/app.js",
  "/style.css",
  "/icon-192.png",
  "/icon-512.png",
  "/manifest.json"
];

// 安装：缓存所有静态资源
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// 激活：清除旧缓存
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// 请求拦截：AI API 走网络，其余走缓存优先
self.addEventListener("fetch", event => {
  const url = event.request.url;

  // DeepSeek AI 请求始终走网络（不缓存）
  if (url.includes("deepseek.com")) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 静态资源：缓存优先，缓存不命中时再去网络
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // 只缓存同源、成功的响应
        if (!response || response.status !== 200 || response.type !== "basic") {
          return response;
        }
        const toCache = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, toCache));
        return response;
      });
    })
  );
});
