const CLOUD_DB_VERSION = '20260805-15';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.endsWith('.html')) {
    return;
  }

  event.respondWith((async () => {
    const freshUrl = new URL(request.url);
    freshUrl.searchParams.set('_cloudv', CLOUD_DB_VERSION);

    const response = await fetch(freshUrl.toString(), {
      cache: 'no-store',
      credentials: 'same-origin',
      redirect: 'follow',
    });

    if (!response.ok) return response;

    let html = await response.text();

    // The legacy admin page starts rendering from native localStorage through
    // its body onload handler. Remove that handler to prevent it racing with
    // the Supabase load and restoring stale/default customers.
    html = html.replace(/<body\s+onload=(['"])[\s\S]*?\1\s*>/i, '<body>');

    // Delay legacy inline scripts that access localStorage until db.js has
    // replaced it with the cloud-backed storage adapter.
    html = html.replace(
      /<script(?![^>]*\bsrc=)(?![^>]*type=["']module["'])[^>]*>([\s\S]*?localStorage[\s\S]*?)<\/script>/gi,
      (_, code) => `<script>window.cloudDbReady.then(function(){(0,eval)(${JSON.stringify(code)});});<\/script>`,
    );

    const bootstrap =
      '<script data-cloud-db="ready" src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"><\/script>' +
      `<script src="js/db.js?v=${CLOUD_DB_VERSION}"><\/script>` +
      `<script src="js/customer-view-fix.js?v=${CLOUD_DB_VERSION}"><\/script>` +
      `<script src="js/customer-account-admin.js?v=${CLOUD_DB_VERSION}"><\/script>` +
      `<script src="js/index-auth-fix.js?v=${CLOUD_DB_VERSION}"><\/script>`;

    // Initialise visible admin sections only after the latest Supabase SELECTs
    // and all wrapped legacy functions are ready. Do not run
    // initDefaultCustomers(); Supabase is the only source of truth.
    const cloudAdminInit = `<script data-cloud-admin-init="${CLOUD_DB_VERSION}">
      window.cloudDbReady.then(async function () {
        if (window.cloudDb && typeof window.cloudDb.reload === 'function') {
          await window.cloudDb.reload();
        }
        const names = [
          'loadAdminOrders','loadPricingSettings','loadWhatsappSettings',
          'loadEmployees','loadDelivery','loadBaseCurrency','loadCurrencies',
          'loadStoresAdmin','loadCustomers'
        ];
        for (const name of names) {
          if (typeof window[name] === 'function') {
            try { window[name](); } catch (error) { console.error('[Cloud Admin Init]', name, error); }
          }
        }
      }).catch(function (error) {
        console.error('[Cloud Admin Init] Failed:', error);
      });
    <\/script>`;

    // Always replace older injected assets and initialisers.
    html = html.replace(/<script data-cloud-db="ready"[\s\S]*?<script src="js\/index-auth-fix\.js\?v=[^"]+"><\/script>/i, '');
    html = html.replace(/<script data-cloud-admin-init="[^"]+">[\s\S]*?<\/script>/i, '');

    html = html.includes('</head>')
      ? html.replace('</head>', bootstrap + '</head>')
      : bootstrap + html;

    if (url.pathname.endsWith('/admin-dashboard.html') || url.pathname.endsWith('admin-dashboard.html')) {
      html = html.includes('</body>')
        ? html.replace('</body>', cloudAdminInit + '</body>')
        : html + cloudAdminInit;
    }

    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    headers.set('Pragma', 'no-cache');
    headers.set('Expires', '0');

    return new Response(html, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  })());
});
