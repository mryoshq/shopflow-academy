/* ShopFlow Academy service worker (ADR-0023): Web Push only, no cache, no fetch handler.
 * The push carries no content: the worker reads the user's unread notifications from the API
 * (same origin, session cookie) and shows the newest. Part I (PWA) may add static caching here,
 * never for /api/. */
self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()))

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
    await self.registration.showNotification("ShopFlow Academy", { body: text, tag: "academy", icon: "/icons/icon-192.png", badge: "/icons/favicon-16.png" })
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
