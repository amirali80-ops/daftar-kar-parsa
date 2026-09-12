const CACHE_NAME = 'daftar-kar-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];
// این دو فایل حیاتی‌اند: بدون این‌ها برنامه اصلاً باز نمی‌شود.
// اگر این دو کش نشوند، نصب/آپدیت را باید fail کنیم و روی نسخه قدیمی بمانیم،
// نه اینکه کش قدیمی را پاک کنیم و یک کش خالی/ناقص جایگزینش شود.
const CRITICAL_SHELL = ['./index.html', './manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // فایل‌های غیرحیاتی (آیکون‌ها): تلاش می‌کنیم کش شوند، ولی اگر یکی‌شان
      // شکست بخورد کل نصب را fail نمی‌کنیم.
      const nonCritical = APP_SHELL.filter((url) => !CRITICAL_SHELL.includes(url));
      await Promise.all(
        nonCritical.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('cache add failed for', url, err);
          })
        )
      );
      // فایل‌های حیاتی: اگر هرکدام شکست بخورد، خطا را بالا می‌فرستیم تا کل
      // نصب fail شود؛ مرورگر خودش نسخه قبلی (که هنوز فعال است) را نگه می‌دارد
      // و install جدید را کنار می‌گذارد، پس کاربر همچنان به برنامه دسترسی دارد.
      await Promise.all(CRITICAL_SHELL.map((url) => cache.add(url)));
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // قبل از پاک‌کردن کش‌های قدیمی، مطمئن می‌شویم کش جدید واقعاً
      // فایل‌های حیاتی را دارد. اگر نداشت، کش‌های قدیمی را دست‌نخورده
      // نگه می‌داریم تا کاربر بدون دسترسی نماند.
      const cache = await caches.open(CACHE_NAME);
      const checks = await Promise.all(CRITICAL_SHELL.map((url) => cache.match(url)));
      const newCacheIsUsable = checks.every((res) => !!res);

      if (newCacheIsUsable) {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      } else {
        console.warn('New cache incomplete after activate; keeping old caches as fallback.');
      }

      await self.clients.claim();
    })()
  );
});

// Cache-first for navigation (so the app opens instantly offline, even right
// after install or after being closed for a while), with a background
// refresh from the network to pick up updates when online.
// Cache-first for everything else too (fonts, libs, icons).
self.addEventListener('fetch', (event) => {
  const req = event.request;

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        // ممکن است بعد از یک activate ناقص، هم کش قدیمی هم کش جدید موجود
        // باشند؛ caches.match (بدون مشخص‌کردن cacheName) بین همه کش‌ها
        // می‌گردد، پس هرکدام موجود باشد پیدا می‌شود.
        const cached = await caches.match('./index.html');

        // در پس‌زمینه از شبکه یه نسخه‌ی تازه بگیر و کش رو آپدیت کن،
        // ولی منتظرش نمی‌مونیم — همون کش رو فوری نشون می‌دیم.
        const networkUpdate = fetch(req)
          .then((res) => {
            if (res && res.status === 200) {
              caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', res.clone()));
            }
            return res;
          })
          .catch(() => null);

        if (cached) return cached;
        // اگه به هر دلیلی هنوز چیزی کش نشده (مثلاً همون اولین بارِ نصب)،
        // منتظر شبکه می‌مونیم؛ اگه اونم نبود، پیام خطای ساده نشون می‌دیم.
        return networkUpdate.then((res) => res || new Response(
          '<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="UTF-8"></head><body style="font-family:Tahoma,Arial,sans-serif; text-align:center; padding:60px 20px;"><h2>اتصال اینترنت برقرار نیست</h2><p>برای اولین بار باز کردن برنامه، یک‌بار باید به اینترنت وصل باشی تا فایل‌ها ذخیره بشن. بعد از آن بدون اینترنت هم کار می‌کند.</p></body></html>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        ));
      })()
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && req.method === 'GET') {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
