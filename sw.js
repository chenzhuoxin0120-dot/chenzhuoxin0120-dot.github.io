// sw.js v3 — 清除所有旧缓存，改为纯网络直通模式
// 每次上传新文件到 GitHub 后，浏览器会自动拉取最新版本，不再卡在旧缓存

self.addEventListener("install", event => {
  // 安装时立刻清空所有旧缓存（包括 v1、v2）
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.skipWaiting()) // 不等待旧 SW 关闭，立刻接管
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    self.clients.claim().then(() => {
      // 接管所有已打开的标签页并强制刷新，让用户立即看到最新版本
      return self.clients.matchAll({ type: "window" }).then(clients => {
        clients.forEach(client => {
          if ("navigate" in client) client.navigate(client.url);
        });
      });
    })
  );
});

// 所有请求直接走网络，不做任何缓存
// 好处：以后每次更新上传 GitHub，刷新即生效
self.addEventListener("fetch", event => {
  if (!event.request.url.startsWith("http")) return;
  event.respondWith(fetch(event.request));
});
