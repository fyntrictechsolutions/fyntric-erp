// Service worker for the installed app. It caches nothing: every page and all data come live from the
// network, so nobody ever sees stale numbers. Its only job is a friendly page when the phone is offline.
const OFFLINE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline · Fyntric ERP</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#f3f6fb;color:#0b1033;text-align:center;padding:24px}
@media(prefers-color-scheme:dark){body{background:#04051a;color:#e8ebff}}button{margin-top:16px;padding:10px 18px;border:0;border-radius:10px;background:#0b5bd3;color:#fff;font-size:15px}</style></head>
<body><div><h1 style="font-size:20px">You're offline</h1><p>Fyntric ERP needs an internet connection. Check your connection and try again.</p><button onclick="location.reload()">Try again</button></div></body></html>`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(() => new Response(OFFLINE, { headers: { "Content-Type": "text/html; charset=utf-8" } })));
});
