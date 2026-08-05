const CLOUD_DB_VERSION = '20260805-18';

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
  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.endsWith('.html')) return;

  event.respondWith((async () => {
    const freshUrl = new URL(request.url);
    freshUrl.searchParams.set('_cloudv', CLOUD_DB_VERSION);
    const response = await fetch(freshUrl.toString(), { cache:'no-store', credentials:'same-origin', redirect:'follow' });
    if (!response.ok) return response;
    let html = await response.text();

    html = html.replace(/<body\s+onload=(['"])[\s\S]*?\1\s*>/i, '<body>');
    html = html.replace(/<script(?![^>]*\bsrc=)(?![^>]*type=["']module["'])[^>]*>([\s\S]*?localStorage[\s\S]*?)<\/script>/gi,(_,code)=>`<script>window.cloudDbReady.then(function(){(0,eval)(${JSON.stringify(code)});});<\/script>`);

    const isAdmin = url.pathname.endsWith('/admin-dashboard.html') || url.pathname.endsWith('admin-dashboard.html');
    const bootstrap =
      `<script src="js/cloud-storage-reset.js?v=${CLOUD_DB_VERSION}"><\/script>` +
      '<script data-cloud-db="ready" src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"><\/script>' +
      `<script src="js/db.js?v=${CLOUD_DB_VERSION}"><\/script>` +
      `<script src="js/customer-view-fix.js?v=${CLOUD_DB_VERSION}"><\/script>` +
      `<script src="js/customer-account-admin.js?v=${CLOUD_DB_VERSION}"><\/script>` +
      (isAdmin ? `<script src="js/admin-cloud-render.js?v=${CLOUD_DB_VERSION}"><\/script>` : '') +
      `<script src="js/index-auth-fix.js?v=${CLOUD_DB_VERSION}"><\/script>`;

    html = html.replace(/<script src="js\/cloud-storage-reset\.js\?v=[^"]+"><\/script>/gi,'');
    html = html.replace(/<script data-cloud-db="ready"[\s\S]*?<script src="js\/index-auth-fix\.js\?v=[^"]+"><\/script>/i,'');
    html = html.replace(/<script data-cloud-admin-init="[^"]+">[\s\S]*?<\/script>/gi,'');
    html = html.includes('</head>') ? html.replace('</head>',bootstrap+'</head>') : bootstrap+html;

    const settingsInit = `<script data-cloud-admin-init="${CLOUD_DB_VERSION}">window.cloudDbReady.then(function(){['loadPricingSettings','loadWhatsappSettings','loadEmployees','loadDelivery','loadBaseCurrency','loadCurrencies','loadStoresAdmin'].forEach(function(n){if(typeof window[n]==='function'){try{window[n]();}catch(e){console.error('[Admin Settings Init]',n,e);}}});});<\/script>`;
    if(isAdmin) html = html.includes('</body>') ? html.replace('</body>',settingsInit+'</body>') : html+settingsInit;

    const headers = new Headers(response.headers);
    headers.set('Cache-Control','no-store, no-cache, must-revalidate');
    headers.set('Pragma','no-cache');
    headers.set('Expires','0');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  })());
});
