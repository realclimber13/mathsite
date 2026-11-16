importScripts('/controller/controller.sw.js');
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{if($scramjetController.shouldRoute(e))e.respondWith($scramjetController.route(e));});
