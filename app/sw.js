/*
 * Service worker của bản web Cú Pi Math: CHỈ nhận thông báo đẩy và mở đúng màn khi bấm.
 * Không cache gì (không có fetch handler) để bản web mới publish luôn tới ngay. Payload do push-send dựng (webPayload ở src/lib/push-core.ts).
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : '' }; }
  // iOS thu hồi quyền nếu nhận push mà không hiện gì, nên payload hỏng vẫn hiện tin mặc định
  e.waitUntil(self.registration.showNotification(d.title || 'Cú Pi Math', {
    body: d.body || '',
    icon: d.icon || 'icon-192.png',
    badge: 'icon-192.png',
    lang: 'vi',
    tag: 'cupi-push',   // tin mới thay tin cũ chưa đọc, không chồng nhiều tin
    data: { url: d.url || './', logId: d.logId || null },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const { url, logId } = e.notification.data || {};
  const target = new URL(url || './', self.registration.scope);
  if (logId) target.searchParams.set('pl', logId);
  e.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const root = self.registration.scope.replace(/\/$/, '');
    const tab = tabs.find((c) => c.url === root || c.url.startsWith(self.registration.scope));
    if (tab) {
      // app đang mở: nhắn để app tự chuyển màn (listenPushClicks ở src/lib/push.ts), không tải lại trang
      await tab.focus();
      tab.postMessage({ type: 'cupi-push-open', url: target.pathname, logId: logId || null });
      return;
    }
    return self.clients.openWindow(target.href);
  })());
});
