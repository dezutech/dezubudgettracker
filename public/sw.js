/**
 * Dezu Budget Tracker — Service Worker
 *
 * Caching strategy:
 *   /_next/static/*   → Cache-First  (content-hashed, immutable)
 *   /icons/*          → Cache-First  (stable assets)
 *   /manifest.json    → Cache-First  (stable asset)
 *   HTML navigation   → Network-First → stale cache → app-shell fallback
 *   Everything else   → Stale-While-Revalidate
 *
 * Bump CACHE_VERSION whenever you want users to pick up a fresh cache.
 */

const CACHE_VERSION = 'v4';
const CACHE_NAME    = `dezu-budget-${CACHE_VERSION}`;

/** URLs cached on SW install (app shell). */
const PRECACHE_URLS = [
  '/manifest.json',
  '/icons/icon.svg',
  '/icons/icon-maskable.svg',
  '/icons/apple-touch-icon.svg',
];

const AUTH_PATHS = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/auth',
  '/api/auth',
  '/dashboard',
];

// ─── Install ──────────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  // Take control immediately; don't wait for old SW to die.
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Use allSettled so a single bad URL doesn't abort the whole install.
      Promise.allSettled(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch((err) =>
            console.warn(`[SW] Precache failed for ${url}:`, err)
          )
        )
      )
    )
  );
});

// ─── Activate ─────────────────────────────────────────────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) =>
        Promise.all(
          names
            .filter((n) => n !== CACHE_NAME)
            .map((n) => {
              console.log(`[SW] Deleting old cache: ${n}`);
              return caches.delete(n);
            })
        )
      )
      .then(() => self.clients.claim())
  );
});

// ─── Fetch ────────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET requests over http(s).
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (!url.protocol.startsWith('http')) return;

  // Keep Supabase/auth/network requests out of the app cache entirely.
  if (url.origin !== self.location.origin) return;

  const isAuthRoute = AUTH_PATHS.some((path) =>
    url.pathname === path || url.pathname.startsWith(`${path}/`)
  );

  if (isAuthRoute) return;

  // ── Next.js static chunks (content-hashed → cache forever) ────────────────
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // ── PWA assets (icons, manifest) ──────────────────────────────────────────
  if (
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.json' ||
    url.pathname === '/sw.js'
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // ── HTML page navigation ──────────────────────────────────────────────────
  if (request.mode === 'navigate') {
    event.respondWith(networkOnlyNavigation(request));
    return;
  }

  if (isAuthRoute) return;

  // ── Everything else (fonts, images, API calls) ────────────────────────────
  event.respondWith(staleWhileRevalidate(request));
});

// ─── Strategy helpers ─────────────────────────────────────────────────────────

/**
 * Cache-First: return cached copy instantly; fetch + store if missing.
 */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    console.warn('[SW] cacheFirst fetch failed:', err);
    return new Response('Resource unavailable offline', { status: 408 });
  }
}

/**
 * Network-First for HTML navigation.
 * On failure: serve exact cached page → root shell → error page.
 */
async function networkOnlyNavigation(request) {
  try {
    return await fetch(request);
  } catch {
    return new Response(offlinePage(), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}

/**
 * Stale-While-Revalidate: serve from cache immediately; refresh in background.
 */
async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
      }
      return response;
    })
    .catch(() => cached);

  return cached || fetchPromise;
}

// ─── Offline fallback page ────────────────────────────────────────────────────

function offlinePage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Dezu Budget — Offline</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{
      min-height:100dvh;display:flex;flex-direction:column;
      align-items:center;justify-content:center;gap:16px;
      background:#09090b;color:#f4f4f5;
      font-family:system-ui,-apple-system,sans-serif;
      padding:24px;text-align:center;
    }
    .logo{
      width:64px;height:64px;border-radius:14px;
      background:#10b981;display:flex;align-items:center;justify-content:center;
      font-size:36px;font-weight:900;color:#052e16;
    }
    h1{font-size:1.25rem;font-weight:700;color:#f4f4f5}
    p{font-size:.875rem;color:#71717a;max-width:280px;line-height:1.6}
    button{
      margin-top:8px;padding:10px 24px;border-radius:8px;
      background:#10b981;color:#052e16;font-weight:600;
      font-size:.875rem;border:none;cursor:pointer;
    }
  </style>
</head>
<body>
  <div class="logo">D</div>
  <h1>You're offline</h1>
  <p>Dezu Budget needs a connection to load for the first time. Your data is safe and will be available once you reconnect.</p>
  <button onclick="location.reload()">Try again</button>
</body>
</html>`;
}

// ─── Message handler (skip-waiting from UI) ───────────────────────────────────

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
