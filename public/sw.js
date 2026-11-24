// No se cachean páginas privadas, respuestas API ni documentos fiscales.
self.addEventListener('install',event=>{event.waitUntil(caches.open('instala-shell-v2').then(cache=>cache.add('/offline.html')));self.skipWaiting()});
self.addEventListener('activate',event=>event.waitUntil(Promise.all([caches.delete('instala-shell-v1'),self.clients.claim()])));
self.addEventListener('fetch',event=>{
  if(event.request.mode!=='navigate')return;
  event.respondWith(fetch(event.request).then(response=>{
    if(response.status===401 && new URL(event.request.url).pathname!=='/login')return Response.redirect(new URL('/login',self.location.origin));
    return response;
  }).catch(()=>caches.match('/offline.html')));
});
