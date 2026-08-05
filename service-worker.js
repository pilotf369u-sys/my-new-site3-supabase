self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
  const request=event.request;
  const url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.endsWith('.html')) return;
  event.respondWith(fetch(request).then(async response=>{
    if(!response.ok) return response;
    let html=await response.text();
    if(html.includes('data-cloud-db="ready"')) return new Response(html,response);
    html=html.replace(/<script(?![^>]*\bsrc=)(?![^>]*type=["']module["'])[^>]*>([\s\S]*?localStorage[\s\S]*?)<\/script>/gi,
      (_,code)=>`<script>window.cloudDbReady.then(function(){(0,eval)(${JSON.stringify(code)});});<\/script>`);
    const bootstrap='<script data-cloud-db="ready" src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"><\/script><script src="js/db.js"><\/script>';
    html=html.includes('</head>')?html.replace('</head>',bootstrap+'</head>'):bootstrap+html;
    return new Response(html,{status:response.status,statusText:response.statusText,headers:response.headers});
  }));
});
