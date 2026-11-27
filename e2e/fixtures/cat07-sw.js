// This worker controls only local preview pages. It never proxies private data.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
let allowed;
const manifest=()=>allowed||=fetch('/__fixture/cat07/product').then(response=>{if(!response.ok)throw Error('Fixture unavailable');return response.json();}).then(product=>new Map(product.cat07Family.views.map(view=>[view.image.url,view.id])));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(url.origin!==self.location.origin)event.respondWith(manifest().then(map=>map.has(url.href)?fetch('/__fixture/cat07/image/'+map.get(url.href)):Response.error()).catch(()=>Response.error()));
});
