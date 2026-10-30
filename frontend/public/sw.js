/* Rapidfox Academy service worker.
 * ADR-0024 (PWA): static files only. Never /api/ (answers, scores, notifications), never /media/,
 * never another origin. Pages: network first, offline page when the network is down.
 * Hashed build files (/assets/) and icons: cache first. A new version waits until the page asks
 * (« Nouvelle version disponible »), then takes over.
 * ADR-0023 (Web Push): the push carries no content; the worker reads the user's unread
 * notifications from the API (never cached) and shows the newest. */
const CACHE = "shopflow-static-v1"
const PRECACHE = ["/offline.html", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/favicon.svg"]

function cacheable(url) {
  return url.origin === self.location.origin && !url.pathname.startsWith("/api/") && !url.pathname.startsWith("/media/")
    && !url.pathname.startsWith("/health/")
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)))
})

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key)
    await self.clients.claim()
  })())
})

self.addEventListener("message", (event) => {
  if (event.data === "academy:update") self.skipWaiting()
})

self.addEventListener("fetch", (event) => {
  const request = event.request
  if (request.method !== "GET") return
  const url = new URL(request.url)
  if (!cacheable(url)) return // the browser handles it: no caching at all
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () => (await caches.match("/offline.html")) || Response.error()))
    return
  }
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/")) {
    event.respondWith((async () => {
      const cached = await caches.match(request)
      if (cached) return cached
      const response = await fetch(request)
      if (response.ok) (await caches.open(CACHE)).put(request, response.clone())
      return response
    })())
  }
})

self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    const pages = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
    pages.forEach((page) => page.postMessage("academy:push"))
    let text = "Nouvelle notification"
    try {
      const response = await fetch("/api/v1/notifications?limit=5", { credentials: "same-origin", cache: "no-store" })
      if (response.ok) {
        const feed = await response.json()
        const unread = (feed.items || []).filter((item) => !item.read_at)
        if (unread.length) text = unread.length > 1 ? `${unread[0].text} (+${unread.length - 1})` : unread[0].text
      }
    } catch (error) { /* offline: generic text */ }
    if (pages.some((page) => page.visibilityState === "visible")) return
    await self.registration.showNotification("Rapidfox Academy", { body: text, tag: "academy", icon: "/icons/icon-192.png", badge: "/icons/favicon-16.png" })
  })())
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  event.waitUntil((async () => {
    const pages = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
    if (pages.length) return pages[0].focus()
    return self.clients.openWindow("/")
  })())
})
