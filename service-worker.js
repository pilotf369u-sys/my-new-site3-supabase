const CLOUD_DB_VERSION = '20260805-4';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    !url.pathname.endsWith('.html')
  ) {
    return;
  }

  event.respondWith(
    fetch(request, { cache: 'no-store' }).then(async response => {
      if (!response.ok) return response;

      let html = await response.text();
      if (html.includes('data-cloud-db="ready"')) {
        return new Response(html, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      }

      html = html.replace(
        /<script(?![^>]*\bsrc=)(?![^>]*type=["']module["'])[^>]*>([\s\S]*?localStorage[\s\S]*?)<\/script>/gi,
        (_, code) =>
          `<script>window.cloudDbReady.then(function(){(0,eval)(${JSON.stringify(
            code,
          )});});<\/script>`,
      );

      const bootstrap =
        '<script data-cloud-db="ready" src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"><\/script>' +
        `<script src="js/db.js?v=${CLOUD_DB_VERSION}"><\/script>` +
        `<script src="js/customer-view-fix.js?v=${CLOUD_DB_VERSION}"><\/script>`;

      html = html.includes('</head>')
        ? html.replace('</head>', bootstrap + '</head>')
        : bootstrap + html;

      return new Response(html, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }),
  );
});
